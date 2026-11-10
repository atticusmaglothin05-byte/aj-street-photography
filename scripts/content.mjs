import { readFile, writeFile, mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { openStore, root, updateSettings } from '../src/store.mjs';

const [command, ...args] = process.argv.slice(2);
const store = await openStore();
try {
  const options = {};
  const positionals = [];
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--')) { positionals.push(args[i]); continue; }
    const key = args[i].slice(2);
    if (key === 'publish') { options.published = true; continue; }
    if (!['name', 'location', 'description', 'alt', 'collection', 'date', 'position', 'title', 'intro', 'instagram', 'logo'].includes(key) || args[i + 1] == null) throw new Error(`Unknown or incomplete option: ${args[i]}`);
    options[key] = args[++i];
  }
  if (command === 'import') {
    if (positionals.length !== 1) throw new Error('Supply one image file.');
    console.log(JSON.stringify(await store.add(await readFile(positionals[0]), options), null, 2));
  } else if (command === 'list') {
    console.log(JSON.stringify(store.list({ admin: true }), null, 2));
  } else if (['publish', 'unpublish', 'update'].includes(command)) {
    if (positionals.length !== 1) throw new Error('Supply a photo ID.');
    if (command !== 'update') options.published = command === 'publish';
    if ('position' in options) options.position = Number(options.position);
    const result = store.update(positionals[0], options);
    if (!result) throw new Error('Photo not found.');
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'settings') {
    console.log(JSON.stringify(await updateSettings(options), null, 2));
  } else if (command === 'export') {
    const photos = store.list();
    const destination = path.join(root, 'public/media');
    await mkdir(destination, { recursive: true });
    const retained = new Set();
    for (const photo of photos) for (const source of [photo.src, photo.thumbnail]) {
      const filename = path.basename(source); retained.add(filename);
      await copyFile(path.join(store.directory, source), path.join(destination, filename));
    }
    for (const file of await readdir(destination)) if (/^[0-9a-f-]{36}(-thumb)?\.webp$/.test(file) && !retained.has(file)) await rm(path.join(destination, file));
    await writeFile(path.join(root, 'content/gallery.json'), `${JSON.stringify(photos, null, 2)}\n`);
    console.log(`Exported ${photos.length} published photographs. Run the build, then commit the export to GitHub.`);
  } else {
    throw new Error('Commands: import <file> [--name text] [--location text] [--date YYYY-MM-DD] [--publish], list, update <id>, publish <id>, unpublish <id>, settings, export.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store.close(); }
