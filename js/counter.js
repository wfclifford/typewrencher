// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  const normalize = word => word.toLowerCase().replace(/[’‘]/g, "'");

  function estimate(word) {
    let w = word.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    const extra = (w.match(/(?:[^tcsgq]ia|[^tcsg]io(?![nu])|eo(?!u)|[^qg]uo|[^qg]ua(?!y)|ii)/g) || []).length;
    w = w.replace(/(?:[^laeiouysxzcgh]es|(?<![td])ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    return Math.max(1, (w.match(/[aeiouy]+/g) || []).length + extra);
  }

  function create() {
    let entries = Object.create(null);
    let extra = Object.create(null);
    const cache = new Map();
    const lineCache = new Map(); // line text -> result, so an edit only recounts the lines that changed
    function word(raw) {
      const key = normalize(raw);
      if (cache.has(key)) return cache.get(key);
      const base = Object.hasOwn(entries, key) ? entries[key] : null;
      const more = Object.hasOwn(extra, key) ? extra[key] : null;
      // CMUdict's counts come first, so its primary count still decides the total.
      const counts = more ? [...new Set([...(base || []), ...more])] : base;
      const result = counts
        ? { n: counts[0], estimated: false, variable: counts.length > 1, counts }
        : { n: estimate(key), estimated: true, variable: false };
      if (cache.size > 20000) cache.clear();
      cache.set(key, result);
      return result;
    }
    return {
      setDictionary(data, supplement) { entries = data || Object.create(null); extra = (data && supplement) || Object.create(null); cache.clear(); lineCache.clear(); },
      word,
      line(text) {
        const hit = lineCache.get(text);
        if (hit) return hit;
        const out = countLine(text);
        if (lineCache.size > 20000) lineCache.clear();
        lineCache.set(text, out);
        return out;
      }
    };
    function countLine(text) {
      const tokens = text.normalize('NFC').replace(/[’‘]/g, "'").match(/\p{L}+(?:'\p{L}+)*/gu) || [];
      return tokens.reduce((sum, token) => {
        const r = word(token);
        sum.n += r.n;
        sum.words++;
        sum.estimated += Number(r.estimated);
        sum.variable += Number(r.variable);
        return sum;
      }, { n: 0, words: 0, estimated: 0, variable: 0 });
    }
  }

  async function parse(text) {
    const grouped = new Map();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (i && i % 6000 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      const line = lines[i].trim();
      if (!line || line.startsWith(';;;')) continue;
      const [raw, ...phones] = line.split('#', 1)[0].trim().split(/\s+/);
      const match = /^(.+?)(?:\((\d+)\))?$/.exec(raw);
      if (!match) continue;
      const count = phones.filter(phone => /^[A-Za-z]+[012]$/.test(phone)).length;
      if (!count) continue;
      const key = normalize(match[1]);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push([Number(match[2] || 0), count]);
    }
    const entries = Object.create(null);
    for (const [key, variants] of grouped) {
      entries[key] = [...new Set(variants.sort((a, b) => a[0] - b[0]).map(v => v[1]))];
    }
    return entries;
  }

  // Supplement format: "word count [count ...]" per line; '#' starts a comment.
  function parseSupplement(text) {
    const out = Object.create(null);
    for (const raw of text.split(/\r?\n/)) {
      const [word, ...nums] = raw.split('#', 1)[0].trim().split(/\s+/);
      const counts = [...new Set(nums.filter(n => /^[1-9]\d?$/.test(n)).map(Number))];
      if (!word || !counts.length) continue;
      const key = normalize(word);
      out[key] = [...new Set([...(out[key] || []), ...counts])];
    }
    return out;
  }

  // Compact counts file (data/cmudict.counts.txt), made from cmudict.dict by tools/cmudict.js.
  // Line 1 is "# cmudict-counts 1". Every other line is "counts word word ...", where counts are
  // comma-separated and the first is the primary count; '#' lines are comments.
  const COUNTS_MAGIC = '# cmudict-counts 1';
  const isCounts = text => text.slice(0, 64).startsWith(COUNTS_MAGIC);
  function parseCounts(text) {
    const entries = Object.create(null);
    for (const line of text.split('\n')) {
      if (!line || line.charCodeAt(0) === 35) continue;
      const words = line.trim().split(' ');
      const counts = words.shift().split(',').map(Number);
      if (!counts.length || !counts.every(n => Number.isInteger(n) && n > 0 && n < 100)) continue;
      for (const word of words) if (word) entries[word] = counts;
    }
    return entries;
  }
  function serializeCounts(entries, header) {
    const groups = new Map();
    for (const key of Object.keys(entries).sort()) {
      const id = entries[key].join(',');
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(key);
    }
    const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || (a < b ? -1 : 1));
    return COUNTS_MAGIC + '\n' + header.map(h => '# ' + h + '\n').join('') + order.map(id => id + ' ' + groups.get(id).join(' ')).join('\n') + '\n';
  }

  globalThis.SyllableCounter = { create, parse, parseSupplement, parseCounts, serializeCounts, isCounts };
})();
