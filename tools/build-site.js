#!/usr/bin/env node
// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Copies exactly the files the website needs into a build folder, so only those are published.
// No dependencies.
//
//   node tools/build-site.js                    writes ./_site; About shows "Version dev"
//   node tools/build-site.js <folder>           writes to <folder>
//   node tools/build-site.js --release          also sets the release number, counted from git history (deploy job)
//   node tools/build-site.js --release=0.1.7    sets that release number
//
// The release number is 0.1.N, where N is the number of merges on main (first-parent history) that changed
// a file in SITE_FILES, so a merge that only touches notes or tests does not raise it. Counting needs the
// full history (actions/checkout with fetch-depth: 0). The number goes only into the built copy of
// js/version.js; nothing is committed to bump it.
//
// Everything else in the repository (tests, tools, the Mac app in mac/, notes) stays out of the
// published site. Add a path to SITE_FILES only when the website itself needs it.
// After copying, the script checks that every file index.html and sw.js refer to made it in.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const SITE_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'data', 'icons', 'licenses', 'LICENSE', 'THIRD_PARTY_NOTICES.md'];

// Release number for the published copy: 0.1.N, N = merges on main that changed a site file. Throws without full history.
function releaseNumber(repoRoot, files) {
  const git = args => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let count;
  try {
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') throw new Error('this is a shallow clone; check out the full history (fetch-depth: 0)');
    count = Number(git(['rev-list', '--first-parent', '--count', 'HEAD', '--', ...files]));
  } catch (error) { throw new Error('Cannot count releases: ' + String(error.stderr || error.message).trim()); }
  if (!Number.isInteger(count) || count < 1) throw new Error('Cannot count releases: no commit changed a site file');
  return '0.1.' + count;
}
module.exports = { SITE_FILES, releaseNumber };
if (require.main !== module) return;

const flags = process.argv.slice(2).filter(a => a.startsWith('--'));
const out = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(root, '_site'));
const releaseFlag = flags.find(f => f === '--release' || f.startsWith('--release='));
let release = null;
if (releaseFlag) {
  try { release = releaseFlag.includes('=') ? releaseFlag.slice('--release='.length) : releaseNumber(root, SITE_FILES); }
  catch (error) { console.error('Error: ' + error.message); process.exit(1); }
  if (!/^[0-9A-Za-z.+-]+$/.test(release)) { console.error('Error: not a usable release number: ' + release); process.exit(1); }
}

if (out === root || root.startsWith(out + path.sep)) { console.error('Error: the build folder must not be the repository or a parent of it: ' + out); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of SITE_FILES) {
  const from = path.join(root, item);
  if (!fs.existsSync(from)) { console.error('Error: the site needs a file that is missing: ' + item); process.exit(1); }
  fs.cpSync(from, path.join(out, item), { recursive: true });
}

// Set the release number in the built copy, then restamp that copy so its offline cache picks the change up.
if (release) {
  const file = path.join(out, 'js', 'version.js'), text = fs.readFileSync(file, 'utf8');
  if (!/release: "[^"]*"/.test(text)) { console.error('Error: js/version.js has no release field'); process.exit(1); }
  fs.writeFileSync(file, text.replace(/release: "[^"]*"/, 'release: "' + release + '"'));
  execFileSync(process.execPath, [path.join(__dirname, 'stamp.js'), '--root', out], { stdio: 'inherit' });
}
try { execFileSync(process.execPath, [path.join(__dirname, 'stamp.js'), '--check', '--root', out], { stdio: ['ignore', 'pipe', 'inherit'] }); }
catch (_) { console.error('Error: the built site has stale version stamps'); process.exit(1); }

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
console.log('Built the site in ' + out + ' (' + SITE_FILES.length + ' items), release ' + (release || 'dev') + '.');
