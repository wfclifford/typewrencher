#!/usr/bin/env node
// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Cache-busting for the site's own CSS and JS. No dependencies.
//
//   node tools/stamp.js            rewrite index.html so every css/ and js/ reference ends in
//                                  ?v=<first 10 hex of that file's SHA-256>
//   node tools/stamp.js --check    change nothing; exit 1 if any reference is missing or stale
//   --root <folder>                work on another copy of the site (tools/build-site.js uses this on _site)
//
// Why: without server cache headers a browser may keep an old index.html, or an old script,
// and pair it with new files after an FTP upload, which breaks the layout. A version that
// changes with each file's content makes a browser fetch exactly the files that changed and
// keep the rest. Run this after any edit to css/ or js/ and before uploading.
//
// It also keeps sw.js (the offline service worker) current: the list of files it saves and a version
// that changes when any file of the site changes, so a visitor's saved copy is replaced after you upload.
//
// That version is also the "build id" shown in About. js/version.js holds it (the `build` field, kept
// current here) next to the release number (the `release` field, set only by tools/build-site.js).
// The build id covers every site file except js/version.js, and index.html is hashed with the version.js
// reference's ?v= removed, so the file can hold the id without changing it.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const rootArg = process.argv.indexOf('--root');
const root = rootArg > 0 && process.argv[rootArg + 1] ? path.resolve(process.argv[rootArg + 1]) : path.resolve(__dirname, '..');
const page = path.join(root, 'index.html');
const REF = /((?:href|src)=")((?:css|js)\/[^"?#]+)(\?v=[a-f0-9]+)?(")/g;
const VFILE = 'js/version.js';
const sha = data => crypto.createHash('sha256').update(data).digest('hex').slice(0, 10);
let versionText = null; // what js/version.js should say, once the build id is known
const exists = f => fs.existsSync(path.join(root, f));
const version = file => {
  if (file === VFILE && versionText !== null) return sha(versionText);
  if (!exists(file)) { console.error('Error: index.html references a missing file: ' + file); process.exit(1); }
  return sha(fs.readFileSync(path.join(root, file)));
};
const ICONS = ['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
// The page with every reference stamped except version.js, whose ?v= is dropped: the text the build id is taken from.
const unstamp = text => text.replace(REF, (all, pre, file, old, post) => pre + file + (file === VFILE ? '' : '?v=' + version(file)) + post);
function buildId(pageText) {
  const refs = [...pageText.matchAll(REF)].map(m => m[2]).filter(f => f !== VFILE);
  const core = ['index.html', ...refs, 'manifest.webmanifest', ...ICONS];
  const counts = exists('data/cmudict.counts.txt.gz') ? 'data/cmudict.counts.txt.gz' : 'data/cmudict.counts.txt';
  const optional = ['data/cmudict.json', counts, 'data/variable-words.txt', 'data/CMUdict-LICENSE.txt'].filter(exists);
  // The id covers every file of the site, so any upload gives visitors a fresh saved copy.
  const hashed = new Set([...core, ...optional].filter(exists)); // a missing icon is reported by the sw.js step, when there is one
  if (exists('data')) for (const f of fs.readdirSync(path.join(root, 'data'))) if (!/\.md$/i.test(f)) hashed.add('data/' + f);
  const sum = crypto.createHash('sha256');
  const normal = pageText.replace(/(js\/version\.js)\?v=[a-f0-9]+/, '$1');
  // index.html is hashed from the stamped text, because the file on disk may not be rewritten yet.
  const hashOf = f => f === 'index.html' ? crypto.createHash('sha256').update(normal).digest('hex').slice(0, 10) : version(f);
  for (const f of [...hashed].sort()) sum.update(f + ':' + hashOf(f) + '\n');
  return sum.digest('hex').slice(0, 10);
}

const check = process.argv.includes('--check');
const html = fs.readFileSync(page, 'utf8');
const stale = [];
let count = 0;
let versionStale = false;
if (exists(VFILE)) {
  const current = fs.readFileSync(path.join(root, VFILE), 'utf8');
  if (!/build: "[a-f0-9]*"/.test(current)) { console.error('Error: ' + VFILE + ' has no build field'); process.exit(1); }
  versionText = current.replace(/build: "[a-f0-9]*"/, 'build: "' + buildId(unstamp(html)) + '"');
  versionStale = versionText !== current;
}
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
function swBlock(pageText) {
  const refs = [...pageText.matchAll(REF)].map(m => m[2] + m[3]);
  const core = ['index.html', ...refs, 'manifest.webmanifest', ...ICONS];
  for (const f of core) if (!exists(f.split('?')[0])) { console.error('Error: the offline file list needs a missing file: ' + f); process.exit(1); }
  const counts = exists('data/cmudict.counts.txt.gz') ? 'data/cmudict.counts.txt.gz' : 'data/cmudict.counts.txt';
  const optional = ['data/cmudict.json', counts, 'data/variable-words.txt', 'data/CMUdict-LICENSE.txt'].filter(exists);
  return "// BEGIN GENERATED\nconst VERSION = '" + buildId(pageText) + "';\nconst CORE = " + JSON.stringify(core) + ";\nconst OPTIONAL = " + JSON.stringify(optional) + ";\n// END GENERATED";
}
let swStale = false, swNext = null;
if (fs.existsSync(swFile)) {
  const sw = fs.readFileSync(swFile, 'utf8'), block = /\/\/ BEGIN GENERATED[\s\S]*?\/\/ END GENERATED/;
  if (!block.test(sw)) { console.error('Error: sw.js has no GENERATED block'); process.exit(1); }
  const next = swBlock(stamped);
  swNext = sw.replace(block, () => next); swStale = swNext !== sw;
}

if (check) {
  if (stale.length || swStale || versionStale) {
    console.error((stale.length ? 'Stale or missing version on: ' + stale.join(', ') + '\n' : '') + (versionStale ? VFILE + ' has an old build id.\n' : '') + (swStale ? 'sw.js is out of date.\n' : '') + 'Run: node tools/stamp.js');
    process.exit(1);
  }
  console.log('All ' + count + ' asset references are current.');
} else {
  if (versionStale) { fs.writeFileSync(path.join(root, VFILE), versionText); console.log('Updated ' + VFILE + ' (build id).'); }
  if (stamped !== html) fs.writeFileSync(page, stamped);
  console.log(stale.length ? 'Updated ' + stale.length + ' of ' + count + ' references: ' + stale.join(', ') : 'All ' + count + ' asset references were already current.');
  if (swStale) { fs.writeFileSync(swFile, swNext); console.log('Updated sw.js (offline file list and version).'); }
}
