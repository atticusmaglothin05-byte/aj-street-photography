// One-time import of the archive supplied for this portfolio. Never use filenames as captions.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openStore, root, updateSettings } from '../src/store.mjs';

const titles = new Map([
  ['comic phone', 'Disconnected'],
  ['gasson star trail ig', 'Gasson Hall Star Trail'],
  ['umbrella man', 'Umbrella Man'],
  ['theatre in rain', 'Theatre in Rain'],
  ['ice ps', 'Emerald Ice']
]);
const directory = path.join(root, 'data/imports/Portfolio');
const store = await openStore();
try {
  const existing = store.list({ admin: true });
  if (existing.length && !process.argv.includes('--resume')) throw new Error('The library already contains photos; use --resume only for this interrupted archive import.');
  const files = (await readdir(directory)).filter(file => /\.(jpe?g|png)$/i.test(file));
  for (const [index, file] of files.entries()) {
    const key = path.parse(file).name.toLowerCase();
    if (index < existing.length) {
      if ((existing[index].name || null) !== (titles.get(key) || null)) throw new Error('Existing import order does not match.');
      continue;
    }
    const photo = await store.add(await readFile(path.join(directory, file)), { name: titles.get(key), published: true });
    console.log(JSON.stringify({ source: file, id: photo.id, name: photo.name || null, date: photo.date || null, width: photo.width, height: photo.height }));
  }
  await updateSettings({ title: 'AJ Street Photography', name: 'AJ Street Photography', instagram: 'https://www.instagram.com/aj.street.photography/', logo: 'assets/logo.png' });
} finally { store.close(); }
