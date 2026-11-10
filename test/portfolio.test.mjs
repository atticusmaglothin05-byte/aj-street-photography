import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { openStore } from '../src/store.mjs';
import { normalizeDate, captureDate } from '../src/metadata.mjs';
import { createServer } from '../src/server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'photography-test-'));
  const store = await openStore(directory);
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return store;
}
const jpeg = () => sharp({ create: { width: 120, height: 80, channels: 3, background: '#c1b399' } }).jpeg().toBuffer();

test('calendar dates are validated without inventing dates', () => {
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate('2024-02-29'), '2024-02-29');
  assert.throws(() => normalizeDate('2026-02-29'));
  assert.throws(() => normalizeDate('2026-13-01'));
});

test('capture dates use EXIF camera time and missing metadata stays absent', async () => {
  assert.equal(await captureDate(await jpeg()), null);
  const photo = await sharp(await jpeg()).withExif({ IFD0: {}, IFD2: { DateTimeOriginal: '2025:12:31 23:59:00' } }).toBuffer();
  assert.equal(await captureDate(photo), '2025-12-31');
});

test('drafts, omitted captions, explicit overrides, stripped metadata, and persistence', async t => {
  const store = await fixture(t);
  const image = await sharp(await jpeg()).withExif({ IFD0: { Artist: 'Do not publish' }, IFD2: { DateTimeOriginal: '2025:12:31 23:59:00' } }).toBuffer();
  const draft = await store.add(image);
  assert.equal(store.list().length, 0);
  assert.equal(draft.name, undefined); assert.equal(draft.location, undefined);
  assert.equal(draft.date, '2025-12-31'); assert.equal(draft.dateSource, 'metadata');
  store.update(draft.id, { name: 'Disconnected', date: '2026-01-01', published: true });
  const [published] = store.list();
  assert.equal(published.name, 'Disconnected'); assert.equal(published.dateSource, 'provided');
  assert.equal(published.date, '2026-01-01'); assert.equal(published.createdAt, undefined);
  const metadata = await sharp(await readFile(path.join(store.directory, published.src))).metadata();
  assert.equal(metadata.exif, undefined); assert.equal(metadata.width, 120);
  store.update(draft.id, { name: '', date: '' });
  assert.equal(store.list()[0].name, undefined); assert.equal(store.list()[0].date, undefined);
  const reopened = await openStore(store.directory);
  assert.equal(reopened.list().length, 1); reopened.close();
});

test('API authenticates mutations, isolates drafts, and validates uploads', async t => {
  const store = await fixture(t); const token = 'a'.repeat(64);
  const server = await createServer({ store, token });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await fetch(`${origin}/api/admin/photos`)).status, 401);
  const form = new FormData(); form.set('file', new Blob([await jpeg()], { type: 'image/jpeg' }), 'private-title.jpg');
  const response = await fetch(`${origin}/api/admin/photos`, { method: 'POST', headers, body: form });
  assert.equal(response.status, 201);
  const photo = await response.json(); assert.equal(photo.name, undefined); assert.equal(photo.date, undefined);
  assert.equal((await fetch(`${origin}/${photo.src}`)).status, 404);
  assert.equal((await (await fetch(`${origin}/portfolio.json`)).json()).photos.length, 0);
  assert.equal((await fetch(`${origin}/api/admin/photos/${photo.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ published: true }) })).status, 200);
  assert.equal((await fetch(`${origin}/${photo.src}`)).status, 200);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
  assert.equal((await fetch(`${origin}/%ZZ`)).status, 400);
  assert.equal((await fetch(`${origin}/api/admin/photos/${photo.id}`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"published":"false"}' })).status, 400);
  await assert.rejects(store.add(Buffer.from('not an image')));
});
