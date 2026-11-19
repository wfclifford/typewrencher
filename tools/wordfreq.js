#!/usr/bin/env node
// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Turns wordfreq-en-25000-log.json (github.com/aparrish/wordfreq-en-25000, from the wordfreq library)
// into data/wordfreq-en.txt: the words only, one per line, most common first. The Rhymes panel
// uses the line order as the rank, so common words come first in each group.
//
//   node tools/wordfreq.js <wordfreq-en-25000-log.json> [--out <file>]
//
// The word list is CC BY-SA 4.0 (see THIRD_PARTY_NOTICES.md); the output keeps that notice in its header.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const args = process.argv.slice(2);
const fail = message => { console.error('Error: ' + message); process.exit(1); };
const at = args.indexOf('--out');
const out = path.resolve(at >= 0 ? args.splice(at, 2)[1] || fail('--out needs a file') : path.join(__dirname, '..', 'data', 'wordfreq-en.txt'));
if (!args[0]) fail('usage: node tools/wordfreq.js <wordfreq-en-25000-log.json> [--out <file>]');
let rows;
try { rows = JSON.parse(fs.readFileSync(args[0], 'utf8')); } catch (error) { fail('cannot read ' + args[0] + ': ' + error.message); }
if (!Array.isArray(rows) || rows.length < 1000 || !rows.every(r => Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'number')) fail('not a wordfreq list of [word, log-frequency] pairs');
if (!rows.every((r, i) => !i || rows[i - 1][1] >= r[1])) fail('the list is not sorted most common first');
const seen = new Set(), words = [];
for (const [word] of rows) {
  const w = word.trim().toLowerCase();
  if (w && !/\s/.test(w) && !seen.has(w)) { seen.add(w); words.push(w); }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
const body = [
  '# English words, most common first (rank = line order). Used by the Rhymes panel to list common words first.',
  '# Source: wordfreq (https://github.com/LuminosoInsight/wordfreq) via https://github.com/aparrish/wordfreq-en-25000',
  '# License: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Changed: log-frequencies removed, order kept.',
  '# Not filtered: it includes numbers, abbreviations, names and offensive words, and words that are not in CMUdict.',
  ...words, ''
].join('\n');
fs.writeFileSync(out, body);
fs.writeFileSync(out + '.gz', zlib.gzipSync(body, { level: 9 })); // the app prefers this twin; keep both
console.log('Wrote ' + out + ': ' + words.length.toLocaleString() + ' words, ' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB (' + (fs.statSync(out + '.gz').size / 1024).toFixed(0) + ' KB gzipped twin)');
