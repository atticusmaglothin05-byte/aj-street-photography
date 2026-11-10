import { cp, mkdir, readFile, writeFile, access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const settings = JSON.parse(await readFile(path.join(root, 'content/settings.json'), 'utf8'));
const photos = JSON.parse(await readFile(path.join(root, 'content/gallery.json'), 'utf8'));
for (const photo of photos) {
  if (!/^[0-9a-f-]{36}$/.test(photo.id) || photo.src !== `media/${photo.id}.webp` || photo.thumbnail !== `media/${photo.id}-thumb.webp`) throw new Error('Invalid gallery paths.');
  await Promise.all([access(path.join(root, 'public', photo.src)), access(path.join(root, 'public', photo.thumbnail))]);
}
if (settings.logo) await access(path.join(root, 'public', settings.logo));
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
// This directory is generated output owned by this build.
for (const file of await readdir(dist)) await rm(path.join(dist, file), { force: true, recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true, filter: source => path.relative(path.join(root, 'public'), source).split(path.sep)[0] !== 'media' });
await mkdir(path.join(dist, 'media'), { recursive: true });
for (const photo of photos) for (const file of [photo.src, photo.thumbnail]) await cp(path.join(root, 'public', file), path.join(dist, file));
await writeFile(path.join(dist, 'portfolio.json'), JSON.stringify({ settings, photos }));
await writeFile(path.join(dist, '.nojekyll'), '');
console.log(`Built ${photos.length} photographs to dist/.`);
