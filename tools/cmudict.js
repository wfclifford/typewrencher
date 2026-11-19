#!/usr/bin/env node
// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Local CMUdict helper. No dependencies; needs Node 18+ (built-in fetch).
//
//   node tools/cmudict.js fetch [--from <base-url>] [--out <dir>]
//       Download cmudict.dict and LICENSE, verify the license against the bundled
//       notice, check the dictionary parses, then write the compact data/cmudict.counts.txt
//       (syllable counts only, about 70% smaller), data/CMUdict-LICENSE.txt and
//       data/cmudict.json. Writes nothing if any check fails.
//       --from  base URL that serves cmudict.dict and LICENSE (a mirror, or a pinned commit)
//       --out   output folder (default: data/ next to index.html)
//       --full  also write the full data/cmudict.dict (needed by the Rhymes panel)
//       Every file written also gets a .gz twin, which the app downloads in preference to the plain file.
//
//   node tools/cmudict.js check [file] [word ...]
//       Parse a dictionary file (cmudict.counts.txt or cmudict.dict, detected from its
//       contents) with the app's own parser and report how many entries it has and what it
//       lists for each word (default words: caramel fire hour ...). Default file: the compact
//       one in data/, else data/cmudict.dict.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'js/counter.js')); // defines globalThis.SyllableCounter
const REPO = 'cmusphinx/cmudict';
const MIN_ENTRIES = 100000; // same sanity floor as js/dictionary.js
const SAMPLE = ['caramel', 'fire', 'hour', 'every', 'different', 'camera'];
const canonical = text => text.replace(/\s+/g, ' ').trim();
const fail = message => { console.error('Error: ' + message); process.exit(1); };

function option(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const value = args[i + 1];
  if (!value || value.startsWith('--')) fail(name + ' needs a value');
  args.splice(i, 2);
  return value;
}

async function get(url, json = false) {
  const response = await fetch(url, { headers: { 'User-Agent': 'word-hammer-cmudict-tool' } });
  if (!response.ok) throw new Error(url + ' -> HTTP ' + response.status);
  return json ? response.json() : response.text();
}

function report(entries, words) {
  console.log(Object.keys(entries).length.toLocaleString() + ' entries');
  for (const word of words) {
    const counts = entries[word.toLowerCase()];
    if (!counts) console.log('  ' + word.padEnd(12) + 'not in the dictionary (would be estimated)');
    else console.log('  ' + word.padEnd(12) + counts.join(' or ') + (counts.length > 1 ? '   variable' : ''));
  }
}

async function check(args) {
  const compact = path.join(root, 'data', 'cmudict.counts.txt');
  if (args[0] && /\.(dict|txt)$/i.test(args[0]) && !fs.existsSync(args[0])) fail('no file at ' + args[0]);
  const file = args[0] && fs.existsSync(args[0]) ? args.shift() : fs.existsSync(compact) ? compact : path.join(root, 'data', 'cmudict.dict');
  if (!fs.existsSync(file)) fail('no file at ' + file + '. Run: node tools/cmudict.js fetch');
  const text = fs.readFileSync(file, 'utf8');
  const entries = SyllableCounter.isCounts(text) ? SyllableCounter.parseCounts(text) : await SyllableCounter.parse(text);
  report(entries, args.length ? args : SAMPLE);
  if (Object.keys(entries).length < MIN_ENTRIES) fail('too few entries; the app would reject this file');
}

async function fetchFiles(args) {
  const from = option(args, '--from');
  const out = path.resolve(option(args, '--out') || path.join(root, 'data'));
  const full = args.includes('--full'); if (full) args.splice(args.indexOf('--full'), 1);
  let base = from && from.replace(/\/?$/, '/');
  let revision = 'custom';
  if (!base) {
    const commit = await get('https://api.github.com/repos/' + REPO + '/commits/master', true);
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) fail('unexpected revision from GitHub');
    revision = commit.sha;
    base = 'https://raw.githubusercontent.com/' + REPO + '/' + revision + '/';
  }
  console.log('Downloading from ' + base);
  const [dict, license] = await Promise.all([get(base + 'cmudict.dict'), get(base + 'LICENSE')]);

  const bundled = fs.readFileSync(path.join(root, 'licenses', 'CMUdict-LICENSE.txt'), 'utf8');
  if (canonical(license) !== canonical(bundled)) fail('the upstream license differs from licenses/CMUdict-LICENSE.txt. Review it before using this data. Nothing was written.');
  const entries = await SyllableCounter.parse(dict);
  if (Object.keys(entries).length < MIN_ENTRIES) fail('the file parsed to ' + Object.keys(entries).length + ' entries, so it is not a full CMUdict. Nothing was written.');

  fs.mkdirSync(out, { recursive: true });
  const sha = text => crypto.createHash('sha256').update(text).digest('hex');
  const fetchedAt = new Date().toISOString();
  const compact = SyllableCounter.serializeCounts(entries, [
    'Syllable counts derived from CMUdict (cmudict.dict, revision ' + revision + ', ' + fetchedAt.slice(0, 10) + ').',
    'CMUdict is Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved. The license in CMUdict-LICENSE.txt must accompany this file.',
    'Each line is: counts word word ...  Counts are comma-separated and the first is the primary count. Made by tools/cmudict.js.'
  ]);
  if (Object.keys(SyllableCounter.parseCounts(compact)).length !== Object.keys(entries).length) fail('the compact file did not round-trip. Nothing was written.');
  // Each data file also gets a .gz twin that the app prefers: about a quarter of the bytes, and it
  // needs no server setting. Upload both (the plain file is the fallback for older browsers).
  const write = (name, text) => { fs.writeFileSync(path.join(out, name), text); fs.writeFileSync(path.join(out, name + '.gz'), zlib.gzipSync(text, { level: 9 })); };
  write('cmudict.counts.txt', compact);
  if (full) write('cmudict.dict', dict);
  fs.writeFileSync(path.join(out, 'CMUdict-LICENSE.txt'), license);
  // sourceSHA256 identifies the file the app downloads, so it is the hash of the compact file
  // (upstreamSHA256 is the hash of the original cmudict.dict, for provenance).
  fs.writeFileSync(path.join(out, 'cmudict.json'), JSON.stringify({
    revision, source: base + 'cmudict.dict', fetchedAt,
    sourceSHA256: sha(compact), upstreamSHA256: sha(dict)
  }, null, 2) + '\n');
  console.log('Wrote ' + path.join(out, 'cmudict.counts.txt') + ' (' + (Buffer.byteLength(compact) / 1048576).toFixed(2) + ' MB, from ' + (Buffer.byteLength(dict) / 1048576).toFixed(2) + ' MB) and its .gz twin (' + (fs.statSync(path.join(out, 'cmudict.counts.txt.gz')).size / 1048576).toFixed(2) + ' MB)');
  report(entries, SAMPLE);
}

const [command, ...args] = process.argv.slice(2);
const run = command === 'fetch' ? fetchFiles : command === 'check' ? check : null;
if (!run) fail('usage: node tools/cmudict.js fetch [--from <base-url>] [--out <dir>]\n       node tools/cmudict.js check [file] [word ...]');
run(args).catch(error => fail(error.message));
