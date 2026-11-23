/*
 * Typewrencher service worker: lets the app open and work offline after one visit.
 * Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
 * The block between the GENERATED markers is rewritten by `node tools/stamp.js` (the file list and a
 * version that changes whenever any of the site's files change). Do not edit it by hand.
 *
 *   - Core files are saved when the worker installs; the data files are saved too when they exist.
 *   - The page and the small dictionary meta file are fetched from the network first (so an upload
 *     shows up on the next visit) and fall back to the saved copy offline.
 *   - Scripts and styles carry a ?v= hash in their address, so a saved copy is always the right one.
 *   - Big data files (the rhyme dictionary, the word list) are saved the first time they are used and
 *     served from the save afterwards.
 *   - A request the app makes with cache: "reload" (Reload Dictionary) always goes to the network,
 *     refreshes the saved copy, and fails honestly when offline.
 *   - Other websites (the GitHub dictionary fallback) are never touched.
 */
'use strict';

// BEGIN GENERATED
const VERSION = '8627084a46';
const CORE = ["index.html","css/styles.css?v=80f980e344","js/license.js?v=874a19f480","js/version.js?v=babd6ef9dd","js/preferences.js?v=72ac359a94","js/counter.js?v=676091b79e","js/rhymes.js?v=923679a75b","js/mirror.js?v=302da1e7fd","js/rhymes-ui.js?v=2453d3dfd2","js/dictionary.js?v=96c3c5f5fe","js/host.js?v=387b9d72ec","js/editor.js?v=4c55868d9a","js/dialogs.js?v=6e6803ddbf","js/app.js?v=fc1bfd08e4","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png"];
const OPTIONAL = ["data/cmudict.json","data/cmudict.counts.txt.gz","data/variable-words.txt","data/CMUdict-LICENSE.txt"];
// END GENERATED

const PREFIX = 'typewrencher-';
const LEGACY_PREFIX = 'wordhammer-'; // caches saved under the app's earlier name are removed too
const CACHE = PREFIX + VERSION;
const PAGE = new URL('index.html', self.registration.scope).href;
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const fresh = url => new Request(url, { cache: 'reload' });
    await Promise.all(CORE.map(url => cache.add(fresh(url))));
    await Promise.allSettled(OPTIONAL.map(url => cache.add(fresh(url))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if ((key.startsWith(PREFIX) && key !== CACHE) || key.startsWith(LEGACY_PREFIX)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const storable = response => response && response.status === 200 && response.type === 'basic';

async function networkFirst(request, key, timeoutMs) {
  const cache = await caches.open(CACHE);
  const controller = typeof AbortController === 'function' && timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
    if (storable(response)) cache.put(key || request, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(key || request);
    if (saved) return saved;
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (storable(response)) cache.put(request, response.clone());
  return response;
}

async function reloadAndSave(request) {
  const response = await fetch(request);
  if (storable(response)) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.cache === 'reload' || request.cache === 'no-store') { event.respondWith(reloadAndSave(request)); return; }
  if (request.mode === 'navigate') { event.respondWith(networkFirst(request, PAGE, NAV_TIMEOUT_MS)); return; }
  if (/\.json$/.test(url.pathname) || /\.webmanifest$/.test(url.pathname)) { event.respondWith(networkFirst(request)); return; }
  event.respondWith(cacheFirst(request));
});
