#!/usr/bin/env node
// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Cache-busting for the site's own CSS and JS. No dependencies.
//
//   node tools/stamp.js            rewrite index.html so every css/ and js/ reference ends in
//                                  ?v=<first 10 hex of that file's SHA-256>
//   node tools/stamp.js --check    change nothing; exit 1 if any reference is missing or stale
//
// Why: without server cache headers a browser may keep an old index.html, or an old script,
// and pair it with new files after an FTP upload, which breaks the layout. A version that
// changes with each file's content makes a browser fetch exactly the files that changed and
// keep the rest. Run this after any edit to css/ or js/ and before uploading.
//
// It also keeps sw.js (the offline service worker) current: the list of files it saves and a version
// that changes when any file of the site changes, so a visitor's saved copy is replaced after you upload.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const page = path.join(root, 'index.html');
const REF = /((?:href|src)=")((?:css|js)\/[^"?#]+)(\?v=[a-f0-9]+)?(")/g;
const version = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 10);

const check = process.argv.includes('--check');
const html = fs.readFileSync(page, 'utf8');
const stale = [];
let count = 0;
const stamped = html.replace(REF, (all, pre, file, old, post) => {
  if (!fs.existsSync(path.join(root, file))) { console.error('Error: index.html references a missing file: ' + file); process.exit(1); }
  count++;
  const wanted = '?v=' + version(file);
  if (old !== wanted) stale.push(file);
  return pre + file + wanted + post;
});
if (!count) { console.error('Error: no css/ or js/ references found in index.html'); process.exit(1); }

// ---- sw.js: what to save offline, and a version for it
const swFile = path.join(root, 'sw.js');
const exists = f => fs.existsSync(path.join(root, f));
const ICONS = ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
function swBlock(pageText) {
  const refs = [...pageText.matchAll(REF)].map(m => m[2] + m[3]);
  const core = ['index.html', ...refs, 'manifest.webmanifest', ...ICONS];
  for (const f of core) if (!exists(f.split('?')[0])) { console.error('Error: the offline file list needs a missing file: ' + f); process.exit(1); }
  const counts = exists('data/cmudict.counts.txt.gz') ? 'data/cmudict.counts.txt.gz' : 'data/cmudict.counts.txt';
  const optional = ['data/cmudict.json', counts, 'data/variable-words.txt', 'data/CMUdict-LICENSE.txt'].filter(exists);
  // The version covers every file of the site, so any upload gives visitors a fresh saved copy.
  const hashed = new Set([...core.map(f => f.split('?')[0]), ...optional]);
  if (exists('data')) for (const f of fs.readdirSync(path.join(root, 'data'))) if (!/\.md$/i.test(f)) hashed.add('data/' + f);
  const sum = crypto.createHash('sha256');
  // index.html is hashed from the stamped text, because the file on disk may not be rewritten yet.
  const hashOf = f => f === 'index.html' ? crypto.createHash('sha256').update(pageText).digest('hex').slice(0, 10) : version(f);
  for (const f of [...hashed].sort()) sum.update(f + ':' + hashOf(f) + '\n');
  return "// BEGIN GENERATED\nconst VERSION = '" + sum.digest('hex').slice(0, 10) + "';\nconst CORE = " + JSON.stringify(core) + ";\nconst OPTIONAL = " + JSON.stringify(optional) + ";\n// END GENERATED";
}
let swStale = false, swNext = null;
if (fs.existsSync(swFile)) {
  const sw = fs.readFileSync(swFile, 'utf8'), block = /\/\/ BEGIN GENERATED[\s\S]*?\/\/ END GENERATED/;
  if (!block.test(sw)) { console.error('Error: sw.js has no GENERATED block'); process.exit(1); }
  const next = swBlock(stamped);
  swNext = sw.replace(block, () => next); swStale = swNext !== sw;
}

if (check) {
  if (stale.length || swStale) {
    console.error((stale.length ? 'Stale or missing version on: ' + stale.join(', ') + '\n' : '') + (swStale ? 'sw.js is out of date.\n' : '') + 'Run: node tools/stamp.js');
    process.exit(1);
  }
  console.log('All ' + count + ' asset references are current.');
} else {
  if (stamped !== html) fs.writeFileSync(page, stamped);
  console.log(stale.length ? 'Updated ' + stale.length + ' of ' + count + ' references: ' + stale.join(', ') : 'All ' + count + ' asset references were already current.');
  if (swStale) { fs.writeFileSync(swFile, swNext); console.log('Updated sw.js (offline file list and version).'); }
}
