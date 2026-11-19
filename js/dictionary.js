// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  // The dictionary is read from this site first (see data/README.md): the compact
  // data/cmudict.counts.txt, or else the full data/cmudict.dict. GitHub is only contacted when
  // neither file is present, and only while upstreamFallback is true.
  const COUNTS_URL = 'data/cmudict.counts.txt';
  const LOCAL_URL = 'data/cmudict.dict';
  const isLocalSource = source => source === COUNTS_URL || source === LOCAL_URL;
  const META_URL = 'data/cmudict.json';
  const config = { upstreamFallback: true };
  const canonical = text => text.replace(/\s+/g, ' ').trim();
  const valid = data => data && data.schema === 1
    && /^([a-f0-9]{40}|local)$/.test(data.revision)
    && canonical(data.license || '') === canonical(CMU_LICENSE)
    && data.entries && Object.keys(data.entries).length > 100000
    && Object.values(data.entries).every(counts => Array.isArray(counts)
      && counts.length && counts.every(n => Number.isInteger(n) && n > 0 && n < 100));

  const mb = n => (n / 1048576).toFixed(1);
  const fail = (kind, message) => Object.assign(new Error(message), { kind });
  // Friendlier wording for the two failures a visitor can act on.
  const explain = error => error.kind === 'network'
    ? fail('network', "Couldn't download the dictionary. Check your connection and try again.")
    : error.kind === 'http'
      ? fail('http', 'The dictionary download was refused (HTTP ' + error.status + '). Try again later.')
      : error;

  // Reads a body as text while reporting bytes. The total is only trusted when the server sent a
  // Content-Length and no Content-Encoding (a compressed size would not match the decoded bytes);
  // otherwise the caller gets total 0 and shows an indeterminate display.
  async function stream(response, onProgress) {
    const header = name => (response.headers && response.headers.get && response.headers.get(name)) || '';
    const total = !header('content-encoding') && Number(header('content-length')) > 0 ? Number(header('content-length')) : 0;
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let text = '', received = 0, mark = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length; text += decoder.decode(value, { stream: true });
      const step = total ? Math.floor(received / total * 100) : Math.floor(received / 262144);
      if (step !== mark) { mark = step; onProgress(received, total); }
    }
    return text + decoder.decode();
  }

  // Reads a body as bytes (reporting compressed bytes), then returns text: gunzipped when the bytes
  // start with the gzip signature, as-is otherwise (a host may already have decoded a .gz it labelled
  // Content-Encoding: gzip). Total is trusted only without a Content-Encoding, as in stream().
  async function readBytes(response, onProgress) {
    const header = name => (response.headers && response.headers.get && response.headers.get(name)) || '';
    const total = !header('content-encoding') && Number(header('content-length')) > 0 ? Number(header('content-length')) : 0;
    const chunks = [];
    let received = 0, mark = -1;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); received += value.length;
        const step = total ? Math.floor(received / total * 100) : Math.floor(received / 262144);
        if (onProgress && step !== mark) { mark = step; onProgress(received, total); }
      }
    } else { chunks.push(new Uint8Array(await response.arrayBuffer())); }
    const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
    if (bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    return new TextDecoder().decode(bytes);
  }

  // A data file, preferring its pre-compressed twin (url + '.gz'): about a quarter of the bytes, and it needs no
  // server setting because the browser unpacks it itself. Anything wrong with the twin (absent, not gzip,
  // damaged, no DecompressionStream) quietly falls back to the plain file.
  async function fetchText(url, cache = 'default', onProgress = null) {
    if (typeof DecompressionStream === 'function' && typeof Blob === 'function' && typeof Response === 'function') {
      try {
        const text = await request(url + '.gz', false, cache, onProgress, true);
        if (text && !/^\s*</.test(text)) return text;
      } catch (_) {}
    }
    return request(url, false, cache, onProgress);
  }

  async function request(url, json = false, cache = 'default', onProgress = null, gz = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache
        });
      } catch (error) { error.kind = 'network'; throw error; }
      if (!response.ok) { const error = new Error('HTTP ' + response.status); error.kind = 'http'; error.status = response.status; throw error; }
      if (json) return await response.json();
      if (gz) return await readBytes(response, onProgress);
      if (onProgress && response.body && response.body.getReader) return await stream(response, onProgress);
      return await response.text();
    } catch (error) {
      if (!error.kind) error.kind = 'network'; // an aborted or cut-off transfer
      throw error;
    } finally { clearTimeout(timer); }
  }

  function storage(mode, data) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('syllable-counter-cmudict', 1);
      const timer = setTimeout(() => reject(new Error('Cache timed out')), 3000);
      open.onupgradeneeded = () => open.result.createObjectStore('dictionary');
      open.onerror = () => { clearTimeout(timer); reject(open.error); };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('dictionary', mode);
        const store = tx.objectStore('dictionary');
        const req = mode === 'readonly' ? store.get('current') : store.put(data, 'current');
        tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(req.result); };
        tx.onerror = tx.onabort = () => {
          clearTimeout(timer); db.close(); reject(tx.error || new Error('Cache failed'));
        };
      };
    });
  }

  async function hash(text) {
    if (!globalThis.crypto?.subtle) return null;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // A cache that cannot be read or written (private mode, quota, eviction) is simply "no cache".
  const readCache = async () => { try { const c = await storage('readonly'); return valid(c) ? c : null; } catch (_) { return null; } };
  const persist = async data => { try { await storage('readwrite', data); return true; } catch (_) { return false; } };

  // Same-origin dictionary file. Returns null when it is simply not there (404, offline,
  // blocked on file://, or a host that answers unknown paths with an HTML page), so the
  // caller can fall back. A file that is there but is not a usable CMUdict is an error.
  async function local(progress, force, meta, onProgress) {
    let text, url, absent = 'missing';
    for (url of [COUNTS_URL, LOCAL_URL]) {
      try { text = await fetchText(url, force ? 'reload' : 'default', onProgress); }
      catch (error) { absent = error.kind === 'network' ? 'network' : 'missing'; text = null; continue; }
      if (/^\s*</.test(text)) { absent = 'missing'; text = null; continue; }
      break;
    }
    if (text === null || text === undefined) return { absent };
    progress('Preparing local dictionary…', null);
    const entries = url === COUNTS_URL ? SyllableCounter.parseCounts(text) : await SyllableCounter.parse(text);
    const data = {
      schema: 1, entries, license: CMU_LICENSE,
      revision: meta && /^[a-f0-9]{40}$/.test(meta.revision) ? meta.revision : 'local',
      source: url, sourceSHA256: await hash(text), fetchedAt: meta && meta.fetchedAt
    };
    if (!valid(data)) throw fail('invalid', url + ' is not a usable CMUdict file (too few entries)');
    return { data };
  }

  async function upstream(progress, onProgress) {
    progress('Resolving CMUdict revision…');
    const commit = await request('https://api.github.com/repos/cmusphinx/cmudict/commits/master', true);
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw fail('invalid', 'Invalid upstream revision');
    const base = `https://raw.githubusercontent.com/cmusphinx/cmudict/${commit.sha}/`;
    progress('Downloading dictionary and license…');
    const [text, license] = await Promise.all([
      request(base + 'cmudict.dict', false, 'default', onProgress), request(base + 'LICENSE')
    ]);
    if (canonical(license) !== canonical(CMU_LICENSE)) {
      throw fail('license', 'Upstream license changed; review required');
    }
    progress('Preparing dictionary…', null);
    const entries = await SyllableCounter.parse(text);
    const data = {
      schema: 1, entries, license, revision: commit.sha,
      source: base + 'cmudict.dict', sourceSHA256: await hash(text),
      fetchedAt: new Date().toISOString()
    };
    if (!valid(data)) throw fail('invalid', 'Unexpected dictionary contents');
    return data;
  }

  // Order: (1) the cached copy; (2) the local file; (3) GitHub.
  // - A cached copy whose hash matches data/cmudict.json is used with no download.
  // - A cached copy whose hash differs is used now, and the new file is fetched in the
  //   background (result.refresh) and stored for the next visit, so counts never change under
  //   someone who is typing. Reload dictionary (force) applies the new file immediately.
  // - A failed refresh never discards a good cached copy (refreshError is set instead), and a
  //   file that is not a usable CMUdict, or does not match the hash, is never cached.
  // progress(message, fraction, tick): fraction is 0..1, or null while the length is unknown;
  // tick is true for byte-count updates, which are too frequent to announce to a screen reader.
  // Rhymes need pronunciations, which the counts file does not hold. The full cmudict.dict is read
  // only when the rhyme panel is first opened: this site first, then GitHub while upstreamFallback
  // is true. The browser's HTTP cache keeps it between visits. Returns the raw text.
  async function pronunciations(progress) {
    const onBytes = (received, total) => progress(
      'Downloading rhyme data\u2026 ' + (total ? mb(received) + ' of ' + mb(total) + ' MB' : mb(received) + ' MB'),
      total ? Math.min(1, received / total) : null);
    let absent = 'missing';
    try {
      const text = await fetchText(LOCAL_URL, 'default', onBytes);
      if (!/^\s*</.test(text)) return text;
    } catch (error) { absent = error.kind === 'network' ? 'network' : 'missing'; }
    if (!config.upstreamFallback) {
      throw absent === 'network' ? explain(fail('network'))
        : fail('missing', 'Rhymes need the full dictionary at ' + LOCAL_URL + ' (run: node tools/cmudict.js fetch --full).');
    }
    progress('Resolving CMUdict revision\u2026', null);
    const commit = await request('https://api.github.com/repos/cmusphinx/cmudict/commits/master', true);
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw fail('invalid', 'Invalid upstream revision');
    const base = 'https://raw.githubusercontent.com/cmusphinx/cmudict/' + commit.sha + '/';
    const [text, license] = await Promise.all([request(base + 'cmudict.dict', false, 'default', onBytes), request(base + 'LICENSE')]);
    if (canonical(license) !== canonical(CMU_LICENSE)) throw fail('license', 'Upstream license changed; review required');
    return text;
  }

  globalThis.CMUDictionary = {
    config,
    pronunciations,
    fetchText,
    async load(progress = () => {}, force = false) {
      progress('Loading dictionary…', null);
      const onBytes = (received, total) => progress(
        'Downloading dictionary… ' + (total ? mb(received) + ' of ' + mb(total) + ' MB (' + Math.min(100, Math.floor(received / total * 100)) + '%)' : mb(received) + ' MB'),
        total ? Math.min(1, received / total) : null, true);
      const stored = await readCache();
      let meta = null;
      try { meta = await request(META_URL, true, force ? 'reload' : 'no-cache'); } catch (_) {}
      const metaHash = meta && /^[a-f0-9]{64}$/.test(meta.sourceSHA256 || '') ? meta.sourceSHA256 : null;
      const storedLocal = stored && isLocalSource(stored.source);
      // Without a hash on either side the cache cannot be checked, so it is kept until the
      // visitor chooses Reload dictionary.
      if (!force && storedLocal) {
        if (!metaHash || !stored.sourceSHA256 || stored.sourceSHA256 === metaHash) return { ...stored, cached: true };
        const refresh = (async () => {
          try {
            const got = await local(() => {}, true, meta);
            if (!got.data || got.data.sourceSHA256 !== metaHash) return false; // missing, or not the file the meta describes
            return await persist(got.data);
          } catch (_) { return false; }
        })();
        return { ...stored, cached: true, refresh };
      }

      let got;
      try { got = await local(progress, force, meta, onBytes); } catch (error) {
        if (stored) return { ...stored, cached: true, refreshError: error.message };
        throw error;
      }
      if (got.data) return { ...got.data, cached: false, persisted: await persist(got.data), local: true };

      if (stored && (!force || storedLocal)) {
        return { ...stored, cached: true, ...(force ? { refreshError: got.absent === 'network' ? explain(fail('network')).message : 'Local dictionary not found (' + COUNTS_URL + ')' } : {}) };
      }
      if (!config.upstreamFallback) {
        throw got.absent === 'network' ? explain(fail('network')) : fail('missing', 'Local dictionary not found (' + COUNTS_URL + ')');
      }
      let data;
      try { data = await upstream(progress, onBytes); } catch (error) {
        const friendly = explain(error);
        if (stored) return { ...stored, cached: true, refreshError: friendly.message };
        throw friendly;
      }
      return { ...data, cached: false, persisted: await persist(data) };
    }
  };
})();
