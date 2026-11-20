#!/usr/bin/env node
// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Copies exactly the files the website needs into a build folder, so only those are published.
// No dependencies.
//
//   node tools/build-site.js            writes ./_site
//   node tools/build-site.js <folder>   writes to <folder>
//
// Everything else in the repository (tests, tools, the Mac app in mac/, notes) stays out of the
// published site. Add a path to SITE_FILES only when the website itself needs it.
// After copying, the script checks that every file index.html and sw.js refer to made it in.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SITE_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons', 'licenses', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];
const out = path.resolve(process.argv[2] || path.join(root, '_site'));

if (out === root || root.startsWith(out + path.sep)) { console.error('Error: the build folder must not be the repository or a parent of it: ' + out); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of SITE_FILES) {
  const from = path.join(root, item);
  if (!fs.existsSync(from)) { console.error('Error: the site needs a file that is missing: ' + item); process.exit(1); }
  fs.cpSync(from, path.join(out, item), { recursive: true });
}

// Every local file the page and the offline worker name must be in the build.
const missing = new Set();
const need = (file, optional) => {
  const clean = file.split(/[?#]/)[0];
  if (optional && !fs.existsSync(path.join(root, clean))) return; // optional data files may not exist
  if (!fs.existsSync(path.join(out, clean))) missing.add(clean);
};
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="((?:css|js|icons)\/[^"]+|manifest\.webmanifest)"/g)) need(m[1]);
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const list = name => JSON.parse((new RegExp('const ' + name + ' = (\\[.*?\\]);').exec(sw) || [, '[]'])[1]);
for (const f of list('CORE')) need(f);
for (const f of list('OPTIONAL')) need(f, true);
if (missing.size) { console.error('Error: the build is missing files the site needs:\n  ' + [...missing].join('\n  ')); process.exit(1); }
console.log('Built the site in ' + out + ' (' + SITE_FILES.length + ' items).');
