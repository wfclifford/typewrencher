/*
 * rhymes.js - rhyme lookup on top of CMUdict. No dependencies, no build step.
 * Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
 * The CMUdict data it reads keeps its own license (below).
 *
 * CMUdict is BSD-licensed. Its copyright notice and license (data/CMUdict-LICENSE.txt, also shown
 * in the app under Dictionary Options) must stay with the dictionary data wherever it is deployed.
 *
 * Changes for the Word Hammer app: parseAsync() builds the index in slices so the page stays
 * responsive; Rhymes.parse() is otherwise unchanged.
 *
 *   const dict = await Rhymes.load('cmudict.txt');   // or Rhymes.parse(text) / Rhymes.parseAsync(text)
 *   const r = dict.find('moonlight');                // { word, pronunciation, perfect, near }
 *   r.perfect  -> { 1: [...], 2: [...], 3: [...] }   // grouped by syllable count
 */
(function (root) {
  'use strict';

  const isVowel = (p) => /\d$/.test(p);
  const syllables = (ph) => ph.filter(isVowel).length;

  // Index of the last primary/secondary-stressed vowel; falls back to the last vowel.
  function stressIndex(ph) {
    for (let i = ph.length - 1; i >= 0; i--) if (/[12]$/.test(ph[i])) return i;
    for (let i = ph.length - 1; i >= 0; i--) if (isVowel(ph[i])) return i;
    return -1;
  }

  const stripStress = (p) => p.replace(/\d$/, '');

  // Perfect-rhyme key: phonemes from the stressed vowel to the end (stress digit kept
  // on the vowel only so "AE1 T" matches "AE1 T" but also "AE2 T").
  function rhymeKey(ph) {
    const i = stressIndex(ph);
    if (i < 0) return null;
    return ph.slice(i).map(stripStress).join(' ');
  }

  // Near-rhyme key: stressed vowel only (assonance).
  function vowelKey(ph) {
    const i = stressIndex(ph);
    return i < 0 ? null : stripStress(ph[i]);
  }

  function push(map, key, value) {
    const list = map.get(key);
    if (list) list.push(value); else map.set(key, [value]);
  }

  // The index is built by a generator so the same code serves parse() (runs straight through) and
  // parseAsync() (yields a 0..1 progress value every `step` items so the page can breathe).
  function* build(text, step) {
    const pron = new Map();      // word -> [[phonemes], ...]
    const byRhyme = new Map();   // rhymeKey -> [{w, syl}]
    const byVowel = new Map();   // vowelKey -> [{w, syl}]

    const lines = text.split(/\r?\n/);
    for (let n = 0; n < lines.length; n++) {
      if (n && n % step === 0) yield 0.5 * n / lines.length;
      const line = lines[n];
      if (!line || line.startsWith(';;;')) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const word = parts[0].toLowerCase().replace(/\(\d+\)$/, '');
      const ph = parts.slice(1);
      const list = pron.get(word);
      if (list) list.push(ph); else pron.set(word, [ph]);
    }

    let rank = null;   // word -> rank, set by setFrequency()
    let done = 0;
    for (const [w, variants] of pron) {
      if (++done % step === 0) yield 0.5 + 0.5 * done / pron.size;
      // Skip entries with digits or punctuation (e.g. "#hashtag", "1990s", "a.m.").
      if (!/^[a-z][a-z']*$/.test(w)) continue;
      const seenR = new Set(), seenV = new Set();
      for (const ph of variants) {
        const syl = syllables(ph);
        const rk = rhymeKey(ph), vk = vowelKey(ph);
        if (rk && !seenR.has(rk)) { seenR.add(rk); push(byRhyme, rk, { w, syl }); }
        if (vk && !seenV.has(vk)) { seenV.add(vk); push(byVowel, vk, { w, syl }); }
      }
    }
    return {
      pron,
      has: (word) => pron.has(String(word).toLowerCase()),
      pronunciation: (word) => (pron.get(String(word).toLowerCase()) || [])[0] || null,
      syllables: (word) => {
        const p = (pron.get(String(word).toLowerCase()) || [])[0];
        return p ? syllables(p) : null;
      },
      find: (word, opts) => find(word, opts),
      // Optional word-frequency ranking (most common first). Words in the list come first within each
      // group, in rank order; every other word follows alphabetically.
      setFrequency: (words) => { rank = words && words.size !== undefined ? words : new Map((words || []).map((w, i) => [w, i])); },
      hasFrequency: () => Boolean(rank && rank.size),
    };

    function byRank(a, b) {
      if (rank) {
        const ra = rank.has(a) ? rank.get(a) : Infinity, rb = rank.has(b) ? rank.get(b) : Infinity;
        if (ra !== rb) return ra < rb ? -1 : 1;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    }

    // "daylight" vs "light": one word is the other plus a real word of 3+ letters.
    // (Short remainders are ignored so "bread" still rhymes with "read".)
    function isCompound(a, b) {
      const long = a.length > b.length ? a : b, short = long === a ? b : a;
      if (!long.endsWith(short)) return false;
      const rest = long.slice(0, long.length - short.length);
      return rest.length >= 3 && pron.has(rest);
    }

    function find(word, opts) {
      opts = opts || {};
      const src = String(word).toLowerCase().replace(/^'+|'+$/g, '');
      const variants = pron.get(src);
      if (!variants) return null;

      const perfect = new Map(), near = new Map();
      const perfectWords = new Set();
      const strict = !!opts.strict; // true = drop "rich" rhymes (same sound before the rhyme)

      for (const ph of variants) {
        const i = stressIndex(ph);
        if (i < 0) continue;
        const before = i > 0 ? stripStress(ph[i - 1]) : '';
        for (const e of byRhyme.get(rhymeKey(ph)) || []) {
          if (e.w === src || isCompound(e.w, src)) continue;
          if (strict && e.w !== src) {
            const wp = pron.get(e.w);
            const j = wp ? stressIndex(wp[0]) : -1;
            if (j > 0 && stripStress(wp[0][j - 1]) === before) continue;
          }
          perfectWords.add(e.w);
          push(perfect, e.syl, e.w);
        }
      }

      for (const ph of variants) {
        for (const e of byVowel.get(vowelKey(ph)) || []) {
          if (e.w === src || perfectWords.has(e.w)) continue;
          if (isCompound(e.w, src)) continue;
          push(near, e.syl, e.w);
        }
      }

      const group = (m) => {
        const out = {};
        [...m.keys()].sort((a, b) => a - b).forEach((k) => {
          out[k] = [...new Set(m.get(k))].sort(byRank);
        });
        return out;
      };

      return {
        word: src,
        pronunciation: variants[0],
        syllables: syllables(variants[0]),
        perfect: group(perfect),
        near: group(near),
      };
    }
  }

  function parse(text) {
    const run = build(text, Infinity);
    for (;;) { const r = run.next(); if (r.done) return r.value; }
  }

  async function parseAsync(text, onProgress) {
    const run = build(text, 6000);
    for (;;) {
      const r = run.next();
      if (r.done) return r.value;
      if (onProgress) onProgress(r.value);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function load(url) {
    const res = await fetch(url || 'cmudict.txt');
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    return parse(await res.text());
  }

  // Frequency list: one word per line, most common first; '#' lines are comments.
  function parseFrequency(text) {
    const rank = new Map();
    for (const line of text.split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (w && w[0] !== '#' && !rank.has(w)) rank.set(w, rank.size);
    }
    return rank;
  }

  const api = { parse, parseAsync, parseFrequency, load, rhymeKey, vowelKey, stressIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rhymes = api;
})(typeof self !== 'undefined' ? self : this);
