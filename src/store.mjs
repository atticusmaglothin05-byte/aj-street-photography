import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { captureDate, normalizeFields } from './metadata.mjs';

export const root = path.resolve(import.meta.dirname, '..');
export const MAX_UPLOAD = 40 * 1024 * 1024;
export async function openStore(directory = process.env.DATA_DIR || path.join(root, 'data')) {
  await mkdir(path.join(directory, 'media'), { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'portfolio.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, name TEXT, location TEXT, description TEXT, alt TEXT, collection TEXT,
      date TEXT, dateSource TEXT, width INTEGER NOT NULL, height INTEGER NOT NULL,
      published INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );`);
  const serialize = row => {
    const result = { id: row.id, width: row.width, height: row.height,
      src: `media/${row.id}.webp`, thumbnail: `media/${row.id}-thumb.webp` };
    for (const key of ['name', 'location', 'description', 'alt', 'collection', 'date', 'dateSource']) {
      if (row[key]) result[key] = row[key];
    }
    return result;
  };
  return {
    directory,
    db,
    list({ admin = false } = {}) {
      const rows = db.prepare(`SELECT * FROM photos ${admin ? '' : 'WHERE published=1'} ORDER BY position, createdAt, id`).all();
      return rows.map(row => admin ? { ...serialize(row), published: !!row.published, position: row.position } : serialize(row));
    },
    async add(buffer, input = {}) {
      if (!buffer?.length || buffer.length > MAX_UPLOAD) throw new Error('Upload must contain an image smaller than 40 MB.');
      const fields = normalizeFields(input);
      const image = sharp(buffer, { limitInputPixels: 120_000_000, animated: false, failOn: 'error' });
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Use a single JPEG, PNG, WebP, AVIF, HEIF, or TIFF image.');
      const date = fields.date || await captureDate(buffer);
      const id = randomUUID();
      const main = path.join(directory, 'media', `${id}.webp`);
      const thumbnail = path.join(directory, 'media', `${id}-thumb.webp`);
      try {
        // Auto-orient, resize, and re-encode. No EXIF/GPS or source filenames leave this pipeline.
        const rendered = await image.rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
        await writeFile(main, rendered.data);
        await sharp(rendered.data).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(thumbnail);
        const position = db.prepare('SELECT coalesce(max(position), -1) + 1 AS next FROM photos').get().next;
        db.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, fields.name, fields.location, fields.description, fields.alt, fields.collection,
          date, date ? (fields.date ? 'provided' : 'metadata') : null, rendered.info.width, rendered.info.height, input.published === true ? 1 : 0, position, new Date().toISOString());
      } catch (error) {
        await Promise.all([rm(main, { force: true }), rm(thumbnail, { force: true })]);
        throw error;
      }
      return this.list({ admin: true }).find(photo => photo.id === id);
    },
    update(id, patch) {
      const existing = db.prepare('SELECT * FROM photos WHERE id=?').get(id);
      if (!existing) return null;
      const allowed = ['name', 'location', 'description', 'alt', 'collection', 'date', 'published', 'position'];
      if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('Unknown photo field.');
      if ('published' in patch && typeof patch.published !== 'boolean') throw new Error('Published must be true or false.');
      if ('position' in patch && (!Number.isSafeInteger(patch.position) || patch.position < 0)) throw new Error('Position must be a nonnegative integer.');
      const fields = normalizeFields({ ...existing, ...patch });
      const dateSource = 'date' in patch ? (fields.date ? 'provided' : null) : existing.dateSource;
      db.prepare('UPDATE photos SET name=?,location=?,description=?,alt=?,collection=?,date=?,dateSource=?,published=?,position=? WHERE id=?').run(
        fields.name, fields.location, fields.description, fields.alt, fields.collection, fields.date, dateSource,
        'published' in patch ? Number(patch.published) : existing.published, patch.position ?? existing.position, id);
      return this.list({ admin: true }).find(photo => photo.id === id);
    },
    close() { db.close(); }
  };
}

export async function settings() {
  return JSON.parse(await readFile(path.join(root, 'content/settings.json'), 'utf8'));
}

export async function updateSettings(patch) {
  const allowed = ['title', 'name', 'intro', 'instagram', 'logo'];
  if (Object.keys(patch).some(key => !allowed.includes(key))) throw new Error('Unknown setting.');
  for (const value of Object.values(patch)) if (value !== null && (typeof value !== 'string' || value.length > 4000)) throw new Error('Settings must be text or null.');
  if ('title' in patch && !patch.title?.trim()) throw new Error('Title is required.');
  if (patch.instagram) {
    const url = new URL(patch.instagram);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) throw new Error('Use an https Instagram profile URL.');
  }
  if (patch.logo && !/^assets\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|webp|svg)$/.test(patch.logo)) throw new Error('Logo must be a local path under assets/.');
  if (patch.logo?.split('/').includes('..')) throw new Error('Logo path cannot leave assets/.');
  const next = { ...await settings(), ...patch };
  const destination = path.join(root, 'content/settings.json');
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  await rename(temporary, destination);
  return next;
}
