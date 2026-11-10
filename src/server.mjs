import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openStore, settings, updateSettings, root, MAX_UPLOAD } from './store.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
export async function createServer({ store, token = process.env.ADMIN_TOKEN } = {}) {
  store ||= await openStore();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    const body = async limit => {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { const error = new Error('Request is too large.'); error.status = 413; throw error; }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = decodeURIComponent(url.pathname);
      if (route.startsWith('/api/admin')) {
        if (!token || token.length < 32) return json(503, { error: 'Admin is disabled. Configure ADMIN_TOKEN with at least 32 characters.' });
        const provided = Buffer.from(req.headers.authorization || ''); const expected = Buffer.from(`Bearer ${token}`);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return json(401, { error: 'Authentication required.' });
        if (route === '/api/admin/photos' && req.method === 'GET') return json(200, { photos: store.list({ admin: true }) });
        if (route === '/api/admin/photos' && req.method === 'POST') {
          const bytes = await body(MAX_UPLOAD + 64 * 1024);
          const request = new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': req.headers['content-type'] || '' }, body: bytes });
          const form = await request.formData(); const file = form.get('file');
          if (!file || typeof file.arrayBuffer !== 'function') return json(400, { error: 'An image file is required.' });
          const input = {};
          for (const field of ['name', 'location', 'description', 'alt', 'collection', 'date']) if (form.has(field)) input[field] = form.get(field);
          // Uploads always begin as drafts; publishing requires an explicit update.
          return json(201, await store.add(Buffer.from(await file.arrayBuffer()), input));
        }
        const match = route.match(/^\/api\/admin\/photos\/([0-9a-f-]{36})$/);
        if (match && req.method === 'PATCH') {
          const patch = JSON.parse((await body(16 * 1024)).toString());
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json(400, { error: 'Expected a photo object.' });
          const photo = store.update(match[1], patch);
          return json(photo ? 200 : 404, photo || { error: 'Photo not found.' });
        }
        if (route === '/api/admin/settings' && req.method === 'PATCH') {
          const patch = JSON.parse((await body(16 * 1024)).toString());
          if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json(400, { error: 'Expected a settings object.' });
          return json(200, await updateSettings(patch));
        }
        return json(404, { error: 'Route not found.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'Method not allowed.' });
      if (route === '/api/portfolio' || route === '/portfolio.json') return json(200, { settings: await settings(), photos: store.list() });
      if (route === '/api/health') return json(200, { status: 'ok' });
      let file;
      if (route.startsWith('/media/')) {
        const match = route.match(/^\/media\/([0-9a-f-]{36})(-thumb)?\.webp$/);
        if (!match || !store.list().some(photo => photo.id === match[1])) return json(404, { error: 'Image not found.' });
        file = path.join(store.directory, route);
      } else {
        const relative = route === '/' ? 'index.html' : route.slice(1);
        if (relative.includes('\\') || relative.split('/').some(part => part.startsWith('.'))) return json(404, { error: 'Not found.' });
        file = path.resolve(root, 'public', relative);
        if (!file.startsWith(path.join(root, 'public') + path.sep)) return json(404, { error: 'Not found.' });
      }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (['ENOENT', 'EISDIR'].includes(error.code)) return json(404, { error: 'Not found.' });
      if (error instanceof URIError) return json(400, { error: 'Invalid URL.' });
      // Do not return filesystem details or parser internals to visitors.
      json(error.status || 400, { error: error.status === 413 ? 'Request is too large.' : 'Invalid request or image. Check the supplied fields and file.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = await createServer();
  const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 4321);
  server.listen(port, host, () => console.log(`Photography preview: http://${host}:${port}`));
}
