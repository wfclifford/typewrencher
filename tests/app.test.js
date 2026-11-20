// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
require('../js/preferences.js');
require('../js/counter.js');
require('../js/editor.js');
require('../js/license.js');
const read = file => fs.readFileSync(path.join(base, file), 'utf8');

function boot(saved = {}, native = true, opts = {}) {
  if (!opts.firstRun) saved['syl-welcomed'] = '1'; // most tests are not a first run
  const nodes = {}, elements = [];
  let active = null, download = null, loads = 0;
  const timers = [];
  class Element {
    constructor(tag, attrs = {}) {
      Object.assign(this, {tag, attrs, events: {}, children: [], value: '', disabled: false, clientWidth: 500, scrollTop: 0});
      this.checked = Object.hasOwn(attrs, 'checked');
      this.style = {setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { delete this[k]; }};
      const classes = new Set((attrs.class || '').split(' '));
      this.classList = {contains: k => classes.has(k), add: k => classes.add(k), remove: k => classes.delete(k), toggle(k, on) { if (on) classes.add(k); else classes.delete(k); }};
    }
    get textContent() { return this.text || ''; }
    set textContent(v) { this.text = String(v); this.children = []; }
    set innerHTML(v) { this.html = v; this.children = []; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(k, f) { (this.events[k] ??= []).push(f); }
    emit(k, event = {}) { for (const f of this.events[k] || []) f({target: this, ...event}); }
    click() { this.emit('click'); }
    focus() { active = this; }
    select() {}
    remove() {}
    appendChild(child) { if (child.tag === 'fragment') this.children.push(...child.children); else this.children.push(child); return child; }
    getBoundingClientRect() { return {height: 32}; }
  }
  for (const match of read('index.html').matchAll(/<([a-z][a-z0-9]*)\b([^>]*?)(?:\s*\/?)>/gi)) {
    const attrs = {};
    for (const a of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    const el = new Element(match[1], attrs);
    elements.push(el);
    if (attrs.id) nodes[attrs.id] = el;
  }
  const document = {
    documentElement: elements.find(e => e.tag === 'html'), body: new Element('body'),
    getElementById: id => nodes[id],
    querySelectorAll(selector) {
      if (selector === 'button') return elements.filter(e => e.tag === 'button');
      const attr = /^\[([^\]]+)\]$/.exec(selector)?.[1];
      return elements.filter(e => Object.hasOwn(e.attrs, attr));
    },
    addEventListener() {}, createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('fragment'), execCommand: () => false,
    get activeElement() { return active; }
  };
  const mediaListeners = [], mq = {matches: Boolean(opts.wide), addEventListener: (type, f) => mediaListeners.push(f)};
  for (const id of ['morePanel', 'wordsDlg', 'welcomeDlg']) if (native) {
    nodes[id].showModal = () => nodes[id].setAttribute('open', '');
    nodes[id].show = () => nodes[id].setAttribute('open', '');
    nodes[id].close = () => { nodes[id].removeAttribute('open'); nodes[id].emit('close'); };
  }
  const context = {
    document, console, AppPreferences, SyllableCounter, AppEditor, CMU_LICENSE: globalThis.CMU_LICENSE,
    CMUDictionary: {load(progress) { loads++; return opts.dictLoad ? opts.dictLoad(progress) : new Promise(() => {}); }},
    matchMedia: query => query.includes('900px') ? mq : {matches: false, addEventListener() {}},
    localStorage: {getItem: k => saved[k] ?? null, setItem: (k, v) => { if (!opts.readOnlyStorage) saved[k] = v; }, get length() { return Object.keys(saved).length; }, key: i => Object.keys(saved)[i] ?? null},
    setTimeout: (f, ms) => { timers.push({f, ms, done: false}); return timers.length; }, clearTimeout(id) { if (timers[id - 1]) timers[id - 1].done = true; },
    Blob: class {constructor(parts) { download = parts.join(''); }},
    URL: {createObjectURL: () => 'blob:test', revokeObjectURL() {}},
    window: {addEventListener() {}}, TextDecoder, ...(opts.globals || {})
  };
  vm.createContext(context);
  vm.runInContext(read('js/dialogs.js'), context);
  vm.runInContext(read('js/app.js'), context);
  const flush = ms => { for (let i = 0; i < timers.length; i++) { const t = timers[i]; if (!t.done && (ms === undefined || t.ms === ms)) { t.done = true; t.f(); } } };
  return {nodes, document, mediaListeners, mq, flush, timers, get active() {return active;}, get download() {return download;}, get loads() {return loads;}};
}

test('requested first-run defaults', () => {
  const b = boot(), n = b.nodes, root = b.document.documentElement;
  assert.equal(root.getAttribute('data-tone'), 'terminal');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  assert.equal(root.getAttribute('data-font'), 'mono');
  assert.equal(root.style['--scale'], '1');
  assert.equal(n.wrapToggle.checked, true);
  for (const id of ['exportCounts', 'exportTotals']) assert.equal(n[id].checked, false, id + ' is off by default');
  assert.equal(n.useCMUdict.checked, true); assert.equal(b.loads, 1);
});
test('saved preferences override defaults', () => {
  const b = boot({'syl-tone':'warm','syl-textsize':'4','syl-counts':'off','syl-totals':'off','syl-cmudict-enabled':'off'});
  assert.equal(b.document.documentElement.getAttribute('data-tone'), 'warm');
  assert.equal(b.document.documentElement.style['--scale'], '1.3');
  assert.equal(b.nodes.exportCounts.checked, false);
  assert.equal(b.nodes.exportTotals.checked, false);
  assert.equal(b.loads, 0);
});
test('invalid settings use defaults', () => {
  const b = boot({'syl-tone':'invalid','syl-textsize':'99'});
  assert.equal(b.document.documentElement.getAttribute('data-tone'), 'terminal');
  assert.equal(b.document.documentElement.style['--scale'], '1');
});
test('default text size is still scale 1, now the third of seven sizes', () => {
  const b = boot(), root = b.document.documentElement;
  assert.equal(root.style['--scale'], '1');
  assert.equal(b.nodes.sizeDown.disabled, false); assert.equal(b.nodes.sizeUp.disabled, false);
  b.nodes.sizeDown.click(); assert.equal(root.style['--scale'], '0.85'); assert.equal(b.nodes.sizeDown.disabled, false);
  b.nodes.sizeDown.click(); assert.equal(root.style['--scale'], '0.7'); assert.equal(b.nodes.sizeDown.disabled, true);
  for (let i = 0; i < 6; i++) b.nodes.sizeUp.click(); assert.equal(root.style['--scale'], '1.75'); assert.equal(b.nodes.sizeUp.disabled, true);
});
test('a text size saved under the old six-size list keeps its scale after the smaller size was added', () => {
  const OLD = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
  for (let i = 0; i < 6; i++) {
    const b = boot({'syl-size': String(i)});
    assert.equal(b.document.documentElement.style['--scale'], String(OLD[i]), 'old index ' + i);
  }
  const store = {'syl-size': '3', 'syl-textsize': '1'}, prefs = AppPreferences.create({getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }});
  assert.equal(prefs.get('syl-textsize'), '1', 'an existing new-format value is never overwritten');
  const fresh = {}; AppPreferences.create({getItem: k => fresh[k] ?? null, setItem: (k, v) => { fresh[k] = v; }}); assert.deepEqual(fresh, {}, 'nothing saved: nothing migrated');
  const junk = {'syl-size': '9'}; AppPreferences.create({getItem: k => junk[k] ?? null, setItem: (k, v) => { junk[k] = v; }}); assert.equal(junk['syl-textsize'], undefined);
});
test('default export is the plain text; counts and totals can still be switched on', () => {
  const b = boot(); b.nodes.ed.value = 'cat'; b.nodes.fname.value = 'Poem'; b.nodes.ed.emit('input'); b.nodes.save.click();
  assert.equal(b.download, 'cat');
  const c = boot(), n = c.nodes;
  n.exportCounts.checked = true; n.exportCounts.emit('change'); n.exportTotals.checked = true; n.exportTotals.emit('change');
  n.ed.value = 'cat'; n.fname.value = 'Poem'; n.ed.emit('input'); n.save.click();
  assert.match(c.download, /Poem\nLines: 1 \| Words: 1 \| Syllables: 1/); assert.match(c.download, /cat  \(1\)/);
  assert.equal(AppPreferences.create({getItem: k => (k === 'syl-counts' ? 'on' : null)}).get('syl-counts'), 'on', 'a saved choice still wins');
});
test('confirmed erase clears text and filename', () => {
  const n = boot().nodes; n.ed.value = 'a poem'; n.fname.value = 'Poem'; n.ed.emit('input');
  n.clearBtn.click(); assert.equal(n.ed.value, 'a poem'); assert.equal(n.fname.value, 'Poem');
  n.clearBtn.click(); assert.equal(n.ed.value, ''); assert.equal(n.fname.value, '');
  assert.equal(n.clearBtn.getAttribute('aria-disabled'), 'true');
});
test('filename-only state can be erased', () => {
  const n = boot().nodes; n.fname.value = 'Name'; n.fname.emit('input');
  assert.equal(n.clearBtn.getAttribute('aria-disabled'), 'false');
  n.clearBtn.click(); n.clearBtn.click(); assert.equal(n.fname.value, '');
});
test('cancelled erase preserves fields', () => {
  const n = boot().nodes; n.ed.value = 'cat'; n.fname.value = 'Name'; n.clearBtn.click(); n.clearBtn.emit('blur');
  assert.equal(n.ed.value, 'cat'); assert.equal(n.fname.value, 'Name'); assert.equal(n.clearBtn.classList.contains('armed'), false);
});
const dialogs = {settings: ['moreBtn', 'morePanel', 'moreClose']};
for (const native of [true, false]) for (const [type, [triggerId, dialogId, closeId]] of Object.entries(dialogs)) {
  test(`${type} shared ${native ? 'native' : 'fallback'} dialog lifecycle`, () => {
    const b = boot({}, native), n = b.nodes, trigger = n[triggerId], dialog = n[dialogId];
    trigger.click(); assert.equal(dialog.getAttribute('open'), '');
    dialog.emit('click', {target: n[closeId]}); assert.equal(dialog.getAttribute('open'), '');
    n[closeId].click(); assert.equal(dialog.getAttribute('open'), null); assert.equal(b.active, trigger);
    trigger.click(); dialog.emit('click'); assert.equal(dialog.getAttribute('open'), null);
  });
}
test('settings gear tracks the drawer in aria-expanded', () => {
  const b = boot(), n = b.nodes;
  assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'false');
  n.moreBtn.click(); assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'true');
  n.moreClose.click(); assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'false');
});
test('drawer order: About, Display Options, Export Options, Dictionary Options, then Reset to defaults', () => {
  const html = read('index.html'), at = id => html.indexOf(`id="${id}"`);
  const drawer = html.slice(at('morePanel'), html.indexOf('</dialog>', at('morePanel')));
  const pos = id => drawer.indexOf(`id="${id}"`);
  const order = ['aboutAcc', 'displayAcc', 'exportAcc', 'advancedAcc', 'resetPrefs'];
  order.forEach((id, i) => { assert.ok(pos(id) > 0, id); if (i) assert.ok(pos(id) > pos(order[i - 1]), id + ' comes after ' + order[i - 1]); });
  for (const id of ['lblTone', 'lblTheme', 'lblFont', 'lblSize', 'sizeUp', 'wrapToggle']) assert.ok(pos(id) > pos('displayAcc') && pos(id) < pos('exportAcc'), id + ' is in Display Options');
  for (const id of ['exportCounts', 'exportTotals']) assert.ok(pos(id) > pos('exportAcc') && pos(id) < pos('advancedAcc'), id + ' is in Export Options');
  for (const id of ['useCMUdict', 'retryDictionary', 'advancedLicense']) assert.ok(pos(id) > pos('advancedAcc') && pos(id) < pos('resetPrefs'), id);
  assert.match(drawer, /About Typewrencher™/); assert.match(drawer, /<summary>Display Options<\/summary>/); assert.match(drawer, /<summary>Export Options<\/summary>/);
  assert.equal(drawer.includes('id="clearBtn"'), false);
  for (const gone of ['advancedDlg', 'advancedBtn', 'infoDlg', 'infoBtn']) assert.equal(html.includes(gone), false, gone);
});
test('erase button lives in the main header, not the drawer', () => {
  const html = read('index.html'), header = html.slice(html.indexOf('<header>'), html.indexOf('</header>'));
  assert.ok(header.includes('id="clearBtn"'));
});
test('Display Options starts open; About, Export Options and Dictionary Options start collapsed', () => {
  const n = boot().nodes;
  assert.equal(n.displayAcc.getAttribute('open'), ''); assert.equal(n.exportAcc.getAttribute('open'), null);
  assert.equal(n.advancedAcc.getAttribute('open'), null); assert.equal(n.aboutAcc.getAttribute('open'), null);
});
test('license display drops hard line breaks but keeps paragraphs and wording', () => {
  const shown = boot().nodes.advancedLicense.textContent, norm = t => t.replace(/\s+/g, ' ').trim();
  assert.equal(/[^\n]\n[^\n]/.test(shown), false);
  assert.ok(shown.includes('\n\n'));
  assert.equal(norm(shown), norm(CMU_LICENSE));
  assert.match(CMU_LICENSE, /[^\n]\n[^\n]/);
});
test('blocked preference storage uses defaults', () => {
  const p = AppPreferences.create({getItem() {throw Error('blocked');}});
  assert.equal(p.get('syl-tone'), 'terminal'); assert.equal(p.get('syl-theme'), 'dark'); assert.equal(p.get('syl-font'), 'mono'); assert.equal(p.get('syl-counts'), 'off');
});
test('lookup and cache invalidation', () => {
  const c = SyllableCounter.create(); c.setDictionary({hello:[2], fire:[1,2]});
  assert.deepEqual(c.line('hello fire zorb'), {n:4,words:3,estimated:1,variable:1});
  c.setDictionary(null); assert.equal(c.word('hello').estimated, true);
});
test('parser orders alternate pronunciations', async () => {
  const d = await SyllableCounter.parse('fire(2) F AY1 ER0\nfire F AY1 R\n'); assert.deepEqual(d.fire, [1,2]);
});
test('mobile scrolling CSS is present', () => {
  const css = read('css/styles.css');
  const rule = css.slice(css.lastIndexOf('/* Mobile scroll fix:'));
  for (const fragment of ['100dvh', '100vh', 'overflow-y: auto', 'overflow-x: hidden', 'touch-action: pan-y pinch-zoom', 'overflow: visible', 'scroll-padding-top']) assert.ok(rule.includes(fragment));
});

// ---- retro terminal tone
test('retro_term tone is a valid preference and applies', () => {
  assert.equal(AppPreferences.create({getItem: () => 'terminal'}).get('syl-tone'), 'terminal');
  const b = boot({'syl-tone': 'terminal'});
  assert.equal(b.document.documentElement.getAttribute('data-tone'), 'terminal');
  const pressed = Object.fromEntries(b.document.querySelectorAll('[data-tone-choice]').map(e => [e.getAttribute('data-tone-choice'), e.getAttribute('aria-pressed')]));
  assert.deepEqual(pressed, {warm: 'false', cool: 'false', grey: 'false', terminal: 'true', amber: 'false', 'hc-bw': 'false', 'hc-yellow': 'false', eink: 'false'});
  assert.match(read('index.html'), /data-tone-choice="terminal"[^>]*>[\s\S]*?<span>retro_term<\/span>/);
  assert.doesNotMatch(read('index.html'), /Retro Terminal/);
});

// ---- WCAG contrast of every tone/theme palette (1.4.3 text, 1.4.11 non-text)
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix55 = (a, b) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * 0.55 + parseInt(b.slice(i, i + 2), 16) * 0.45).toString(16).padStart(2, '0')).join('');
function palette(selector) {
  const css = read('css/styles.css'), at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, selector);
  const vars = {};
  for (const m of css.slice(at, css.indexOf('}', at)).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) vars[m[1]] = m[2];
  return vars;
}
for (const selector of [':root', ':root[data-theme="dark"]', ':root[data-tone="warm"]', ':root[data-tone="warm"][data-theme="dark"]',
  ':root[data-tone="grey"]', ':root[data-tone="grey"][data-theme="dark"]', ':root[data-tone="terminal"]', ':root[data-tone="terminal"][data-theme="dark"]',
  ':root[data-tone="amber"]', ':root[data-tone="amber"][data-theme="dark"]', ':root[data-tone="hc-bw"]', ':root[data-tone="hc-bw"][data-theme="dark"]']) {
  test(`palette contrast meets WCAG AA: ${selector}`, () => {
    const p = palette(selector), edge = p.edge || mix55(p.ink, p.bg);
    if (/hc-/.test(selector)) for (const [name, fg, bg, need] of [['ink on sheet (AAA)', p.ink, p.sheet, 7], ['muted on sheet (AAA)', p.muted, p.sheet, 7], ['accent on sheet (AAA)', p.count, p.sheet, 7], ['accent on pressed fill (AAA)', p.count, p['count-bg'], 7], ['border on sheet', edge, p.sheet, 7]]) assert.ok(ratio(fg, bg) >= need, `${name}: ${ratio(fg, bg).toFixed(2)} < ${need}`);
    for (const [name, fg, bg, need] of [
      ['ink on sheet', p.ink, p.sheet, 4.5], ['ink on page', p.ink, p.bg, 4.5],
      ['muted on sheet', p.muted, p.sheet, 4.5], ['muted on page', p.muted, p.bg, 4.5],
      ['accent on pressed fill', p.count, p['count-bg'], 4.5], ['accent on sheet', p.count, p.sheet, 4.5],
      ['muted on pressed fill', p.muted, p['count-bg'], 4.5],
      ['focus ring on sheet', p.focus, p.sheet, 3], ['focus ring on page', p.focus, p.bg, 3],
      ['control border on sheet', edge, p.sheet, 3], ['control border on page', edge, p.bg, 3]]) {
      assert.ok(ratio(fg, bg) >= need, `${name}: ${ratio(fg, bg).toFixed(2)} < ${need}`);
    }
  });
}

// ---- switches, stepper, reset
test('settings are real switches with visible names', () => {
  const html = read('index.html');
  for (const id of ['wrapToggle', 'exportCounts', 'exportTotals', 'useCMUdict']) assert.match(html, new RegExp(`<input id="${id}" type="checkbox" role="switch"`));
  assert.match(html, /Add syllable count to each line/); assert.match(html, /Add totals summary at top/);
});
test('switches change settings and exports', () => {
  const b = boot(), n = b.nodes;
  n.exportCounts.checked = false; n.exportCounts.emit('change');
  n.exportTotals.checked = false; n.exportTotals.emit('change');
  n.ed.value = 'cat'; n.ed.emit('input'); n.save.click();
  assert.equal(b.download, 'cat');
  n.wrapToggle.checked = false; n.wrapToggle.emit('change');
  assert.equal(n.ed.getAttribute('wrap'), 'off');
});
test('text size shows its level and stays within range', () => {
  const n = boot().nodes;
  assert.equal(n.sizeLevel.textContent, '3 of 7'); assert.equal(n.sizeDots.getAttribute('data-level'), '3');
  for (let i = 0; i < 6; i++) n.sizeUp.click();
  assert.equal(n.sizeLevel.textContent, '7 of 7'); assert.equal(n.sizeUp.disabled, true);
  n.sizeDown.click(); assert.equal(n.sizeLevel.textContent, '6 of 7'); assert.equal(n.sizeDots.getAttribute('data-level'), '6');
});
test('reset restores every default and says so', () => {
  const saved = {'syl-tone': 'grey', 'syl-theme': 'light', 'syl-font': 'serif', 'syl-textsize': '1', 'syl-wrap': 'off', 'syl-counts': 'off', 'syl-totals': 'off', 'syl-cmudict-enabled': 'off'};
  const b = boot(saved), n = b.nodes, root = b.document.documentElement;
  n.resetPrefs.click();
  assert.equal(root.getAttribute('data-tone'), 'terminal'); assert.equal(root.getAttribute('data-theme'), 'dark'); assert.equal(root.getAttribute('data-font'), 'mono');
  assert.equal(root.style['--scale'], '1'); assert.equal(n.sizeLevel.textContent, '3 of 7');
  for (const id of ['wrapToggle', 'useCMUdict']) assert.equal(n[id].checked, true, id);
  for (const id of ['exportCounts', 'exportTotals']) assert.equal(n[id].checked, false, id);
  assert.equal(b.loads, 1);
});

// ---- dictionary status outside Dictionary Options
test('footer shows loading, then a fix-it notice and gear badge when the dictionary fails', async () => {
  const b = boot({}, true, {dictLoad: () => Promise.reject(new Error('offline'))}), n = b.nodes;
  assert.equal(n.dictChip.getAttribute('data-state'), 'loading'); assert.equal(n.moreBadge.hidden, true);
  await new Promise(r => setImmediate(r));
  assert.equal(n.dictChip.getAttribute('data-state'), 'failed'); assert.equal(n.moreBadge.hidden, false);
  assert.equal(n.moreBtn.getAttribute('aria-label'), 'Settings, dictionary unavailable');
  assert.match(n.dictChip.getAttribute('aria-label'), /^Dictionary status: .*counts are estimates.*Open dictionary options\.$/);
  n.dictChip.click();
  assert.equal(n.morePanel.getAttribute('open'), ''); assert.equal(n.advancedAcc.getAttribute('open'), ''); assert.equal(b.active, n.retryDictionary);
});
test('footer chip is neutral when CMUdict is off and quiet when it is loaded', async () => {
  const off = boot({'syl-cmudict-enabled': 'off'}).nodes;
  assert.equal(off.dictChip.getAttribute('data-state'), 'off'); assert.equal(off.dictNoticeMsg.textContent, 'CMUdict off'); assert.equal(off.moreBadge.hidden !== false, true);
  const ok = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'abcdefabcdef', cached: true})}), n = ok.nodes;
  await new Promise(r => setImmediate(r));
  assert.equal(n.dictChip.getAttribute('data-state'), 'ready'); assert.equal(n.dictNoticeMsg.textContent, 'CMUdict ready'); assert.equal(n.moreBadge.hidden, true); assert.equal(n.moreBtn.getAttribute('aria-label'), 'Settings');
});

// ---- docked (wide) vs modal (narrow) drawer
test('wide screens dock a non-modal drawer; Escape closes it and focus returns to the gear', () => {
  const b = boot({}, true, {wide: true}), n = b.nodes, root = b.document.documentElement;
  let modal = 0; n.morePanel.showModal = () => { modal++; n.morePanel.setAttribute('open', ''); };
  n.moreBtn.click();
  assert.equal(modal, 0); assert.equal(root.getAttribute('data-drawer'), 'docked'); assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(b.active, n.drawerTitle);
  n.morePanel.emit('click'); assert.equal(n.morePanel.getAttribute('open'), '', 'no backdrop dismissal when docked');
  n.morePanel.emit('keydown', {key: 'Escape', preventDefault() {}});
  assert.equal(n.morePanel.getAttribute('open'), null); assert.equal(root.getAttribute('data-drawer'), null); assert.equal(b.active, n.moreBtn);
  n.moreBtn.click(); n.moreBtn.click(); assert.equal(n.morePanel.getAttribute('open'), null, 'gear toggles it closed');
});
test('narrow screens use a modal drawer without docking', () => {
  const b = boot(), n = b.nodes;
  n.moreBtn.click(); assert.equal(b.document.documentElement.getAttribute('data-drawer'), null);
  assert.equal(n.morePanel.getAttribute('open'), '');
});
test('crossing the breakpoint re-docks an open drawer and keeps focus', () => {
  const b = boot({}, true, {wide: false}), n = b.nodes, root = b.document.documentElement;
  n.moreBtn.click(); assert.equal(root.getAttribute('data-drawer'), null);
  n.sizeUp.focus(); b.mq.matches = true; b.mediaListeners.forEach(f => f());
  assert.equal(n.morePanel.getAttribute('open'), ''); assert.equal(root.getAttribute('data-drawer'), 'docked');
  assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'true');
  b.mq.matches = false; b.mediaListeners.forEach(f => f());
  assert.equal(root.getAttribute('data-drawer'), null); assert.equal(n.morePanel.getAttribute('open'), '');
});

// ---- swipe right to close (touch only; Close, Escape and backdrop remain)
function touch(panel, type, x, y) { panel.emit(type, {pointerType: 'touch', pointerId: 1, clientX: x, clientY: y}); }
test('a rightward touch swipe closes the drawer', () => {
  const n = boot().nodes; n.moreBtn.click();
  touch(n.morePanel, 'pointerdown', 100, 300); touch(n.morePanel, 'pointermove', 160, 305); touch(n.morePanel, 'pointermove', 300, 310);
  assert.match(n.morePanel.style.transform, /translateX\(200px\)/);
  touch(n.morePanel, 'pointerup', 300, 310);
  assert.equal(n.morePanel.getAttribute('open'), null); assert.equal(n.morePanel.style.transform, '');
});
test('short, vertical, leftward and mouse drags do not close the drawer', () => {
  const n = boot().nodes; n.moreBtn.click();
  touch(n.morePanel, 'pointerdown', 100, 300); touch(n.morePanel, 'pointermove', 130, 302); touch(n.morePanel, 'pointerup', 130, 302);
  touch(n.morePanel, 'pointerdown', 100, 300); touch(n.morePanel, 'pointermove', 110, 380); touch(n.morePanel, 'pointermove', 300, 400); touch(n.morePanel, 'pointerup', 300, 400);
  touch(n.morePanel, 'pointerdown', 300, 300); touch(n.morePanel, 'pointermove', 100, 300); touch(n.morePanel, 'pointerup', 100, 300);
  n.morePanel.emit('pointerdown', {pointerType: 'mouse', pointerId: 2, clientX: 0, clientY: 0}); n.morePanel.emit('pointermove', {pointerType: 'mouse', pointerId: 2, clientX: 400, clientY: 0}); n.morePanel.emit('pointerup', {pointerType: 'mouse', pointerId: 2, clientX: 400, clientY: 0});
  assert.equal(n.morePanel.getAttribute('open'), '');
});

// ---- accessibility structure
test('every button has an accessible name and groups are labelled', () => {
  const html = read('index.html');
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const named = /aria-label="[^"]+"/.test(m[1]) || m[2].replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim().length > 0;
    assert.ok(named, 'unnamed button: ' + m[1].slice(0, 60));
  }
  for (const m of html.matchAll(/role="group"([^>]*)>/g)) assert.match(m[1], /aria-label(ledby)?=/);
});
test('touch targets, sticky header, forced colors and reduced motion are handled in CSS', () => {
  const css = read('css/styles.css');
  assert.match(css, /--hit: 2\.5rem/); assert.match(css, /pointer: coarse\) \{ :root \{ --hit: 2\.75rem/);
  assert.match(css, /\.drawer-head \{[^}]*position: sticky/); assert.match(css, /scroll-padding-top: calc\(var\(--head-h\)/);
  assert.match(css, /forced-colors: active/); assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /html\[data-drawer="docked"\] body \{ padding-right/);
});

// ---- seven text sizes: 0.7, 0.85, 1 (default), 1.15, 1.3, 1.5, 1.75
test('there are seven text sizes, 0.7 to 1.75, and the default is still scale 1', () => {
  const css = read('css/styles.css'), html = read('index.html'), app = read('js/app.js');
  assert.match(app, /SIZES = \[0\.7, 0\.85, 1, 1\.15, 1\.3, 1\.5, 1\.75\]/); assert.match(app, /var sizeIdx = 2;/);
  assert.equal((html.match(/<span id="sizeDots"[^>]*>((?:<i><\/i>)+)/)[1].match(/<i>/g) || []).length, 7);
  assert.match(css, /data-level="7"\] i:nth-child\(-n\+7\)/); assert.equal((css.match(/data-level="7"\] i:nth-child/g) || []).length, 2, 'normal and forced-colors rules');
  assert.equal(AppPreferences.create({getItem: () => '6'}).get('syl-textsize'), '6'); assert.equal(AppPreferences.create({getItem: () => '7'}).get('syl-textsize'), '2');
  assert.equal(AppPreferences.defaults['syl-textsize'], '2'); assert.equal(AppPreferences.defaults['syl-size'], undefined);
});

// ---- high contrast tones
test('hc-bw and amber tones are valid, selectable, and follow the light/dark/system theme', () => {
  const prefs = tone => AppPreferences.create({getItem: () => tone}).get('syl-tone');
  assert.equal(prefs('hc-bw'), 'hc-bw'); assert.equal(prefs('amber'), 'amber'); assert.equal(prefs('hc-color'), 'terminal', 'the removed tone falls back to the default'); assert.equal(prefs('high'), 'terminal');
  for (const tone of ['hc-bw', 'amber']) {
    const b = boot({'syl-tone': tone}); assert.equal(b.document.documentElement.getAttribute('data-tone'), tone);
    const pressed = Object.fromEntries(b.document.querySelectorAll('[data-tone-choice]').map(e => [e.getAttribute('data-tone-choice'), e.getAttribute('aria-pressed')]));
    assert.equal(pressed[tone], 'true'); assert.equal(Object.values(pressed).filter(v => v === 'true').length, 1);
    const click = boot(); click.document.querySelectorAll('[data-tone-choice]').find(e => e.getAttribute('data-tone-choice') === tone).click();
    assert.equal(click.document.documentElement.getAttribute('data-tone'), tone);
  }
  const html = read('index.html'), css = read('css/styles.css');
  assert.match(html, /data-tone-choice="hc-bw"[^>]*>[\s\S]*?<span>B&amp;W<\/span>/); assert.match(html, /data-tone-choice="amber"[^>]*>[\s\S]*?<span>retro_amber<\/span>/);
  assert.doesNotMatch(html + css + read('js/app.js') + read('js/preferences.js'), /hc-color|High contrast color/);
  for (const tone of ['hc-bw', 'amber']) for (const sel of [`:root[data-tone="${tone}"] {`, `:root[data-tone="${tone}"]:not([data-theme="light"]) {`, `:root[data-tone="${tone}"][data-theme="dark"] {`]) assert.ok(css.includes(sel), sel);
  assert.match(css, /:root\[data-tone="amber"\] #ed \{ caret-color: transparent;/);
  const ink = palette(':root[data-tone="amber"][data-theme="dark"]').ink; assert.ok(parseInt(ink.slice(1, 3), 16) > parseInt(ink.slice(5, 7), 16) * 4 && parseInt(ink.slice(3, 5), 16) > 0x80, 'dark amber ink is amber: strong red, mid green, almost no blue');
});

// ---- Safari AutoFill Contact, skull icon, label
test('fields avoid contact-field heuristics', () => {
  const html = read('index.html');
  const fname = html.match(/<input id="fname"[^>]*>/)[0], ed = html.match(/<textarea id="ed"[^>]*>/)[0];
  for (const tag of [fname, ed]) { assert.match(tag, /autocomplete="off"/); assert.match(tag, /name="[a-z-]+"/); }
  assert.match(fname, /name="export-title"/); assert.match(fname, /autocorrect="off"/); assert.match(fname, /autocapitalize="off"/);
  assert.doesNotMatch(fname + ed, /name="(name|filename|title)"/);
});
test('erase button shows a skull and keeps its accessible name', () => {
  const html = read('index.html'), btn = html.match(/<button id="clearBtn"[\s\S]*?<\/button>/)[0];
  assert.match(btn, /fill-rule="evenodd"/); assert.doesNotMatch(btn, /<circle|stroke/); assert.doesNotMatch(btn, /M4 7h16/); assert.match(btn, /aria-label="Erase text and filename"/);
});

// ---- word lists behind the footer counts
const dictOf = entries => ({dictLoad: async () => ({entries, revision: 'abcdefabcdef', cached: true})});
test('footer counts are buttons and update with the text', async () => {
  const b = boot({}, true, dictOf({fire: [1, 2], cat: [1]})), n = b.nodes;
  await new Promise(r => setImmediate(r));
  n.ed.value = 'fire cat zorb fire'; n.ed.emit('input');
  assert.equal(n.estCount.textContent, '1'); assert.equal(n.varCount.textContent, '2');
  assert.match(read('index.html'), /<button id="estBtn"[^>]*aria-haspopup="dialog"/);
});
test('estimated words dialog lists each word once with its uses', async () => {
  const b = boot({}, true, dictOf({cat: [1]})), n = b.nodes;
  await new Promise(r => setImmediate(r));
  n.ed.value = 'cat zorb\nQuux zorb'; n.ed.emit('input'); n.estBtn.click();
  assert.equal(n.morePanel.getAttribute('open'), null); assert.equal(n.wordsDlg.getAttribute('open'), '');
  assert.equal(n.wordsTitle.textContent, 'Estimated words');
  assert.equal(n.wordsSummary.textContent, '2 words · 3 uses in this document');
  assert.match(n.wordsList.html, /zorb<\/span>.*first on line 1 · 2 uses/); assert.match(n.wordsList.html, /quux/);
  assert.doesNotMatch(n.wordsList.html, />cat</);
});
test('variable words dialog shows the used count and the alternates', async () => {
  const b = boot({}, true, dictOf({fire: [1, 2], cat: [1]})), n = b.nodes;
  await new Promise(r => setImmediate(r));
  n.ed.value = 'cat\nfire fire'; n.ed.emit('input'); n.varBtn.click();
  assert.equal(n.wordsTitle.textContent, 'Variable words'); assert.equal(n.wordsSummary.textContent, '1 word · 2 uses in this document');
  assert.match(n.wordsList.html, /fire/); assert.match(n.wordsList.html, /Counted as 1 syllable · also 2 · first on line 2 · 2 uses/);
});
test('empty word lists say so, and unloaded dictionary is explained', () => {
  const b = boot(), n = b.nodes;
  n.ed.value = ''; n.ed.emit('input'); n.varBtn.click();
  assert.equal(n.wordsSummary.textContent, 'No variable words in this document.');
  n.wordsClose.click(); n.ed.value = 'cat'; n.ed.emit('input'); n.estBtn.click();
  assert.match(n.wordsIntro.textContent, /off or not loaded/);
});
test('word list dialog closes and returns focus to the footer button', () => {
  const b = boot(), n = b.nodes;
  n.ed.value = 'cat'; n.ed.emit('input'); n.estBtn.click();
  n.wordsDlg.emit('click', {target: n.wordsClose}); assert.equal(n.wordsDlg.getAttribute('open'), '');
  n.wordsClose.click(); assert.equal(n.wordsDlg.getAttribute('open'), null); assert.equal(b.active, n.estBtn);
  n.varBtn.click(); n.wordsDlg.emit('click'); assert.equal(n.wordsDlg.getAttribute('open'), null); assert.equal(b.active, n.varBtn);
});
test('word list is escaped and the dialog has an accessible name', () => {
  const html = read('index.html');
  assert.match(html, /<dialog id="wordsDlg"[^>]*aria-labelledby="wordsTitle"/); assert.match(html, /aria-label="Close word list"/);
});

// ---- gutter markers
test('gutter flags estimated and variable lines once CMUdict is active', async () => {
  const b = boot({}, true, dictOf({fire: [1, 2], cat: [1]})), n = b.nodes;
  n.ed.value = 'cat\nzorb'; n.ed.emit('input');
  assert.doesNotMatch(n.counts.html, /class="flag/, 'no markers while the dictionary is not loaded');
  await new Promise(r => setImmediate(r));
  n.ed.value = 'cat\nfire\nzorb\nfire zorb'; n.ed.emit('input');
  const rows = n.counts.html.split('</div>');
  assert.doesNotMatch(rows[0], /flag/);
  assert.match(rows[1], /class="flag">\u00b1<[\s\S]*1 variable/); assert.doesNotMatch(rows[1], />~</);
  assert.match(rows[2], /class="flag">~<[\s\S]*1 estimated/); assert.doesNotMatch(rows[2], />\u00b1</);
  assert.match(rows[3], />~</); assert.match(rows[3], />\u00b1</);
  assert.match(rows[1], /class="flags" aria-hidden="true"/);
});
test('no gutter markers when CMUdict is switched off', () => {
  const n = boot({'syl-cmudict-enabled': 'off'}).nodes; n.ed.value = 'zorb'; n.ed.emit('input');
  assert.doesNotMatch(n.counts.html, /class="flag/);
});
test('skull is centered: the empty confirm label takes no space', () => {
  assert.match(read('css/styles.css'), /#clearLabel:empty \{ display: none; \}/);
});

// ---- local CMUdict hosting
const { execFile } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const synthDict = (n = 100100) => {
  const lines = ['caramel k eh1 r ah0 m ah0 l', 'caramel(2) k aa1 r m ah0 l', 'fire f ay1 er0', 'fire(2) f ay1 r'];
  for (let i = 0; i < n; i++) lines.push('zz' + i + ' k ae1 t');
  return lines.join('\n') + '\n';
};
const SHA = 'a'.repeat(40);

test('parser accepts lowercase phoneme codes (cmudict.dict style) and uppercase', async () => {
  const lower = await SyllableCounter.parse('caramel k eh1 r ah0 m ah0 l\ncaramel(2) k aa1 r m ah0 l\n');
  const upper = await SyllableCounter.parse('CARAMEL  K EH1 R AH0 M AH0 L\nCARAMEL(2)  K AA1 R M AH0 L\n');
  assert.deepEqual({...lower}, {caramel: [3, 2]}); assert.deepEqual({...upper}, {...lower});
  const c = SyllableCounter.create(); c.setDictionary(lower);
  assert.deepEqual(c.word('caramel'), {n: 3, estimated: false, variable: true, counts: [3, 2]});
});

function fakeIndexedDB(store = {}, failWrites = false) {
  return {store, open() {
    const req = {};
    setTimeout(() => {
      req.result = {
        createObjectStore() {}, close() {},
        transaction() {
          const tx = {objectStore: () => ({
            get: k => { const r = {result: store[k]}; setTimeout(() => tx.oncomplete()); return r; },
            put: (v, k) => { const r = {}; setTimeout(() => { if (failWrites) { tx.error = new Error('quota'); tx.onerror(); } else { store[k] = v; tx.oncomplete(); } }); return r; }
          })};
          return tx;
        }
      };
      if (req.onupgradeneeded) req.onupgradeneeded(); req.onsuccess();
    });
    return req;
  }};
}
function loader(routes, config = {}, idb = null, extra = {}) {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({url, cache: options.cache});
    const hit = routes[url];
    if (hit instanceof Error) throw hit;
    if (hit && hit.stream) {
      const bytes = Buffer.from(hit.stream), chunk = hit.chunk || 65536;
      let at = 0;
      return {ok: true, status: 200, headers: {get: n => hit.headers && hit.headers[n]}, body: {getReader: () => ({read: async () => at >= bytes.length ? {done: true} : {done: false, value: bytes.subarray(at, at += chunk)}})}};
    }
    if (hit && hit.bytes) {
      const bytes = Buffer.from(hit.bytes), chunk = hit.chunk || 65536; let at = 0;
      return {ok: true, status: 200, headers: {get: n => hit.headers && hit.headers[n]}, body: {getReader: () => ({read: async () => at >= bytes.length ? {done: true} : {done: false, value: new Uint8Array(bytes.subarray(at, at += chunk))}})}};
    }
    if (!hit) return {ok: false, status: 404, text: async () => 'Not found', json: async () => { throw Error('no json'); }};
    return {ok: true, status: 200, text: async () => hit, json: async () => JSON.parse(hit)};
  };
  const context = {CMU_LICENSE: globalThis.CMU_LICENSE, SyllableCounter, fetch: fetchMock, AbortController, setTimeout, clearTimeout, crypto: globalThis.crypto, TextEncoder, TextDecoder, ...(idb ? {indexedDB: idb} : {}), ...extra};
  vm.createContext(context);
  vm.runInContext(read('js/dictionary.js'), context);
  Object.assign(context.CMUDictionary.config, config);
  return {dict: context.CMUDictionary, calls};
}
const upstreamRoutes = () => ({
  'https://api.github.com/repos/cmusphinx/cmudict/commits/master': JSON.stringify({sha: SHA}),
  ['https://raw.githubusercontent.com/cmusphinx/cmudict/' + SHA + '/cmudict.dict']: synthDict(),
  ['https://raw.githubusercontent.com/cmusphinx/cmudict/' + SHA + '/LICENSE']: globalThis.CMU_LICENSE
});

test('local dictionary file is used first and GitHub is never contacted', async () => {
  const {dict, calls} = loader({'data/cmudict.dict': synthDict(), 'data/cmudict.json': JSON.stringify({revision: SHA, fetchedAt: '2026-11-17T00:00:00Z'}), ...upstreamRoutes()});
  const result = await dict.load();
  assert.equal(result.local, true); assert.equal(result.source, 'data/cmudict.dict'); assert.equal(result.revision, SHA);
  assert.deepEqual(result.entries.caramel, [3, 2]); assert.ok(Object.keys(result.entries).length > 100000);
  assert.deepEqual(calls.map(c => c.url).filter(u => /^https?:/.test(u)), []);
});
test('local dictionary without a meta file reports revision "local"', async () => {
  const result = await loader({'data/cmudict.dict': synthDict()}).dict.load();
  assert.equal(result.revision, 'local'); assert.equal(result.local, true);
});
test('reloading bypasses the HTTP cache for the local file', async () => {
  const {dict, calls} = loader({'data/cmudict.dict': synthDict()});
  await dict.load(() => {}, true);
  assert.equal(calls.find(c => c.url === 'data/cmudict.dict').cache, 'reload'); const n = calls.length; await dict.load(() => {}, false); assert.equal(calls.slice(n).find(c => c.url === 'data/cmudict.dict').cache, 'default');
});
test('missing local file falls back to the upstream download', async () => {
  const {dict, calls} = loader(upstreamRoutes());
  const result = await dict.load();
  assert.equal(result.local, undefined); assert.equal(result.revision, SHA); assert.match(result.source, /raw\.githubusercontent\.com/);
  assert.ok(calls.some(c => /api\.github\.com/.test(c.url)));
});
test('an HTML page answered for the local path counts as missing', async () => {
  const {dict} = loader({'data/cmudict.dict': '<!doctype html><title>app</title>', ...upstreamRoutes()});
  assert.match((await dict.load()).source, /raw\.githubusercontent\.com/);
});
test('a local file that is not a real CMUdict is an error, with no silent fallback', async () => {
  const {dict, calls} = loader({'data/cmudict.dict': 'cat k ae1 t\n', ...upstreamRoutes()});
  await assert.rejects(dict.load(), /not a usable CMUdict/);
  assert.deepEqual(calls.map(c => c.url).filter(u => /^https?:/.test(u)), []);
});
test('with upstreamFallback off, a missing local file is an error and GitHub is not contacted', async () => {
  const {dict, calls} = loader(upstreamRoutes(), {upstreamFallback: false});
  await assert.rejects(dict.load(), /Local dictionary not found/);
  assert.deepEqual(calls.map(c => c.url).filter(u => /^https?:/.test(u)), []);
});

// ---- cache keyed by the sha256 in data/cmudict.json
const dictText = synthDict();
const sha256 = text => require('node:crypto').createHash('sha256').update(text).digest('hex');
const dictSHA = require('node:crypto').createHash('sha256').update(dictText).digest('hex');
const metaRoute = (sha = dictSHA) => JSON.stringify({revision: SHA, sourceSHA256: sha, fetchedAt: '2026-11-17T00:00:00Z'});
const cacheRoutes = (sha) => ({'data/cmudict.dict': dictText, 'data/cmudict.json': metaRoute(sha), ...upstreamRoutes()});

test('first load downloads the local file and stores it; the next load is served from the cache without the download', async () => {
  const store = {}, idb = fakeIndexedDB(store);
  const first = loader(cacheRoutes(), {}, idb), r1 = await first.dict.load();
  assert.equal(r1.local, true); assert.equal(r1.persisted, true); assert.equal(store.current.sourceSHA256, dictSHA);
  const second = loader(cacheRoutes(), {}, idb), r2 = await second.dict.load();
  assert.equal(r2.cached, true); assert.ok(Object.keys(r2.entries).length > 100000);
  assert.equal(second.calls.some(c => c.url === 'data/cmudict.dict'), false, 'no 3.5 MB download');
  assert.equal(second.calls.find(c => c.url === 'data/cmudict.json').cache, 'no-cache', 'the small meta file is always revalidated');
});
test('a changed hash serves the cached copy now and stores the new file in the background', async () => {
  const store = {}, idb = fakeIndexedDB(store);
  await loader(cacheRoutes('0'.repeat(64)), {}, idb).dict.load();
  assert.equal(store.current.sourceSHA256, dictSHA);
  const old = store.current;
  const next = loader(cacheRoutes(dictSHA.replace(/^./, c => c === 'a' ? 'b' : 'a')), {}, idb), r = await next.dict.load();
  assert.equal(r.cached, true, 'served from the cache at once'); assert.equal(r.refreshError, undefined);
  assert.equal(await r.refresh, false, 'the downloaded file does not match the hash the meta file promised, so it is not stored');
  assert.equal(store.current, old, 'a half-uploaded pair never replaces a good cache');
});
test('background refresh stores the matching new file for the next visit, and never changes the live result', async () => {
  const store = {}, idb = fakeIndexedDB(store);
  const oldText = synthDict(100200), oldSHA = require('node:crypto').createHash('sha256').update(oldText).digest('hex');
  await loader({'data/cmudict.dict': oldText, 'data/cmudict.json': metaRoute(oldSHA)}, {}, idb).dict.load();
  const upgrade = loader(cacheRoutes(), {}, idb), r = await upgrade.dict.load();
  assert.equal(r.sourceSHA256, oldSHA, 'this visit keeps the old dictionary'); assert.equal(Object.keys(r.entries).length, Object.keys((await loader({'data/cmudict.dict': oldText}).dict.load()).entries).length);
  assert.equal(await r.refresh, true); assert.equal(store.current.sourceSHA256, dictSHA);
  assert.equal(upgrade.calls.find(c => c.url === 'data/cmudict.dict').cache, 'reload', 'the background fetch skips a stale HTTP cache');
  const after = loader(cacheRoutes(), {}, idb), r2 = await after.dict.load();
  assert.equal(r2.sourceSHA256, dictSHA); assert.equal(r2.refresh, undefined);
});
test('a failing background refresh is silent and keeps the cache', async () => {
  const store = {}, idb = fakeIndexedDB(store); await loader(cacheRoutes(), {}, idb).dict.load(); const good = store.current;
  const other = 'f'.repeat(64);
  const r = await loader({'data/cmudict.json': metaRoute(other), 'data/cmudict.dict': new TypeError('Failed to fetch')}, {}, idb).dict.load();
  assert.equal(r.cached, true); assert.equal(await r.refresh, false); assert.equal(store.current, good);
});
test('Reload dictionary bypasses a matching cache', async () => {
  const idb = fakeIndexedDB({}); await loader(cacheRoutes(), {}, idb).dict.load();
  const again = loader(cacheRoutes(), {}, idb), r = await again.dict.load(() => {}, true);
  assert.equal(r.cached, false); assert.equal(again.calls.find(c => c.url === 'data/cmudict.dict').cache, 'reload');
});
test('without a hash in the meta file, the cache is kept until a manual reload', async () => {
  const idb = fakeIndexedDB({}), routes = {'data/cmudict.dict': dictText};
  await loader(routes, {}, idb).dict.load();
  const again = loader(routes, {}, idb); assert.equal((await again.dict.load()).cached, true);
  assert.equal(again.calls.some(c => c.url === 'data/cmudict.dict'), false);
});
test('Reload dictionary that fails keeps and returns the good cached dictionary', async () => {
  const store = {}, idb = fakeIndexedDB(store); await loader(cacheRoutes(), {}, idb).dict.load();
  const good = store.current;
  const broken = loader({'data/cmudict.dict': 'cat k ae1 t\n', 'data/cmudict.json': metaRoute('f'.repeat(64))}, {}, idb), r = await broken.dict.load(() => {}, true);
  assert.equal(r.cached, true); assert.match(r.refreshError, /not a usable CMUdict/); assert.equal(store.current, good, 'bad file never cached');
  const gone = await loader({'data/cmudict.json': metaRoute('f'.repeat(64))}, {upstreamFallback: false}, idb).dict.load(() => {}, true);
  assert.equal(gone.cached, true); assert.match(gone.refreshError, /not found/);
  const offline = await loader({}, {}, idb).dict.load(); assert.equal(offline.cached, true, 'offline: cache still serves');
  const down = await loader({'data/cmudict.dict': new TypeError('Failed to fetch')}, {upstreamFallback: false}, idb).dict.load(() => {}, true);
  assert.match(down.refreshError, /Check your connection/);
});
test('an invalid local file is never cached', async () => {
  const store = {}, idb = fakeIndexedDB(store);
  await assert.rejects(loader({'data/cmudict.dict': 'cat k ae1 t\n'}, {}, idb).dict.load(), /not a usable CMUdict/);
  assert.equal(store.current, undefined);
});
test('a cache that cannot be written or read does not break loading', async () => {
  const noWrite = await loader(cacheRoutes(), {}, fakeIndexedDB({}, true)).dict.load();
  assert.equal(noWrite.local, true); assert.equal(noWrite.persisted, false);
  const corrupt = await loader(cacheRoutes(), {}, fakeIndexedDB({current: {schema: 1, entries: {a: [1]}}})).dict.load();
  assert.equal(corrupt.cached, false, 'an invalid cached copy is ignored');
  const absent = await loader(cacheRoutes()).dict.load(); assert.equal(absent.local, true);
});
test('cached upstream copy is still used when no local file exists, and replaced when one appears', async () => {
  const store = {}, idb = fakeIndexedDB(store);
  await loader(upstreamRoutes(), {}, idb).dict.load();
  assert.match(store.current.source, /raw\.githubusercontent\.com/);
  const again = loader(upstreamRoutes(), {}, idb); assert.equal((await again.dict.load()).cached, true);
  assert.equal(again.calls.some(c => /api\.github\.com/.test(c.url)), false);
  const withLocal = await loader(cacheRoutes(), {}, idb).dict.load(); assert.equal(withLocal.local, true);
  assert.equal(store.current.source, 'data/cmudict.dict');
});

// ---- item 2: specific failures
test('failures carry a kind and wording that says what to do', async () => {
  const net = new TypeError('Failed to fetch');
  await assert.rejects(loader({'data/cmudict.dict': net}, {upstreamFallback: false}).dict.load(), e => e.kind === 'network' && /Check your connection/.test(e.message));
  await assert.rejects(loader({'data/cmudict.dict': net, 'https://api.github.com/repos/cmusphinx/cmudict/commits/master': net}).dict.load(), e => e.kind === 'network');
  await assert.rejects(loader({}, {upstreamFallback: false}).dict.load(), e => e.kind === 'missing' && /not found/.test(e.message));
  await assert.rejects(loader({'data/cmudict.dict': 'cat k ae1 t\n'}).dict.load(), e => e.kind === 'invalid');
  await assert.rejects(loader({}).dict.load(), e => e.kind === 'http' && /HTTP 404/.test(e.message) && /refused/.test(e.message));
});

// ---- item 4: progress
test('download progress reports bytes, a percentage when the length is known, and ticks are flagged', async () => {
  const text = synthDict(), seen = [];
  const {dict} = loader({'data/cmudict.dict': {stream: text, chunk: 300000, headers: {'content-length': String(Buffer.byteLength(text))}}});
  await dict.load((m, f, tick) => seen.push({m, f, tick}));
  const ticks = seen.filter(s => s.tick);
  assert.ok(ticks.length > 2); assert.match(ticks[0].m, /^Downloading dictionary… \d+\.\d of \d+\.\d MB \(\d+%\)$/);
  assert.equal(ticks.at(-1).f, 1); assert.ok(ticks.every((s, i) => i === 0 || s.f >= ticks[i - 1].f));
  assert.ok(seen.some(s => !s.tick && /^Preparing/.test(s.m) && s.f === null));
});
test('an unknown or compressed length gives an indeterminate display, not a wrong percentage', async () => {
  const text = synthDict();
  for (const headers of [{}, {'content-length': '1000', 'content-encoding': 'gzip'}]) {
    const seen = []; await loader({'data/cmudict.dict': {stream: text, chunk: 300000, headers}}).dict.load((m, f, tick) => tick && seen.push({m, f}));
    assert.ok(seen.length > 1); assert.ok(seen.every(s => s.f === null && /^Downloading dictionary… \d+\.\d MB$/.test(s.m)), JSON.stringify(seen[0]));
  }
});
test('streamed text decodes multi-byte characters split across chunks', async () => {
  const text = synthDict() + 'caf\u00e9 k ae1 f ey1\n';
  const r = await loader({'data/cmudict.dict': {stream: text, chunk: 7}}).dict.load();
  assert.deepEqual(r.entries['caf\u00e9'], [2], 'the accented word arrives intact although 7-byte chunks split its UTF-8 bytes');
  assert.ok(Object.keys(r.entries).length > 100000);
});

// ---- app wiring for items 2-4
test('footer notice names the problem: connection, missing file, damaged file', async () => {
  for (const [kind, msg, action] of [['network', /Couldn't download/, /Retry/], ['missing', /wasn't found on this site/, /Details/], ['invalid', /incomplete or damaged/, /Details/]]) {
    const b = boot({}, true, {dictLoad: async () => { throw Object.assign(new Error('x'), {kind}); }}), n = b.nodes;
    await tick(); b.flush();
    assert.equal(n.dictChip.getAttribute('data-state'), 'failed'); assert.match(n.dictNoticeMsg.textContent, msg); assert.match(n.dictNoticeAction.textContent, action);
  }
  const other = boot({}, true, {dictLoad: async () => { throw new Error('boom'); }}); await tick();
  assert.match(other.nodes.dictNoticeMsg.textContent, /Dictionary unavailable/); assert.equal(other.nodes.dictNoticeAction.textContent, 'Fix in settings');
});
test('a failed refresh over a good cache keeps the dictionary and says so, without the unavailable notice', async () => {
  const b = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', cached: true, refreshError: 'Couldn\'t download the dictionary. Check your connection and try again.'})}), n = b.nodes;
  await tick(); b.flush();
  assert.equal(n.dictChip.getAttribute('data-state'), 'warn'); assert.equal(n.moreBadge.hidden, true); assert.match(n.dictionaryStatus.textContent, /Update failed — the saved dictionary remains active/);
  assert.match(n.dictionaryDetails.textContent, /Check your connection/);
});
test('version stamp shows entries, revision, date and a short hash', async () => {
  const entries = Object.fromEntries(Array.from({length: 3}, (_, i) => ['w' + i, [1]]));
  const b = boot({}, true, {dictLoad: async () => ({entries, revision: SHA, local: true, fetchedAt: '2026-11-17T12:00:00Z', sourceSHA256: 'abcdef0123456789'})}), n = b.nodes;
  await tick();
  assert.match(n.dictionaryDetails.textContent, /^3 entries · revision a{12} · updated Nov 17, 2026 · SHA-256 abcdef01$/);
});
test('a background update is announced in the details only, as applying next visit', async () => {
  const refresh = deferred(), b = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', cached: true, refresh: refresh.promise})}), n = b.nodes;
  await tick(); assert.doesNotMatch(n.dictionaryDetails.textContent, /next visit/);
  refresh.resolve(true); await tick(); assert.match(n.dictionaryDetails.textContent, /newer version downloaded; it applies on your next visit/);
  const failed = deferred(), c = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', cached: true, refresh: failed.promise})});
  await tick(); failed.resolve(false); await tick(); assert.doesNotMatch(c.nodes.dictionaryDetails.textContent, /next visit/);
});
test('progress drives the welcome bar, and byte ticks never reach the live status region', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: p => { p('Downloading dictionary…', null); p('Downloading dictionary… 1.0 of 4.0 MB (25%)', 0.25, true); return d.promise; }}), n = b.nodes;
  assert.equal(n.welcomeBar.getAttribute('value'), '25'); assert.equal(n.welcomeProgress.textContent, 'Downloading dictionary… 1.0 of 4.0 MB (25%)');
  assert.equal(n.dictionaryStatus.textContent, 'Downloading dictionary…', 'status keeps the stage message');
  const e = boot({}, true, {dictLoad: p => { p('Downloading dictionary… 1.0 MB', null, true); return deferred().promise; }});
  assert.equal(e.nodes.welcomeBar.getAttribute('value'), null, 'unknown length: indeterminate');
  const css = read('css/styles.css'); assert.match(css, /prefers-reduced-motion: reduce\) \{ \.welcome-bar:indeterminate \{ display: none; \}/);
  assert.match(read('index.html'), /<progress id="welcomeBar"[^>]*aria-hidden="true"/);
});

// ---- one-line dictionary row on phones
test('estimated, variable and the chip share one wrapper that is one line on phones', async () => {
  const html = read('index.html'), row = html.match(/<div class="dict-row">[\s\S]*?<\/div>/)[0];
  for (const id of ['coverage', 'estBtn', 'varBtn', 'dictChip', 'dictChipShort']) assert.match(row, new RegExp('id="' + id + '"'), id);
  const css = read('css/styles.css');
  assert.match(css, /\.dict-row \{ display: contents; \}/, 'transparent on desktop');
  const phone = css.match(/@media \(max-width: 600px\) \{\s*\/\* One line[\s\S]*?\n\}/)[0];
  assert.match(phone, /\.dict-row \{ display: flex;[^}]*justify-content: space-between/); assert.match(phone, /\.chip-long \{ display: none; \}/); assert.match(phone, /\.chip-short \{ display: inline; \}/);
  assert.match(css, /@media \(max-width: 360px\) \{\s*\.dict-row \.cov-btn \{ gap: \.2em; \}/);
});
test('chip has a short label per state, hidden from assistive tech, with the full wording in name and tooltip', async () => {
  const want = {loading: 'Loading…', ready: 'Ready', off: 'Off'};
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  assert.equal(n.dictChipShort.textContent, want.loading); assert.equal(n.dictChip.title, 'Loading dictionary…');
  d.resolve({entries: {}, revision: 'local', local: true}); await tick(); assert.equal(n.dictChipShort.textContent, want.ready); assert.equal(n.dictChip.title, 'CMUdict ready');
  assert.equal(boot({'syl-cmudict-enabled': 'off'}).nodes.dictChipShort.textContent, want.off);
  for (const [kind, short] of [['network', 'Retry'], ['missing', 'Details'], ['invalid', 'Details']]) {
    const f = boot({}, true, {dictLoad: async () => { throw Object.assign(new Error('x'), {kind}); }}); await tick();
    assert.equal(f.nodes.dictChipShort.textContent, short, kind); assert.match(f.nodes.dictChip.title, /counts are estimates/);
  }
  const w = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', cached: true, refreshError: 'x'})}); await tick();
  assert.equal(w.nodes.dictChipShort.textContent, 'Saved copy');
  assert.match(read('index.html'), /<span id="dictChipShort" class="chip-short" aria-hidden="true">/);
});

test('footer items share one text size and tap padding so they line up on phone and desktop', () => {
  const css = read('css/styles.css');
  assert.match(css, /footer \{ --ffs: 0\.9rem; --tp: \.25rem; display: flex;[^}]*font-size: var\(--ffs\); \}/);
  assert.match(css, /@media \(pointer: coarse\) \{ footer \{ --tp: \.5rem; \} \}/);
  assert.match(css, /@media \(max-width: 600px\) \{ footer \{ --ffs: \.85rem; \} \}/);
  assert.match(css, /@media \(max-width: 360px\) \{ footer \{ --ffs: \.75rem; --tp: \.25rem; \} \}/);
  assert.match(css, /\.coverage \{\s*font-size: inherit;/);
  const chip = css.match(/\.dict-chip \{[^}]*\}/)[0];
  assert.match(chip, /font: 600 1em var\(--sans\); line-height: inherit;/); assert.match(chip, /padding: \.2rem var\(--tp\)/); assert.match(chip, /margin-right: calc\(-1 \* var\(--tp\) - 1px\)/);
  assert.match(css, /#estBtn \{ margin-left: calc\(-1 \* var\(--tp\)\); \}/, 'first item cancels its tap padding so its icon aligns with the stats');
  assert.match(css, /\.stats \{ display: flex; align-items: center;[^}]*flex: 1 1 100%/, 'chip can reach the right edge');
});

test('tone swatches keep their shape and the tone names fit the narrowest drawer', () => {
  const css = read('css/styles.css');
  assert.match(css, /\.dot \{[^}]*flex: none;/); assert.match(css, /@media \(max-width: 360px\) \{\s*#morePanel \.tone-grid button \{ padding: 0 \.45rem; gap: \.3rem; font-size: \.8rem; \}/);
  assert.doesNotMatch(css, /data-tone-choice\^="hc-"/, 'B&W is short enough to need no full-width row');
});

// ---- B&W: no grays, inverted solids
test('B&W palette contains only pure black and white', () => {
  const css = read('css/styles.css');
  for (const sel of [':root[data-tone="hc-bw"]', ':root[data-tone="hc-bw"][data-theme="dark"]']) {
    const p = palette(sel); assert.ok(Object.keys(p).length >= 9, sel);
    for (const [name, value] of Object.entries(p)) assert.ok(value === '#000000' || value === '#ffffff', `${sel} --${name}: ${value} is not black or white`);
    assert.equal(ratio(p.ink, p.bg), 21); assert.equal(p.muted, p.ink); assert.equal(p.rule, p.ink); assert.equal(p.edge, p.ink);
  }
  const block = css.slice(css.indexOf('/* B&W overrides.'));
  assert.doesNotMatch(block, /opacity: 0?\.\d|rgba?\(|#[0-9a-f]{3,6}\b(?<!#000000)(?<!#fff)/i, 'no translucent or gray values in the overrides');
});
test('B&W: skull, download and selected buttons are inverted solids; light = black with white icons, dark = white with black icons', () => {
  const css = read('css/styles.css');
  assert.match(css, /:root\[data-tone="hc-bw"\] :is\(#clearBtn, #save, #counts b, \.seg button\[aria-pressed="true"\], \.tog\[aria-pressed="true"\], \.tone-grid button\[aria-pressed="true"\]\) \{\s*background: var\(--ink\); color: var\(--bg\);/);
  assert.match(css, /:is\(\.clear, #save\)\[aria-disabled="true"\] \{ opacity: 1; outline: 2px dashed var\(--bg\)/, 'disabled is a dashed ring, not faded gray');
  const mono = ':root:is([data-tone="hc-bw"], [data-tone="terminal"], [data-tone="amber"], [data-tone="hc-yellow"], [data-tone="eink"])';
  assert.ok(css.includes(mono + ' :is(dialog::backdrop, #morePanel::backdrop) { background: transparent; }'));
  assert.ok(css.includes(mono + ' #morePanel { border: 0; border-left: 2px solid var(--ink); box-shadow: none; }'));
  const light = palette(':root[data-tone="hc-bw"]'), dark = palette(':root[data-tone="hc-bw"][data-theme="dark"]');
  assert.deepEqual([light.ink, light.bg], ['#000000', '#ffffff'], 'light: black fill, white icon'); assert.deepEqual([dark.ink, dark.bg], ['#ffffff', '#000000'], 'dark: white fill, black icon');
  assert.match(css, /\.tog\.clear svg \{ fill: currentColor; stroke: none; \}/, 'the skull takes the inverted text color');
});

// ---- cache busting
const runStamp = (dir, ...args) => new Promise(resolve => execFile(process.execPath, [path.join(dir, 'tools', 'stamp.js'), ...args], (error, stdout, stderr) => resolve({code: error ? error.code : 0, stdout, stderr})));
test('every css/js reference in index.html carries a current content version (run: node tools/stamp.js)', async () => {
  const r = await runStamp(base, '--check'); assert.equal(r.code, 0, r.stderr);
  const refs = [...read('index.html').matchAll(/(?:href|src)="((?:css|js)\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= 8); assert.ok(refs.every(u => /\?v=[a-f0-9]{10}$/.test(u)), refs.join(', '));
});
test('stamp tool: an edited file is reported stale, restamping fixes only that file, and the check never writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  for (const f of ['index.html', 'css/styles.css', 'js/app.js', 'js/license.js', 'js/preferences.js', 'js/counter.js', 'js/rhymes.js', 'js/rhymes-ui.js', 'js/mirror.js', 'js/dictionary.js', 'js/editor.js', 'js/dialogs.js', 'tools/stamp.js']) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), {recursive: true}); fs.copyFileSync(path.join(base, f), path.join(dir, f));
  }
  assert.equal((await runStamp(dir, '--check')).code, 0);
  const before = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  fs.appendFileSync(path.join(dir, 'js/app.js'), '\n// edit\n');
  const stale = await runStamp(dir, '--check'); assert.equal(stale.code, 1); assert.match(stale.stderr, /js\/app\.js/); assert.doesNotMatch(stale.stderr, /counter\.js/);
  assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), before, 'check does not write');
  assert.match((await runStamp(dir)).stdout, /Updated 1 of 11 references: js\/app\.js/);
  const after = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.notEqual(after, before); assert.equal((await runStamp(dir, '--check')).code, 0);
  assert.equal(after.replace(/js\/app\.js\?v=[a-f0-9]+/, '').length, before.replace(/js\/app\.js\?v=[a-f0-9]+/, '').length, 'only app.js changed');
  fs.writeFileSync(path.join(dir, 'index.html'), before.replace('js/editor.js', 'js/gone.js'));
  const missing = await runStamp(dir); assert.equal(missing.code, 1); assert.match(missing.stderr, /missing file: js\/gone\.js/);
});

async function toolServer(routes) {
  const server = http.createServer((req, res) => {
    const hit = routes[req.url];
    if (hit === undefined) { res.writeHead(404); res.end(); } else { res.writeHead(200); res.end(hit); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {url: 'http://127.0.0.1:' + server.address().port + '/', close: () => new Promise(resolve => server.close(resolve))};
}
const runTool = args => new Promise(resolve => execFile(process.execPath, [path.join(base, 'tools', 'cmudict.js'), ...args], (error, stdout, stderr) => resolve({code: error ? error.code : 0, stdout, stderr})));
const bundledLicense = () => read('licenses/CMUdict-LICENSE.txt');

test('tools: fetch writes the compact counts file, license and meta, and reports sample words', async () => {
  const server = await toolServer({'/cmudict.dict': synthDict(), '/LICENSE': bundledLicense()});
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-'));
  try {
    const r = await runTool(['fetch', '--from', server.url, '--out', out]);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /caramel\s+3 or 2\s+variable/); assert.match(r.stdout, /hour\s+not in the dictionary/);
    const compact = fs.readFileSync(path.join(out, 'cmudict.counts.txt'), 'utf8');
    assert.ok(compact.length < synthDict().length * 0.6, 'much smaller than the full dictionary'); assert.ok(SyllableCounter.isCounts(compact));
    assert.match(compact, /Carnegie Mellon University/); assert.equal(fs.existsSync(path.join(out, 'cmudict.dict')), false, 'the full file is only written with --full');
    const full = await SyllableCounter.parse(synthDict()), small = SyllableCounter.parseCounts(compact);
    assert.deepEqual(Object.keys(small).sort(), Object.keys(full).sort()); assert.ok(Object.keys(full).every(k => small[k].join() === full[k].join()), 'same counts, same order');
    assert.equal(fs.readFileSync(path.join(out, 'CMUdict-LICENSE.txt'), 'utf8'), bundledLicense());
    const meta = JSON.parse(fs.readFileSync(path.join(out, 'cmudict.json'), 'utf8'));
    assert.equal(meta.revision, 'custom'); assert.match(meta.sourceSHA256, /^[a-f0-9]{64}$/); assert.match(meta.upstreamSHA256, /^[a-f0-9]{64}$/);
    assert.equal(require('node:crypto').createHash('sha256').update(compact).digest('hex'), meta.sourceSHA256, 'the hash is of the file the app downloads');
    const again = await runTool(['fetch', '--from', server.url, '--out', out, '--full']); assert.equal(again.code, 0, again.stderr); assert.ok(fs.existsSync(path.join(out, 'cmudict.dict')));
  } finally { await server.close(); }
});
test('tools: fetch refuses a changed license and writes nothing', async () => {
  const server = await toolServer({'/cmudict.dict': synthDict(), '/LICENSE': 'Some other license text.'});
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-')), 'data');
  try {
    const r = await runTool(['fetch', '--from', server.url, '--out', out]);
    assert.equal(r.code, 1); assert.match(r.stderr, /license differs/); assert.equal(fs.existsSync(out), false);
  } finally { await server.close(); }
});
test('tools: fetch refuses a dictionary that is too small and writes nothing', async () => {
  const server = await toolServer({'/cmudict.dict': 'cat k ae1 t\n', '/LICENSE': bundledLicense()});
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-')), 'data');
  try {
    const r = await runTool(['fetch', '--from', server.url, '--out', out]);
    assert.equal(r.code, 1); assert.match(r.stderr, /not a full CMUdict/); assert.equal(fs.existsSync(out), false);
  } finally { await server.close(); }
});
test('tools: check reports counts and variable words for a file', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-')), 'cmudict.dict');
  fs.writeFileSync(file, synthDict());
  const r = await runTool(['check', file, 'caramel', 'zorb']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /caramel\s+3 or 2\s+variable/); assert.match(r.stdout, /zorb\s+not in the dictionary/);
  assert.match((await runTool(['check', path.join(os.tmpdir(), 'no-such-file.dict')])).stderr, /no file at/);
});
test('local hosting files are in place and documented', () => {
  assert.ok(fs.existsSync(path.join(base, 'data', 'README.md'))); assert.ok(fs.existsSync(path.join(base, 'tools', 'cmudict.js')));
  assert.match(read('serve.js'), /'\.dict'/);
  assert.match(read('js/dictionary.js'), /upstreamFallback: true/);
});

// ---- welcome dialog
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const tick = () => new Promise(r => setImmediate(r));
test('welcome dialog is accessible, has the wrench and the required wording', () => {
  const html = read('index.html'), dlg = html.match(/<dialog id="welcomeDlg"[\s\S]*?<\/dialog>/)[0];
  assert.match(dlg, /aria-labelledby="welcomeTitle"/); assert.match(dlg, /aria-describedby="welcomeText"/);
  assert.match(dlg, /Welcome to Typewrencher™/); assert.match(dlg, /Loading the dictionary/);
  assert.match(dlg, /<div class="hammer-scene" aria-hidden="true">/); assert.match(dlg, /<button id="welcomeClose"[^>]*>Close<\/button>/);
  const css = read('css/styles.css');
  assert.match(css, /@keyframes hammer-spin/); assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.hammer \{ animation: none; \}/);
});
test('welcome dialog appears after a short delay while the dictionary loads, with progress', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: p => { p('Downloading dictionary and license…'); return d.promise; }}), n = b.nodes;
  assert.equal(n.welcomeDlg.getAttribute('open'), null, 'not at once: a fast load must not flash it');
  b.flush(350); assert.equal(n.welcomeDlg.getAttribute('open'), '');
  assert.equal(n.welcomeProgress.textContent, 'Downloading dictionary and license…');
});
test('a load that finishes before the delay never shows the dialog', async () => {
  const b = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', local: true})}), n = b.nodes;
  await tick(); b.flush();
  assert.equal(n.welcomeDlg.getAttribute('open'), null);
});
test('welcome dialog closes by itself when the dictionary finishes, after a minimum time', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  b.flush(350); assert.equal(n.welcomeDlg.getAttribute('open'), '');
  d.resolve({entries: {}, revision: 'local', local: true}); await tick();
  assert.equal(n.welcomeDlg.getAttribute('open'), '', 'held for the minimum display time');
  b.flush(); assert.equal(n.welcomeDlg.getAttribute('open'), null); assert.equal(b.active, n.ed);
});
test('welcome dialog also closes when loading fails, leaving the footer notice', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  b.flush(350); d.reject(new Error('offline')); await tick(); b.flush();
  assert.equal(n.welcomeDlg.getAttribute('open'), null); assert.equal(n.dictChip.getAttribute('data-state'), 'failed');
});
test('the visitor can close the welcome dialog early, and it stays closed', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  b.flush(350); n.welcomeClose.click();
  assert.equal(n.welcomeDlg.getAttribute('open'), null); assert.equal(b.active, n.ed);
  d.resolve({entries: {}, revision: 'local', local: true}); await tick(); b.flush();
  assert.equal(n.welcomeDlg.getAttribute('open'), null);
  const e = boot({}, true, {dictLoad: () => deferred().promise}); e.flush(350);
  e.nodes.welcomeDlg.emit('click', {target: e.nodes.welcomeClose}); assert.equal(e.nodes.welcomeDlg.getAttribute('open'), '', 'clicks inside do not dismiss');
  e.nodes.welcomeDlg.emit('click'); assert.equal(e.nodes.welcomeDlg.getAttribute('open'), null, 'backdrop click dismisses');
});
test('closing early before it has even appeared cancels it', async () => {
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  d.resolve({entries: {}, revision: 'local'}); await tick(); b.flush();
  assert.equal(n.welcomeDlg.getAttribute('open'), null);
});
test('no welcome dialog when CMUdict is switched off, nor for a later reload', async () => {
  const off = boot({'syl-cmudict-enabled': 'off'}); off.flush(); assert.equal(off.nodes.welcomeDlg.getAttribute('open'), null);
  const b = boot({}, true, {dictLoad: async () => ({entries: {}, revision: 'local', local: true})}), n = b.nodes;
  await tick(); b.flush(); n.retryDictionary.click(); await tick(); b.flush();
  assert.equal(n.welcomeDlg.getAttribute('open'), null);
});

test('footer chip: one control with four glyph states, an accessible name, and sensible focus target', async () => {
  const html = read('index.html'), chip = html.match(/<button id="dictChip"[\s\S]*?<\/button>/)[0];
  for (const icon of ['loading', 'ready', 'warn', 'off']) assert.match(chip, new RegExp('data-icon="' + icon + '"'));
  assert.doesNotMatch(html, /id="dictLoading"|id="dictNotice"/, 'the old separate loading line and notice are gone');
  assert.ok(html.indexOf('id="dictChip"') > html.indexOf('id="varBtn"'), 'chip follows the estimated/variable counts');
  const css = read('css/styles.css'); assert.match(css, /\.dict-chip\[data-state="loading"\] \[data-icon="loading"\] \{ animation: none; \}/);
  const d = deferred(), b = boot({}, true, {dictLoad: () => d.promise}), n = b.nodes;
  assert.equal(n.dictNoticeMsg.textContent, 'Loading dictionary…');
  n.dictChip.click(); assert.equal(b.active, n.useCMUdict, 'while loading, focus the switch (Update is disabled)');
  d.resolve({entries: {}, revision: 'local', local: true}); await tick();
  assert.equal(n.dictChip.getAttribute('data-state'), 'ready'); assert.equal(n.dictChip.getAttribute('aria-label'), 'Dictionary status: CMUdict ready. Open dictionary options.');
  n.morePanel.removeAttribute('open'); n.dictChip.click(); assert.equal(b.active, n.retryDictionary);
});

test('picker order: B&W, then High contrast, then e-ink, then the retro tones', () => {
  const order = [...read('index.html').matchAll(/data-tone-choice="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['warm', 'cool', 'grey', 'hc-bw', 'hc-yellow', 'eink', 'terminal', 'amber']);
  assert.match(read('index.html'), /data-tone-choice="hc-yellow"[^>]*>[\s\S]*?<span>High contrast<\/span>/); assert.match(read('index.html'), /data-tone-choice="eink"[^>]*>[\s\S]*?<span>e-ink<\/span>/);
});

test('supplement: parses comments and counts, merges after CMUdict, absent words get listed counts', () => {
  const sup = SyllableCounter.parseSupplement('# note\ncaramel 3 2  # trailing\nJewellery 3 2\nbad x\n\nfoo 2 2 3\n');
  assert.deepEqual(Object.keys(sup).sort(), ['caramel', 'foo', 'jewellery']);
  assert.deepEqual(sup.foo, [2, 3]);
  const c = SyllableCounter.create();
  const dict = Object.create(null); dict.caramel = [3]; dict.foo = [3];
  c.setDictionary(dict, sup);
  assert.deepEqual(c.word('Caramel'), {n: 3, estimated: false, variable: true, counts: [3, 2]});
  assert.equal(c.word('foo').n, 3, "CMUdict's primary count wins");
  const j = c.word('jewellery'); assert.equal(j.n, 3); assert.equal(j.variable, true); assert.equal(j.estimated, false);
  assert.equal(c.line('caramel jewellery').variable, 2);
  c.setDictionary(dict); assert.equal(c.word('caramel').variable, false, 'no supplement, no change');
  c.setDictionary(null, sup); assert.equal(c.word('caramel').estimated, true, 'supplement needs the dictionary on');
});

test('shipped data/variable-words.txt: 50 base words, inflections listed, valid and de-duplicated', () => {
  const text = read('data/variable-words.txt');
  const sup = SyllableCounter.parseSupplement(text);
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  assert.equal(lines.length, Object.keys(sup).length, 'no word listed twice');
  const base = text.split('--- inflected forms ---')[0].split('--- 50 base words ---')[1].split('\n').filter(l => l.trim() && !l.startsWith('#'));
  assert.equal(base.length, 50);
  for (const w of ['caramel', 'caramels', 'chocolates', 'jewellery', 'secretaries']) assert.ok(sup[w], w);
  for (const [w, c] of Object.entries(sup)) assert.ok(c.length > 1, w + ' needs two or more counts');
});

test('supplemental words option: switch in Dictionary Options, on by default, saved and reset', () => {
  const html = read('index.html');
  const adv = html.slice(html.indexOf('id="advancedAcc"'), html.indexOf('id="resetPrefs"'));
  assert.match(adv, /id="useSupplement" type="checkbox" role="switch" checked/);
  assert.match(adv, /<span>Use added words<\/span>/);
  assert.equal(AppPreferences.defaults['syl-supplement'], 'on');
  assert.equal(boot().nodes.useSupplement.checked, true);
  assert.equal(boot({'syl-supplement': 'off'}).nodes.useSupplement.checked, false);
});

test('button reads Re-download dictionary', () => {
  assert.match(read('index.html'), /id="retryDictionary"[^>]*>Re-download dictionary<\/button>/);
  assert.doesNotMatch(read('js/app.js') + read('index.html'), /Update dictionary/);
});

test('About text is as written', () => {
  const html = read('index.html');
  const about = html.slice(html.indexOf('id="aboutAcc"'), html.indexOf('</details>', html.indexOf('id="aboutAcc"')));
  const paras = [...about.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]);
  const plain = p => p.replace(/<[^>]+>/g, '').replace(/&rsquo;/g, '\u2019').replace(/&plusmn;/g, '\u00b1');
  assert.deepEqual(paras.map(plain), [
    'Typewrencher wrenches words.',
    'Type, paste, or upload a text file. Each line shows its syllable count in the margin. ~ means a word was estimated; \u00b1 means it has more than one common pronunciation.',
    'There is no Save, only Export! Tap the skull or refresh your browser to erase the text and filename.',
    'Counts and rhymes come from CMUdict, a pronunciation dictionary, plus additions for words whose syllable count varies. Words in neither list are estimated. Dictionary Options below contain the dictionary controls for syllables and rhymes and the full CMUdict license.',
    'ABSOLUTELY NO WARRANTY. USE AT YOUR OWN RISK. MAKE A BETTER VERSION YOURSELF.',
    'Typewrencher™', 'Typewrencher™', 'TYPEWRENCHER™'
  ]);
  assert.doesNotMatch(about, /<p><strong>Typewrencher™<\/strong><\/p>[\s\S]*<p><strong>Typewrencher™<\/strong><\/p>[\s\S]*<p><strong>WORD/, 'the first trailing line is plain, the next two are bold');
  assert.match(paras[4], /^<strong>ABSOLUTELY NO WARRANTY[^<]*<\/strong>$/, 'the warranty line is bold');
  assert.equal((paras[1].match(/class="flag"/g) || []).length, 2, 'the same ~ and \u00b1 icons as the margin');
});

// ---- Share sheet save and Open .txt
const IPHONE = {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5};
const shareGlobals = (nav, log) => ({
  File: class {constructor(parts, name, o) { this.parts = parts; this.name = name; this.type = o.type; }},
  navigator: {...nav, canShare: () => true, share: data => { log.push(data); return nav.reject ? Promise.reject(Object.assign(new Error('x'), {name: nav.reject})) : Promise.resolve(); }}
});
const typed = (b, text) => { b.nodes.ed.value = text; b.nodes.ed.emit('input'); };

test('iPhone: Save .txt opens the share sheet with a text file, and does not also download', async () => {
  const log = [], b = boot({}, true, {globals: shareGlobals(IPHONE, log)});
  typed(b, 'one two'); b.nodes.fname.value = 'poem'; b.nodes.save.click(); await tick();
  assert.equal(log.length, 1); assert.equal(log[0].files[0].name, 'poem.txt'); assert.equal(log[0].files[0].type, 'text/plain');
  assert.match(log[0].files[0].parts.join(''), /one two/); assert.equal(b.download, null);
});
test('iPad that reports as a Mac (touch points) also uses the share sheet', async () => {
  const log = [], b = boot({}, true, {globals: shareGlobals({userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5}, log)});
  typed(b, 'x'); b.nodes.save.click(); await tick(); assert.equal(log.length, 1);
});
test('dismissing the share sheet does nothing; other share errors fall back to a download', async () => {
  const a = boot({}, true, {globals: shareGlobals({...IPHONE, reject: 'AbortError'}, [])});
  typed(a, 'x'); a.nodes.save.click(); await tick(); assert.equal(a.download, null);
  const c = boot({}, true, {globals: shareGlobals({...IPHONE, reject: 'NotAllowedError'}, [])});
  typed(c, 'hello'); c.nodes.save.click(); await tick(); assert.match(c.download, /hello/);
});
test('Windows, Linux and desktop Mac keep the plain download even if the browser can share files', async () => {
  for (const nav of [{userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0}, {userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64', maxTouchPoints: 0}, {userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0}]) {
    const log = [], b = boot({}, true, {globals: shareGlobals(nav, log)});
    typed(b, 'abc'); b.nodes.save.click(); await tick();
    assert.equal(log.length, 0, nav.platform); assert.match(b.download, /abc/);
  }
});
test('iPhone without file sharing support falls back to a download', async () => {
  const g = shareGlobals(IPHONE, []); g.navigator.canShare = () => false;
  const b = boot({}, true, {globals: g}); typed(b, 'abc'); b.nodes.save.click(); await tick(); assert.match(b.download, /abc/);
});

const fileOf = (bytes, name = 'note.txt', type = 'text/plain') => ({name, type, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer});
const openIn = async (b, file) => { b.nodes.openFile.files = [file]; b.nodes.openFile.emit('change'); await tick(); await tick(); };
test('Open .txt loads the file, sets the filename, and counts it', async () => {
  const b = boot(); await openIn(b, fileOf(Buffer.from('\uFEFFhello world\r\nsecond line')));
  assert.equal(b.nodes.ed.value, 'hello world\nsecond line'); assert.equal(b.nodes.fname.value, 'note');
  assert.equal(b.nodes.save.getAttribute('aria-disabled'), 'false');
});
test('Open .txt reads Windows-1252 files and asks before replacing existing text', async () => {
  const b = boot({}, true, {globals: {confirm: () => false}}); typed(b, 'keep me');
  await openIn(b, fileOf(Buffer.from('caf\xe9', 'latin1'))); assert.equal(b.nodes.ed.value, 'keep me', 'declined: text unchanged');
  const c = boot({}, true, {globals: {confirm: () => true}}); typed(c, 'old');
  await openIn(c, fileOf(Buffer.from('caf\xe9', 'latin1'))); assert.equal(c.nodes.ed.value, 'caf\u00e9');
});
test('Open .txt refuses non-text and oversized files', async () => {
  const b = boot(); await openIn(b, fileOf(Buffer.from('x'), 'pic.png', 'image/png')); assert.equal(b.nodes.ed.value, '');
  await openIn(b, {...fileOf(Buffer.from('x')), size: 6 * 1024 * 1024}); assert.equal(b.nodes.ed.value, '');
});
test('Open button and editor drop are wired; Open is a plain accessible control', async () => {
  const html = read('index.html');
  assert.match(html, /id="openBtn"[^>]*aria-label="Open a \.txt file"/); assert.match(html, /id="openFile" type="file" accept="\.txt,text\/plain" hidden/);
  const b = boot(); let clicked = 0; b.nodes.openFile.click = () => clicked++; b.nodes.openBtn.click(); assert.equal(clicked, 1);
  let prevented = 0; b.nodes.ed.emit('drop', {dataTransfer: {files: [fileOf(Buffer.from('dropped'))]}, preventDefault: () => prevented++}); await tick(); await tick();
  assert.equal(prevented, 1); assert.equal(b.nodes.ed.value, 'dropped');
  b.nodes.ed.emit('drop', {dataTransfer: {files: []}, preventDefault: () => prevented++}); assert.equal(prevented, 1, 'text drops keep their default');
});

// ---- Compact counts file
test('counts format: round trips, keeps order of counts, ignores comments and bad lines', () => {
  const entries = Object.assign(Object.create(null), {cat: [1], caramel: [3, 2], fire: [2, 1], dog: [1], x: [12, 3]});
  const text = SyllableCounter.serializeCounts(entries, ['note']);
  assert.ok(SyllableCounter.isCounts(text)); assert.equal(SyllableCounter.isCounts('cat k ae1 t'), false);
  assert.deepEqual({...SyllableCounter.parseCounts(text)}, {...entries});
  assert.deepEqual({...SyllableCounter.parseCounts('# cmudict-counts 1\n# c\n\nbad x y\n0 nope\n2,3 ok\n')}, {ok: [2, 3]});
  assert.equal(text, SyllableCounter.serializeCounts(entries, ['note']), 'deterministic output');
});
test('loader prefers the compact file and never touches the full one', async () => {
  const text = SyllableCounter.serializeCounts(await SyllableCounter.parse(synthDict()), ['t']);
  const {dict, calls} = loader({'data/cmudict.counts.txt': text, 'data/cmudict.dict': 'cat k ae1 t\n'});
  const r = await dict.load();
  assert.equal(r.source, 'data/cmudict.counts.txt'); assert.equal(r.local, true); assert.ok(Object.keys(r.entries).length > 100000);
  assert.deepEqual([...r.entries.caramel], [3, 2]); assert.equal(calls.some(c => c.url === 'data/cmudict.dict'), false);
  assert.match(r.sourceSHA256, /^[a-f0-9]{64}$/);
});
test('loader falls back to the full dictionary when the compact file is absent or is an HTML page', async () => {
  for (const counts of [undefined, '<!doctype html><title>app</title>']) {
    const {dict, calls} = loader({'data/cmudict.dict': synthDict(), ...(counts ? {'data/cmudict.counts.txt': counts} : {})});
    const r = await dict.load(); assert.equal(r.source, 'data/cmudict.dict'); assert.equal(calls[0].url, 'data/cmudict.json');
  }
});
test('a compact file that is too short is rejected, and the hash in cmudict.json upgrades an old cached full dictionary', async () => {
  await assert.rejects(loader({'data/cmudict.counts.txt': '# cmudict-counts 1\n1 cat\n'}).dict.load(), e => e.kind === 'invalid' && /cmudict.counts.txt/.test(e.message));
  const idb = fakeIndexedDB({}), old = synthDict(100100), compact = SyllableCounter.serializeCounts(await SyllableCounter.parse(synthDict(100200)), ['t']);
  await loader({'data/cmudict.dict': old}, {}, idb).dict.load();
  const upgraded = loader({'data/cmudict.counts.txt': compact, 'data/cmudict.json': metaRoute(await sha256(compact))}, {}, idb);
  const r = await upgraded.dict.load(); assert.equal(r.cached, true, 'this visit uses the saved copy'); assert.equal(r.source, 'data/cmudict.dict');
  assert.equal(await r.refresh, true); assert.equal((await loader({}, {}, idb).dict.load()).source, 'data/cmudict.counts.txt');
});

test('retro_term and retro_amber use the B&W high-contrast logic, with solid (not dashed) disabled rings on the skull and .txt', () => {
  const css = read('css/styles.css'), at = css.indexOf('/* retro_term and retro_amber: the same high-contrast logic');
  assert.ok(at > css.indexOf(':root[data-tone="hc-bw"] #clearBtn.armed'), 'comes after the B&W block');
  const block = css.slice(at, css.indexOf('/* ---- Rhymes dock')), sel = ':root:is([data-tone="terminal"], [data-tone="amber"], [data-tone="hc-yellow"], [data-tone="eink"])';
  assert.ok(block.includes(sel + ' :is(#clearBtn, #save, #counts b, .seg button[aria-pressed="true"], .tog[aria-pressed="true"], .tone-grid button[aria-pressed="true"]) {\n  background: var(--ink); color: var(--bg); border-color: var(--ink); box-shadow: none;'));
  assert.match(block, /:is\(\.clear, #save\)\[aria-disabled="true"\] \{ opacity: 1; outline: 2px solid var\(--bg\); outline-offset: -4px; \}/);
  assert.doesNotMatch(block.replace(/\/\*[\s\S]*?\*\//g, ''), /dashed/, 'no dashed lines in the retro tones');
  assert.match(css.slice(css.indexOf(':root[data-tone="hc-bw"] :is(.clear, #save)[aria-disabled="true"]')), /^[^\n]*dashed/, 'B&W keeps its dashed ring');
  for (const tone of ['terminal', 'amber', 'hc-yellow', 'eink']) for (const extra of ['', '[data-theme="dark"]']) {
    const p = palette(':root[data-tone="' + tone + '"]' + extra);
    assert.ok(ratio(p.ink, p.bg) >= 7, tone + extra + ' inverted solids need AAA contrast, got ' + ratio(p.ink, p.bg).toFixed(1));
  }
});

// ---- Rhymes
const Rhymes = require('../js/rhymes.js'), RhymePanelApi = require('../js/rhymes-ui.js'), AppMirror = require('../js/mirror.js');
const rhymeFixture = () => [
  'light l ay1 t', 'night n ay1 t', 'daylight d ey1 l ay2 t', 'bite b ay1 t', 'height h ay1 t', 'kite k ay1 t', 'alight ah0 l ay1 t',
  'moon m uw1 n', 'moonlight m uw1 n l ay2 t', 'mine m ay1 n', 'time t ay1 m', 'tin t ih1 n', 'read r iy1 d', 'bread b r eh1 d', 'red r eh1 d',
  'day d ey1', 'lighthouse l ay1 t hh aw2 s', ...Array.from({length: 99990}, (_, i) => 'zq' + i + ' k ae1 t'),
  'cat k ae1 t', "can't k ae1 n t", 'caramel k eh1 r ah0 m ah0 l', 'ending eh1 n d ih0 ng'
].join('\n') + '\n';
test('rhymes: perfect and near rhymes, grouped by syllable count, excluding the word and its compounds', () => {
  const d = Rhymes.parse(rhymeFixture()), r = d.find('light');
  assert.equal(r.word, 'light'); assert.equal(r.syllables, 1); assert.equal(r.pronunciation.join(' '), 'l ay1 t');
  assert.deepEqual(r.perfect[1], ['bite', 'height', 'kite', 'night']);
  assert.deepEqual(r.perfect[2], ['alight'], 'a real prefix word is a rhyme'); assert.ok(!Object.values(r.perfect).flat().includes('daylight'), 'a compound of the word is not');
  assert.deepEqual(r.near[1], ['mine', 'time']); assert.ok(!Object.values(r.near).flat().includes('light'));
  assert.deepEqual(d.find('Light').perfect, r.perfect, 'case-insensitive');
});
test('rhymes: strict hides rich rhymes (same sound before the rhyme); near rhymes use the stressed vowel only', () => {
  const d = Rhymes.parse(rhymeFixture());
  const lax = d.find('bread'), strict = d.find('bread', {strict: true});
  assert.ok(lax.perfect[1].includes('red'), 'bread/red share the sound before the rhyme (r), so they are rich');
  assert.equal(strict.perfect[1], undefined, 'hidden when rich rhymes are hidden');
  assert.deepEqual(d.find('night', {strict: true}).perfect[1].includes('light'), true);
  assert.equal(Object.values(d.find('kite', {strict: true}).perfect).flat().includes('kite'), false);
});
test('rhymes: unknown words give null; apostrophes and edge quotes are handled', () => {
  const d = Rhymes.parse(rhymeFixture());
  assert.equal(d.find('zzzznotaword'), null); assert.equal(d.find("'cat'").word, 'cat'); assert.ok(d.find("can't"));
});
test('rhymes: parseAsync builds the same index as parse, in slices, with progress', async () => {
  const text = rhymeFixture(), seen = [];
  const sync = Rhymes.parse(text), async = await Rhymes.parseAsync(text, f => seen.push(f));
  assert.equal(async.pron.size, sync.pron.size); assert.deepEqual(async.find('light'), sync.find('light'));
  assert.ok(seen.length >= 10 && seen.every((f, i) => f >= 0 && f <= 1 && (!i || f >= seen[i - 1])), 'monotonic progress');
});
test('rhyme panel helpers: word at caret or selection, apostrophes, capitalization', () => {
  const w = RhymePanelApi.wordAt;
  assert.deepEqual(w('the moonlight fades', 7, 7), {word: 'moonlight', start: 4, end: 13});
  assert.deepEqual(w('the moonlight fades', 13, 13), {word: 'moonlight', start: 4, end: 13}, 'caret at the end of a word');
  assert.deepEqual(w('don’t go', 2, 2), {word: "don't", start: 0, end: 5});
  assert.equal(w('a  b', 2, 2), null); assert.equal(w('', 0, 0), null); assert.equal(w('one two', 0, 7), null, 'a selection of two words is not a word');
  assert.deepEqual(w('one two', 4, 7), {word: 'two', start: 4, end: 7});
  const m = RhymePanelApi.matchCase; assert.equal(m('Night', 'light'), 'Light'); assert.equal(m('night', 'light'), 'light'); assert.equal(m('NIGHT', 'light'), 'LIGHT'); assert.equal(m('I', 'eye'), 'Eye');
});

// A tiny DOM, enough to drive RhymePanel.attach without a browser.
function miniDom() {
  class N {
    constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.events = {}; this.className = ''; this._text = ''; this.checked = false; }
    set textContent(v) { this._text = String(v); this.children = []; } get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return this.attrs[k] ?? null; }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(k, f) { (this.events[k] ??= []).push(f); } emit(k, e = {}) { (this.events[k] || []).forEach(f => f({preventDefault() {}, ...e})); }
    get classList() { const self = this; return {add: k => { if (!self.className.split(' ').includes(k)) self.className = (self.className + ' ' + k).trim(); }}; }
    all(pred, out = []) { if (pred(this)) out.push(this); this.children.forEach(c => c.all(pred, out)); return out; }
    querySelector(sel) { const c = sel.slice(1); return this.all(n => sel[0] === '.' ? n.className.split(' ').includes(c) : n.tag === sel)[0] || null; }
  }
  return N;
}
function panelHarness(text, caret, dictText = rhymeFixture(), extra = {}) {
  const N = miniDom(), docListeners = {}, log = [];
  global.document = {createElement: t => new N(t), createTextNode: t => Object.assign(new N('#text'), {_text: String(t)}), addEventListener: (k, f) => { docListeners[k] = f; }, removeEventListener() {}, execCommand: () => false, activeElement: null};
  global.Event = class { constructor(type) { this.type = type; } };
  const ta = Object.assign(new N('textarea'), {
    value: text, selectionStart: caret, selectionEnd: caret, focus() { document.activeElement = ta; },
    setSelectionRange(a, b) { ta.selectionStart = a; ta.selectionEnd = b; }, dispatchEvent(e) { log.push(e.type); ta.emit(e.type); }
  });
  const box = new N('div'), said = [];
  const mirror = extra.mirrorEl ? AppMirror.create({textarea: ta, el: extra.mirrorEl, document: global.document}) : undefined;
  const panel = RhymePanelApi.attach({textarea: ta, container: box, dict: Rhymes.parse(dictText), say: m => said.push(m), mirror, ...extra});
  const pills = () => box.all(n => n.className.split(' ').includes('rhyme-pill') && !n.className.includes('rhyme-more'));
  return {ta, box, panel, log, said, pills, btn: label => box.all(n => n.tag === 'button' && n.textContent === label)[0]};
}
test('rhyme panel: edge cases are explained (no word, no pronunciation, no results)', () => {
  assert.match(panelHarness('', 0).box.textContent, /Tap a word to see rhymes\./);
  assert.match(panelHarness('one  two', 4).box.textContent, /Tap a word/);
  assert.match(panelHarness('a zzzznotaword b', 5).box.textContent, /No pronunciation found for “zzzznotaword”\./);
  assert.match(panelHarness('ending', 2).box.textContent, /No exact rhymes found\. Turn on Include near rhymes/);
  const h = panelHarness('ending', 2, undefined, {mode: 'near'}); assert.match(h.box.textContent, /1 syllable|2 syllables/, 'near rhymes found by vowel');
});
test('rhyme panel: choosing a word replaces it, keeps capitalization, fires input, and has no in-panel Perfect/Near or rich-rhyme controls', () => {
  const h = panelHarness('the Night ends', 6);
  assert.equal(/Rhymes for/.test(h.box.textContent), false, 'no header row in the panel'); assert.deepEqual(h.pills().map(p => p.textContent).slice(0, 3), ['bite', 'height', 'kite']);
  const kite = h.pills().find(p => p.textContent === 'kite'); kite.emit('click', {});
  assert.equal(h.ta.value, 'the Kite ends'); assert.deepEqual(h.log, ['input'], 'the app is told to recount exactly once');
  assert.equal(h.ta.selectionStart, 8, 'the caret is placed after the new word'); assert.ok(h.said.some(m => /Replaced Night with Kite/.test(m)));
  assert.equal(h.btn('Perfect'), undefined); assert.equal(h.btn('Near'), undefined); assert.equal(h.box.querySelector('.rhyme-strict'), null); assert.equal(h.box.querySelector('input'), null);
});
test('rhyme panel: defaults to perfect with rich rhymes hidden; setOptions switches them from outside', () => {
  const h = panelHarness('night', 2), keys = () => h.pills().map(p => p.textContent);
  assert.ok(keys().includes('kite'));
  h.panel.setOptions({mode: 'near'}); assert.ok(!keys().includes('kite'), 'near rhymes are a different list');
  h.panel.setOptions({mode: 'perfect', strict: false}); assert.ok(keys().includes('kite'));
});
test('rhyme panel: shift-click copies instead of replacing; a selection is replaced in place', () => {
  const copied = [], savedNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {value: {clipboard: {writeText: t => { copied.push(t); return Promise.resolve(); }}}, configurable: true});
  const h = panelHarness('light', 0); h.ta.selectionStart = 0; h.ta.selectionEnd = 5;
  h.panel.refresh(); h.pills()[0].emit('click', {shiftKey: true});
  assert.deepEqual(copied, ['bite']); assert.equal(h.ta.value, 'light'); assert.deepEqual(h.log, []);
  h.pills()[0].emit('click', {}); assert.equal(h.ta.value, 'bite');
  if (savedNav) Object.defineProperty(globalThis, 'navigator', savedNav); else delete globalThis.navigator;
});
test('rhyme panel: long groups are capped at 24 with a +N more button', () => {
  const words = Array.from({length: 30}, (_, i) => 'w' + String.fromCharCode(97 + i % 26) + String.fromCharCode(97 + (i / 26 | 0)) + ' k ae1 t').join('\n');
  const h = panelHarness('cat', 1, rhymeFixture() + words + '\n', {strict: false});
  const group = () => h.box.all(n => n.className.includes('rhyme-group') && !n.className.includes('label'))[0];
  assert.equal(h.pills().filter(p => p.className === 'rhyme-pill').length, 24 + 0, 'capped');
  const more = h.box.all(n => n.className.includes('rhyme-more'))[0]; assert.match(more.textContent, /^\+\d+ more$/); more.emit('click');
  assert.equal(h.box.all(n => n.className.includes('rhyme-more')).length, 0, 'all shown after expanding'); assert.ok(h.pills().length > 24);
});

// ---- Rhymes: app wiring and data loading
const rhymeApp = (saved = {}, over = {}) => {
  const calls = {pron: 0, parse: 0, attach: [], say: []};
  const globals = {
    CMUDictionary: {load: () => new Promise(() => {}), pronunciations: async progress => { calls.pron++; progress('Downloading rhyme data\u2026 1.0 MB', 0.5); if (over.fail) throw new Error(over.fail); return 'text'; }},
    Rhymes: {parseAsync: async (text, onProgress) => { calls.parse++; onProgress(0.5); return {pron: {size: over.size ?? 120000}}; }},
    RhymePanel: {attach: o => { calls.attach.push(o); return {setOptions() {}, refresh() { calls.refreshed = (calls.refreshed || 0) + 1; }}; }}
  };
  return {b: boot(saved, true, {globals}), calls};
};
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
test('rhymes setting: off by default, dock hidden, options hidden, nothing downloaded', async () => {
  const {b, calls} = rhymeApp(), n = b.nodes; await settle();
  assert.equal(AppPreferences.defaults['syl-rhymes'], 'off'); assert.equal(n.rhymesEnabled.checked, false);
  assert.equal(n.rhymeDock.hidden, true); assert.equal(n.rhymeOptions.hidden, true); assert.equal(calls.pron, 0);
});
test('rhymes setting: enabling loads the dictionary, shows the dock and options, defaults to exact rhymes with rich rhymes excluded', async () => {
  const store = {}, {b, calls} = rhymeApp(store), n = b.nodes;
  n.rhymesEnabled.checked = true; n.rhymesEnabled.emit('change'); await settle();
  assert.equal(n.rhymeDock.hidden, false); assert.equal(n.rhymeOptions.hidden, false);
  assert.equal(calls.pron, 1); assert.equal(calls.attach.length, 1);
  assert.equal(calls.attach[0].mode, 'perfect'); assert.equal(calls.attach[0].strict, true);
  assert.equal(n.rhymeNear.checked, false, 'Include near rhymes is off: exact rhymes only'); assert.equal(n.rhymeRich.checked, false, 'Include rich rhymes is off');
  assert.equal(store['syl-rhymes'], 'on');
});
test('rhymes setting: Perfect/Near and Include rich rhymes drive the panel and persist; Reset turns it all off', async () => {
  const store = {'syl-rhymes': 'on'}, {b, calls} = rhymeApp(store); const n = b.nodes; await settle();
  assert.equal(calls.pron, 1, 'a saved setting loads the dictionary at start'); assert.equal(n.rhymeDock.hidden, false);
  assert.equal(n.rhymeToggle.getAttribute('aria-expanded'), 'true', 'the dock starts expanded');
  n.rhymeNear.checked = true; n.rhymeNear.emit('change'); n.rhymeRich.checked = true; n.rhymeRich.emit('change');
  assert.equal(store['syl-rhymes-type'], 'near'); assert.equal(store['syl-rhymes-include-rich'], 'on');
  n.rhymeToggle.click(); assert.equal(n.rhymePanel.hidden, true); assert.equal(store['syl-rhymes-open'], 'off');
  n.resetPrefs.click(); await settle();
  assert.equal(n.rhymesEnabled.checked, false); assert.equal(n.rhymeDock.hidden, true); assert.equal(n.rhymeOptions.hidden, true);
  assert.equal(n.rhymeNear.checked, false); assert.equal(n.rhymeRich.checked, false); assert.equal(n.rhymePanel.hidden, false);
});
test('rhymes setting: the panel markup no longer holds Perfect/Near or Include rich rhymes', () => {
  assert.doesNotMatch(read('js/rhymes-ui.js'), /rich rhymes|'Perfect'|rhyme-seg/);
  assert.match(read('index.html'), /id="rhymeRich"[\s\S]{0,200}Include rich rhymes/);
  const html = read('index.html'), adv = html.slice(html.indexOf('id="advancedAcc"'));
  for (const id of ['rhymesEnabled', 'rhymeNear', 'rhymeRich']) assert.ok(adv.includes('id="' + id + '"'), id + ' lives in Dictionary Options');
  assert.match(adv, /Include near rhymes/); assert.doesNotMatch(adv, /Hide near rhymes/); assert.doesNotMatch(html, /id="rhymePerfect"/);
});
test('rhymes dock: a failed load explains itself and offers Try again; unusable data is refused', async () => {
  const on = {'syl-rhymes': 'on'};
  const bad = rhymeApp(on, {fail: 'Rhymes need the full dictionary at data/cmudict.dict'}), n = bad.b.nodes; await settle();
  assert.match(n.rhymePanel.children[0].text, /Rhymes need the full dictionary/); assert.equal(n.rhymePanel.children[1].text, 'Try again'); assert.equal(bad.calls.attach.length, 0);
  const small = rhymeApp(on, {size: 10}); await settle();
  assert.match(small.b.nodes.rhymePanel.children[0].text, /not a full CMUdict/); assert.equal(small.calls.attach.length, 0);
});

test('pronunciations: read from this site first and never from GitHub when the file is there', async () => {
  const {dict, calls} = loader({'data/cmudict.dict': 'cat k ae1 t\n'}), seen = [];
  assert.equal(await dict.pronunciations((m, f) => seen.push(m)), 'cat k ae1 t\n');
  assert.deepEqual(calls.map(c => c.url), ['data/cmudict.dict']);
});
test('pronunciations: falls back to GitHub when the site has no file (or an HTML page), and says what to run when it may not', async () => {
  for (const local of [undefined, '<!doctype html><title>app</title>']) {
    const {dict, calls} = loader({...(local ? {'data/cmudict.dict': local} : {}), ...upstreamRoutes()});
    assert.ok((await dict.pronunciations(() => {})).length > 1000); assert.ok(calls.some(c => c.url.startsWith('https://raw.githubusercontent.com/')));
  }
  await assert.rejects(loader({}, {upstreamFallback: false}).dict.pronunciations(() => {}), /node tools\/cmudict\.js fetch --full/);
  const net = new TypeError('Failed to fetch');
  await assert.rejects(loader({'data/cmudict.dict': net}, {upstreamFallback: false}).dict.pronunciations(() => {}), e => e.kind === 'network' && /Check your connection/.test(e.message));
});

// ---- Rhymes: word frequency
test('frequency: parseFrequency ranks by line order, skips comments and duplicates, lowercases', () => {
  const r = Rhymes.parseFrequency('# note\nThe\nof\n\nthe\nAnd\n');
  assert.deepEqual([...r], [['the', 0], ['of', 1], ['and', 2]]);
});
test('frequency: common words come first in every group, the rest alphabetically; works with parse and parseAsync', async () => {
  const text = rhymeFixture() + 'zebra z ay1 t\napple ae1 p ay1 t\n';
  for (const d of [Rhymes.parse(text), await Rhymes.parseAsync(text)]) {
    assert.deepEqual(d.find('light').perfect[1], ['bite', 'height', 'kite', 'night', 'zebra'], 'alphabetical before a list is set');
    assert.equal(d.hasFrequency(), false);
    d.setFrequency(Rhymes.parseFrequency('night\nzebra\nkite\n'));
    assert.equal(d.hasFrequency(), true);
    assert.deepEqual(d.find('light').perfect[1], ['night', 'zebra', 'kite', 'bite', 'height'], 'ranked words first, then alphabetical');
    assert.deepEqual(d.find('light').near[1], ['mine', 'time'], 'unranked groups stay alphabetical');
    d.setFrequency(null); assert.equal(d.hasFrequency(), false);
  }
});
test('frequency: the shipped list is 25,000 words, most common first, unfiltered and not limited to CMUdict, with its license header', () => {
  const text = read('data/wordfreq-en.txt'), rank = Rhymes.parseFrequency(text);
  assert.equal(rank.size, 25000); assert.equal(rank.get('the'), 0); assert.ok(rank.get('of') < rank.get('and'));
  assert.ok(rank.has('00') && rank.has('u.s'), 'numbers and abbreviations are kept, not limited to dictionary words');
  assert.match(text.slice(0, 600), /CC BY-SA|Attribution-ShareAlike 4\.0/); assert.match(text.slice(0, 600), /Changed: log-frequencies removed/);
  assert.match(read('index.html'), /wordfreq<\/a>[\s\S]{0,300}CC BY-SA 4\.0/); assert.match(read('THIRD_PARTY_NOTICES.md'), /## wordfreq/);
});
test('frequency: the app loads the list after the rhyme data, and works without it', async () => {
  const set = [], calls = {};
  const mk = (ok, body) => ({
    CMUDictionary: {load: () => new Promise(() => {}), pronunciations: async () => 'text', fetchText: async url => { calls.url = url; if (!ok) throw new Error('HTTP 404'); return body; }},
    Rhymes: {parseAsync: async () => ({pron: {size: 120000}, setFrequency: r => set.push(r)}), parseFrequency: t => 'ranked:' + t},
    RhymePanel: {attach: () => ({refresh() {}})}
  });
  const a = boot({'syl-rhymes': 'on'}, true, {globals: mk(true, 'the\nof\n')}); await tick(); await tick(); await tick(); await tick();
  assert.equal(calls.url, 'data/wordfreq-en.txt'); assert.deepEqual(set, ['ranked:the\nof\n']);
  for (const [ok, body] of [[false, ''], [true, '<!doctype html>']]) {
    set.length = 0; const b = boot({'syl-rhymes': 'on'}, true, {globals: mk(ok, body)}); await tick(); await tick(); await tick(); await tick();
    assert.deepEqual(set, [], 'a missing file or an HTML error page is ignored'); assert.equal(b.nodes.rhymePanel.hidden, false);
  }
});
test('tools: wordfreq.js writes the ordered list, refuses bad input', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-')), out = path.join(dir, 'w.txt');
  const rows = Array.from({length: 1200}, (_, i) => ['w' + i, -1 - i / 1000]); rows[3][0] = 'W0'; rows.push(['w5', -9]);
  fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(rows));
  const run = a => new Promise(resolve => execFile(process.execPath, [path.join(base, 'tools', 'wordfreq.js'), ...a], (error, stdout, stderr) => resolve({code: error ? error.code : 0, stdout, stderr})));
  const r = await run([path.join(dir, 'in.json'), '--out', out]); assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /1,199 words/);
  const lines = fs.readFileSync(out, 'utf8').split('\n').filter(l => l && l[0] !== '#'); assert.equal(lines[0], 'w0'); assert.equal(lines[3], 'w4', 'the lowercased duplicate W0 was dropped'); assert.equal(new Set(lines).size, lines.length);
  fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify([['a', -5], ['b', -1]]));
  assert.notEqual((await run([path.join(dir, 'bad.json'), '--out', out])).code, 0);
  assert.notEqual((await run([path.join(dir, 'missing.json')])).code, 0);
});

// ---- Pre-compressed (.gz) data files, unpacked in the browser
const zlib2 = require('node:zlib');
const gzEnv = {DecompressionStream, Blob, Response};
const gzOf = text => zlib2.gzipSync(text, {level: 9});
test('gz twin: preferred when the browser can unpack it, hashed as the plain text, and the plain file is never requested', async () => {
  const plain = SyllableCounter.serializeCounts(await SyllableCounter.parse(synthDict()), ['t']);
  const {dict, calls} = loader({'data/cmudict.counts.txt.gz': {bytes: gzOf(plain), headers: {'content-length': String(gzOf(plain).length)}}, 'data/cmudict.counts.txt': plain}, {}, null, gzEnv);
  const seen = [], r = await dict.load((m, f, tick) => tick && seen.push(f));
  assert.equal(r.source, 'data/cmudict.counts.txt'); assert.ok(Object.keys(r.entries).length > 100000);
  assert.equal(r.sourceSHA256, sha256(plain), 'the hash is of the unpacked text, so cmudict.json stays valid');
  assert.equal(calls.some(c => c.url === 'data/cmudict.counts.txt'), false); assert.ok(seen.length && seen.at(-1) === 1, 'progress follows the compressed bytes');
});
test('gz twin: falls back to the plain file when it is absent, an HTML page, damaged, or the browser cannot unpack gzip', async () => {
  const plain = SyllableCounter.serializeCounts(await SyllableCounter.parse(synthDict()), ['t']);
  const bad = Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.from('not really gzip')]);
  for (const [twin, env] of [[undefined, gzEnv], ['<!doctype html><title>x</title>', gzEnv], [{bytes: bad}, gzEnv], [{bytes: gzOf(plain)}, {}]]) {
    const {dict, calls} = loader({...(twin ? {'data/cmudict.counts.txt.gz': twin} : {}), 'data/cmudict.counts.txt': plain}, {}, null, env);
    const r = await dict.load(); assert.equal(r.source, 'data/cmudict.counts.txt'); assert.equal(r.sourceSHA256, sha256(plain));
    assert.equal(calls.some(c => c.url.endsWith('.gz')), Object.keys(env).length > 0, 'no .gz request when it cannot be unpacked');
  }
});
test('gz twin: a host that already decoded the .gz (Content-Encoding: gzip) still works', async () => {
  const plain = SyllableCounter.serializeCounts(await SyllableCounter.parse(synthDict()), ['t']);
  const {dict} = loader({'data/cmudict.counts.txt.gz': {bytes: Buffer.from(plain), headers: {'content-encoding': 'gzip', 'content-length': '1'}}}, {}, null, gzEnv);
  assert.ok(Object.keys((await dict.load()).entries).length > 100000);
});
test('gz twin: also used for the full dictionary (rhyme data) and the frequency list; fetchText is exported', async () => {
  const full = synthDict(), {dict, calls} = loader({'data/cmudict.dict.gz': {bytes: gzOf(full)}, 'data/cmudict.dict': 'x'}, {}, null, gzEnv);
  assert.equal(await dict.pronunciations(() => {}), full); assert.equal(calls.some(c => c.url === 'data/cmudict.dict'), false);
  const f = loader({'data/wordfreq-en.txt.gz': {bytes: gzOf('the\nof\n')}}, {}, null, gzEnv);
  assert.equal(await f.dict.fetchText('data/wordfreq-en.txt'), 'the\nof\n');
});
test('tools: every data file written also has a .gz twin that unpacks to the same bytes', async () => {
  const server = await toolServer({'/cmudict.dict': synthDict(), '/LICENSE': bundledLicense()}), out = fs.mkdtempSync(path.join(os.tmpdir(), 'cmu-'));
  try {
    const r = await runTool(['fetch', '--from', server.url, '--out', out, '--full']); assert.equal(r.code, 0, r.stderr);
    for (const name of ['cmudict.counts.txt', 'cmudict.dict']) {
      const plain = fs.readFileSync(path.join(out, name)), twin = fs.readFileSync(path.join(out, name + '.gz'));
      assert.deepEqual(zlib2.gunzipSync(twin), plain, name); assert.ok(twin.length < plain.length * 0.5, name + ' is much smaller');
    }
    const meta = JSON.parse(fs.readFileSync(path.join(out, 'cmudict.json'), 'utf8'));
    assert.equal(sha256(fs.readFileSync(path.join(out, 'cmudict.counts.txt'), 'utf8')), meta.sourceSHA256, 'the hash is of the plain text');
  } finally { await server.close(); }
  const shipped = ['data/cmudict.counts.txt', 'data/wordfreq-en.txt'];
  for (const name of shipped) assert.equal(zlib2.gunzipSync(fs.readFileSync(path.join(base, name + '.gz'))).toString('utf8'), read(name), name + '.gz matches its plain file');
});

test('Typewrencher name: title, heading, About, welcome dialog and spinner; no leftover old name', () => {
  const html = read('index.html');
  assert.match(html, /<title>Typewrencher™<\/title>/);
  assert.match(html, /<h1 class="sr">Typewrencher™<\/h1>/);
  assert.match(html, /<summary>About Typewrencher™ <svg class="wh-icon"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html, /Syllable Counter/);
  const dlg = html.slice(html.indexOf('id="welcomeDlg"'));
  assert.doesNotMatch(dlg.slice(0, dlg.indexOf('</dialog>')), /M12 2a9 9 0/, 'the skull is gone from the loading dialog');
  assert.match(dlg, /<svg class="hammer"/);
});

test('Export Options: the group spans the full width on desktop (no narrow label column)', () => {
  const html = read('index.html'), css = read('css/styles.css');
  assert.match(html, /id="exportAcc"[\s\S]*?<div class="opt opt-solo">/);
  assert.match(css, /\.opt:not\(\.opt-solo\) \{\s*grid-template-columns: 5\.5rem/);
});
test('Include rich rhymes: off by default means strict (rich rhymes hidden); on passes strict false', async () => {
  const {b, calls} = rhymeApp({'syl-rhymes': 'on'}); await settle();
  assert.equal(calls.attach[0].strict, true); assert.equal(AppPreferences.defaults['syl-rhymes-include-rich'], 'off');
  const on = rhymeApp({'syl-rhymes': 'on', 'syl-rhymes-include-rich': 'on'}); await settle();
  assert.equal(on.calls.attach[0].strict, false); assert.equal(on.b.nodes.rhymeRich.checked, true);
});

test('erase confirmation is a solid bright red with white text; the download says Exporting, not Saved', () => {
  const css = read('css/styles.css'), js = read('js/app.js');
  assert.match(css, /\.clear\.armed \{ color: #fff; border-color: #e00000; background: #e00000;/);
  assert.equal(/flash\("Saved"\)/.test(js), false); assert.equal((js.match(/flash\("Exporting"\)/g) || []).length, 2);
});

// ---- Count/line alignment: one whole-pixel line height, rows snapped to whole text lines
test('alignment: --lh is a whole number of pixels at every size, narrow and wide', () => {
  const style = fs => ({fontSize: fs});
  const narrow = boot({}, true, {globals: {getComputedStyle: () => style('16px')}}), root = narrow.document.documentElement;
  assert.equal(root.style['--lh'], '32px');
  narrow.nodes.sizeUp.click(); assert.equal(root.style['--lh'], '37px', '32 x 1.15 = 36.8 rounds to 37');
  const wide = boot({}, true, {globals: {getComputedStyle: () => style('16px'), matchMedia: q => ({matches: q.includes('800px'), addEventListener() {}})}});
  assert.equal(wide.document.documentElement.style['--lh'], '37px', '2.3rem = 36.8 rounds to 37');
  for (let i = 0; i < 3; i++) wide.nodes.sizeUp.click();
  assert.equal(wide.document.documentElement.style['--lh'], '55px', '36.8 x 1.5 = 55.2 rounds to 55');
  const big = boot({'syl-textsize': '6'}, true, {globals: {getComputedStyle: () => style('20px')}});
  assert.equal(big.document.documentElement.style['--lh'], String(Math.round(2 * 20 * 1.75)) + 'px', 'follows a larger root font size');
});
test('alignment: measured rows snap to whole text lines, so tiny differences cannot accumulate', () => {
  const b = boot({}, true, {globals: {getComputedStyle: () => ({fontSize: '16px', lineHeight: '31.6px', paddingLeft: '16px', paddingRight: '20px'})}});
  b.nodes.ed.value = 'one\ntwo'; b.nodes.ed.emit('input');
  assert.match(b.nodes.counts.html, /style="height:31\.6px"/, 'a 32px measurement on a 31.6px line is exactly one line');
  assert.doesNotMatch(b.nodes.counts.html, /height:32px/);
});
test('alignment: the hidden copy takes its wrapping from the text box; text is not auto-resized; rows are flex-aligned', () => {
  const css = read('css/styles.css'), js = read('js/app.js');
  assert.match(css, /html \{ -webkit-text-size-adjust: 100%; text-size-adjust: 100%;/);
  assert.match(css, /#ed, #measure, #hl \{ letter-spacing: normal; word-spacing: normal; word-break: normal;/);
  assert.match(css, /#counts div \{[^}]*display: flex;[^}]*align-items: flex-start;/);
  assert.match(css, /margin-top: calc\(\(var\(--lh\) - 1\.55rem\) \/ 2\)/);
  for (const k of ['fontFamily', 'letterSpacing', 'wordBreak', 'overflowWrap', 'tabSize']) assert.ok(js.includes('"' + k + '"'), k + ' is copied');
  for (const hook of ['orientationchange', 'visualViewport', 'document.fonts.ready', 'loadingdone']) assert.ok(js.includes(hook), hook + ' re-measures');
});

// ---- Icon, manifest and offline support
const pngSize = file => { const b = fs.readFileSync(path.join(base, file)); assert.equal(b.slice(1, 4).toString(), 'PNG', file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
test('manifest and icons: installable name, standalone display, real icon files of the declared sizes', () => {
  const m = JSON.parse(read('manifest.webmanifest'), (k, v) => v);
  assert.equal(m.name, 'Typewrencher'); assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './');
  for (const icon of m.icons) {
    assert.ok(fs.existsSync(path.join(base, icon.src)), icon.src);
    if (icon.type === 'image/png') assert.deepEqual(pngSize(icon.src), icon.sizes.split('x').map(Number), icon.src);
  }
  assert.ok(m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512')); assert.ok(m.icons.some(i => i.sizes === '192x192'));
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/); assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" href="icons\/icon\.svg" type="image\/svg\+xml">/); assert.match(html, /<meta name="apple-mobile-web-app-title" content="Typewrencher">/);
  assert.match(html, /<meta name="theme-color" content="#020502">/);
});
test('offline: the app registers the service worker on https or localhost only, and the page works if it cannot', () => {
  assert.match(read('js/app.js'), /navigator\.serviceWorker\.register\('sw\.js'\)\.catch\(\(\) => \{\}\)/);
  assert.match(read('js/app.js'), /location\.protocol === 'https:' \|\| location\.hostname === 'localhost'/);
  const registered = []; const b = boot({}, true, {globals: {navigator: {serviceWorker: {register: u => { registered.push(u); return Promise.resolve(); }}}, location: {protocol: 'http:', hostname: 'example.com'}}});
  assert.deepEqual(registered, [], 'no registration on plain http');
  boot({}, true, {globals: {navigator: {}, location: {protocol: 'https:', hostname: 'example.com'}}}); // no serviceWorker support: no error
});
test('offline: sw.js lists every css/js reference, the manifest, icons and data; its version tracks the files', async () => {
  const sw = read('sw.js'), core = JSON.parse(/const CORE = (\[.*?\]);/.exec(sw)[1]), optional = JSON.parse(/const OPTIONAL = (\[.*?\]);/.exec(sw)[1]);
  for (const u of read('index.html').match(/(?:css|js)\/[^"]+\?v=[a-f0-9]{10}/g)) assert.ok(core.includes(u), u);
  for (const f of ['index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png']) assert.ok(core.includes(f), f);
  for (const f of ['data/cmudict.json', 'data/variable-words.txt', 'data/CMUdict-LICENSE.txt']) assert.ok(optional.includes(f), f);
  assert.ok(optional.some(f => /^data\/cmudict\.counts\.txt(\.gz)?$/.test(f))); assert.equal(optional.some(f => /cmudict\.dict/.test(f)), false, 'the 3.5 MB rhyme dictionary is saved only once Rhymes uses it');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swstamp-'));
  const copy = f => { fs.mkdirSync(path.dirname(path.join(dir, f)), {recursive: true}); fs.copyFileSync(path.join(base, f), path.join(dir, f)); };
  ['index.html', 'sw.js', 'manifest.webmanifest', 'tools/stamp.js', 'css/styles.css', ...fs.readdirSync(path.join(base, 'js')).map(f => 'js/' + f), ...fs.readdirSync(path.join(base, 'icons')).map(f => 'icons/' + f),
    'data/cmudict.json', 'data/cmudict.counts.txt.gz', 'data/variable-words.txt', 'data/CMUdict-LICENSE.txt'].forEach(copy);
  await runStamp(dir); // this folder holds fewer data files than the project, so its version differs until stamped
  assert.equal((await runStamp(dir, '--check')).code, 0);
  fs.appendFileSync(path.join(dir, 'data/variable-words.txt'), '\n# edit\n');
  const stale = await runStamp(dir, '--check'); assert.equal(stale.code, 1); assert.match(stale.stderr, /sw\.js is out of date/);
  const before = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'); assert.match((await runStamp(dir)).stdout, /Updated sw\.js/);
  assert.notEqual(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'), before); assert.equal((await runStamp(dir, '--check')).code, 0);
});
function swHarness({online = true, origin = 'https://x.test'} = {}) {
  const store = new Map(), caches = new Map(), listeners = {}, fetched = [];
  const makeCache = name => caches.get(name) || (caches.set(name, new Map()), caches.get(name));
  const cacheApi = {
    keys: async () => [...caches.keys()], delete: async k => caches.delete(k),
    open: async name => { const c = makeCache(name), keyOf = r => (typeof r === 'string' ? r : r.url); return {
      add: async r => { const res = await ctx.fetch(r); c.set(keyOf(r), res); }, put: async (r, res) => { c.set(keyOf(r), res); },
      match: async r => c.get(keyOf(r)), keys: async () => [...c.keys()] }; }
  };
  const state = {online};
  const ctx = {
    caches: cacheApi, console, setTimeout, clearTimeout, AbortController, URL,
    Request: class { constructor(url, init = {}) { this.url = new URL(url, 'https://x.test/').href; Object.assign(this, init); } },
    fetch: async (r) => { const url = typeof r === 'string' ? new URL(r, 'https://x.test/').href : r.url; fetched.push(url + (r.cache ? '#' + r.cache : '')); if (!state.online) throw new TypeError('offline'); return {status: 200, type: 'basic', url, body: 'net:' + url, clone() { return this; }}; },
    self: {registration: {scope: origin + '/'}, location: {origin}, addEventListener: (k, f) => { listeners[k] = f; }, skipWaiting: async () => {}, clients: {claim: async () => {}}}
  };
  vm.createContext(ctx); vm.runInContext(read('sw.js').replace('const VERSION', 'var VERSION'), ctx);
  const send = async (k, event) => { let p; listeners[k]({...event, waitUntil: x => { p = x; }, respondWith: x => { p = x; }}); return p ? await p : undefined; };
  const get = (url, extra = {}) => { const e = {request: {method: 'GET', url, headers: {has: () => false}, mode: 'cors', cache: 'default', ...extra}}; let hit = null; listeners.fetch({...e, respondWith: x => { hit = x; }}); return hit; };
  return {caches, fetched, state, send, get, listeners};
}
test('offline worker: installs the file list, serves saved copies offline, never touches other sites or range requests', async () => {
  const w = swHarness(); await w.send('install', {}); await w.send('activate', {});
  assert.ok(w.caches.size === 1 && [...w.caches.keys()][0].startsWith('typewrencher-')); assert.ok(w.fetched.every(u => /#reload$/.test(u)), 'install bypasses the HTTP cache');
  const css = [...w.caches.values()][0], cssKey = [...css.keys()].find(k => k.includes('css/styles.css'));
  w.state.online = false;
  assert.equal((await w.get(cssKey)).body, 'net:' + cssKey, 'a saved stylesheet is served with no network');
  assert.equal((await w.get('https://x.test/', {mode: 'navigate'})).body.includes('index.html'), true, 'a page visit offline gets the saved page');
  assert.equal(w.get('https://other.example/x.js'), null); assert.equal(w.get('https://x.test/a.txt', {headers: {has: h => h === 'range'}}), null);
  assert.equal(w.get('https://x.test/a.txt', {method: 'POST'}), null);
  await assert.rejects(w.get('https://x.test/never-saved.js'), /offline/);
});
test('offline worker: online page loads use the network first and refresh the saved copy; "reload" requests never fall back', async () => {
  const w = swHarness(); await w.send('install', {});
  const nav = await w.get('https://x.test/index.html', {mode: 'navigate'}); assert.equal(nav.body, 'net:https://x.test/index.html');
  const meta = await w.get('https://x.test/data/cmudict.json'); assert.equal(meta.body, 'net:https://x.test/data/cmudict.json');
  w.state.online = false; assert.equal((await w.get('https://x.test/data/cmudict.json')).body, 'net:https://x.test/data/cmudict.json', 'offline: the saved meta file');
  await assert.rejects(w.get('https://x.test/data/cmudict.counts.txt', {cache: 'reload'}), /offline/, 'Reload Dictionary offline fails honestly');
  w.state.online = true; const re = await w.get('https://x.test/data/cmudict.counts.txt.gz', {cache: 'reload'}); assert.equal(re.body, 'net:https://x.test/data/cmudict.counts.txt.gz');
  w.state.online = false; assert.equal((await w.get('https://x.test/data/cmudict.counts.txt.gz')).body, 'net:https://x.test/data/cmudict.counts.txt.gz', 'a reloaded copy is saved');
});
test('offline worker: a new version deletes old saved copies', async () => {
  const w = swHarness(); w.caches.set('typewrencher-old', new Map()); w.caches.set('wordhammer-abc', new Map()); w.caches.set('other-app', new Map());
  await w.send('install', {}); await w.send('activate', {});
  assert.equal(w.caches.has('typewrencher-old'), false); assert.equal(w.caches.has('wordhammer-abc'), false, 'caches saved under the earlier name are cleaned up'); assert.equal(w.caches.has('other-app'), true, 'only this app’s caches');
});

test('retro_term and retro_amber are monochrome like B&W: one ink on one background, no tints, in light and dark', () => {
  for (const tone of ['terminal', 'amber', 'hc-yellow']) {
    for (const sel of [`:root[data-tone="${tone}"]`, `:root[data-tone="${tone}"][data-theme="dark"]`]) {
      const p = palette(sel), css = read('css/styles.css');
      const block = new RegExp(sel.replace(/[[\]"=]/g, m => '\\' + m) + ' \\{([^}]*)\\}').exec(css)[1];
      const val = name => new RegExp('--' + name + ':\\s*(#[0-9a-f]{6})').exec(block)[1];
      for (const name of ['muted', 'rule', 'count', 'focus', 'edge']) assert.equal(val(name), val('ink'), tone + ' ' + name + ' is the ink');
      for (const name of ['sheet', 'count-bg']) assert.equal(val(name), val('bg'), tone + ' ' + name + ' is the background');
      assert.ok(ratio(p.ink, p.bg) >= 7, sel + ' contrast ' + ratio(p.ink, p.bg).toFixed(1));
    }
  }
  const css = read('css/styles.css');
  assert.match(css, /:root\[data-tone="terminal"\] \.tone-grid button:not\(\[data-tone-choice="terminal"\]\) \.dot,\s*:root\[data-tone="amber"\] \.tone-grid button:not\(\[data-tone-choice="amber"\]\) \.dot,\s*:root\[data-tone="hc-yellow"\] \.tone-grid button:not\(\[data-tone-choice="hc-yellow"\]\) \.dot,\s*:root\[data-tone="eink"\] \.tone-grid button:not\(\[data-tone-choice="eink"\]\) \.dot \{ background: transparent; border: 2px solid var\(--ink\); \}/, 'each retro tone shows only its own swatch colour: the other retro swatch is a hollow ring');
  assert.match(css, /:root:is\(\[data-tone="terminal"\], \[data-tone="amber"\], \[data-tone="hc-yellow"\], \[data-tone="eink"\]\) #clearBtn\.armed \{ background: var\(--bg\); color: var\(--ink\); border: 3px double var\(--ink\); \}/, 'the red confirmation is inverted, not red, here');
});

test('licensing: CC0 for our code and word list; CMUdict and wordfreq keep their own notices', () => {
  const lic = read('LICENSE');
  assert.match(lic, /CC0 1\.0 Universal/); assert.match(lic, /Statement of Purpose/); assert.match(lic, /Public License Fallback/);
  assert.match(lic, /THIRD-PARTY MATERIAL IS NOT COVERED/); assert.match(lic, /Carnegie Mellon University/); assert.match(lic, /CC BY-SA 4\.0/);
  const NOTICE = 'Dedicated to the public domain under CC0 1.0 (see LICENSE).';
  for (const f of ['index.html', 'css/styles.css', 'sw.js', 'serve.js', 'tests/app.test.js', 'tools/cmudict.js', 'tools/stamp.js', 'tools/wordfreq.js', 'data/variable-words.txt',
    ...['app', 'counter', 'dialogs', 'dictionary', 'editor', 'preferences', 'rhymes', 'rhymes-ui', 'mirror'].map(n => 'js/' + n + '.js')]) assert.ok(read(f).slice(0, 900).includes(NOTICE), f + ' carries the CC0 notice');
  // Third-party files are never relabelled as CC0 and keep their notices.
  assert.equal(read('js/license.js').includes('CC0'), false); assert.match(read('js/license.js'), /Carnegie Mellon University/);
  assert.equal(read('data/wordfreq-en.txt').slice(0, 800).includes('CC0'), false);
  assert.match(read('data/wordfreq-en.txt').slice(0, 800), /Attribution-ShareAlike 4\.0/); assert.match(read('data/wordfreq-en.txt').slice(0, 800), /Changed: log-frequencies removed/);
  assert.equal(read('data/cmudict.counts.txt').slice(0, 800).includes('CC0'), false); assert.match(read('data/cmudict.counts.txt').slice(0, 800), /Carnegie Mellon University/);
  assert.match(read('data/CMUdict-LICENSE.txt'), /Carnegie Mellon University/); assert.match(read('licenses/CMUdict-LICENSE.txt'), /Carnegie Mellon University/);
  const html = read('index.html'); assert.match(html, /id="advancedLicense"/); assert.match(html, /wordfreq<\/a>[\s\S]{0,300}CC BY-SA 4\.0/);
  const third = read('THIRD_PARTY_NOTICES.md'); assert.match(third, /## CMUdict/); assert.match(third, /## wordfreq/); assert.match(third, /CC0 1\.0/);
  for (const f of ['js/app.js', 'js/rhymes.js', 'js/rhymes-ui.js', 'README.md', 'index.html']) assert.equal(/Syllable Counter/.test(read(f)), false, f + ' has no stale name');
});

test('rhyme panel: the checked word is marked in the mirror layer and the collapsed label names it', () => {
  const N = miniDom(), hl = new N('div'), titles = [];
  const h = panelHarness('the Night ends', 6, undefined, {mirrorEl: hl, onTitle: t => titles.push(t)});
  const mark = hl.all(n => n.tag === 'mark')[0];
  assert.ok(mark, 'a mark is drawn'); assert.equal(mark.textContent, 'Night'); assert.equal(hl.textContent.replace('\u200b', ''), 'the Night ends', 'the mirror holds the same text');
  const t = titles[titles.length - 1]; assert.equal(t.word, 'night'); assert.equal(t.count, 7); assert.match(t.detail, /1 syllable/);
  h.panel.setHighlight(false); assert.equal(hl.textContent, '', 'cleared when the panel closes or Rhymes is off');
  h.panel.setHighlight(true); assert.equal(hl.all(n => n.tag === 'mark')[0].textContent, 'Night');
  h.ta.value = 'the Night ends'; h.ta.setSelectionRange(1, 1); h.panel.refresh(); assert.equal(hl.all(n => n.tag === 'mark')[0].textContent, 'the', 'follows the caret to another word');
  h.ta.setSelectionRange(3, 3); h.ta.value = 'a  b'; h.ta.setSelectionRange(2, 2); h.panel.refresh();
  assert.equal(hl.all(n => n.tag === 'mark').length, 0, 'no mark between words'); assert.equal(titles[titles.length - 1], null);
  h.panel.destroy(); assert.equal(hl.textContent, '');
});
test('rhymes panel layout: collapsed one-line label, capped height, headerless list, highlight mirror CSS', () => {
  const css = read('css/styles.css'), html = read('index.html'), js = read('js/app.js');
  assert.match(html, /<span id="rhymeLabel">Rhymes<\/span>/); assert.match(html, /<\/textarea>\s*<div id="hl" aria-hidden="true"><\/div>/, 'the mirror follows the text box so it paints over it');
  assert.match(css, /\.rhyme-panel \{\s*max-height: 9rem;/); assert.equal(/\.rhyme-title/.test(css), false);
  assert.match(css, /#ed, #hl \{ grid-area: 1 \/ 2; \}/); assert.match(css, /#hl \{[^}]*pointer-events: none;[^}]*color: transparent;/);
  assert.match(css, /#ed\.wrap ~ #hl \{ white-space: pre-wrap;/);
  assert.match(css, /:root:is\(\[data-tone="hc-bw"\], \[data-tone="terminal"\], \[data-tone="amber"\], \[data-tone="hc-yellow"\], \[data-tone="eink"\]\) #hl mark \{\s*background: var\(--ink\); color: var\(--bg\);/, 'inverted block in the monochrome tones');
  assert.match(css, /#hl mark \{ background: color-mix\(in srgb, var\(--count\) 18%/, 'tint in the colour tones');
  assert.match(js, /function rhymesShown\(\) \{ return rhymesEnabled\.checked && rhymeToggle\.getAttribute\('aria-expanded'\) === 'true'; \}/);
  assert.match(js, /rhymeLabel\.textContent = info \?/); assert.match(js, /rhymeCtl\.refresh\(\); \/\/ the rhymed-word mark follows the new text/);
});

test('keyboard layout: html.kb is set from the visual viewport, and CSS turns Rhymes into one row of chips', () => {
  const listeners = {}, vv = {height: 800, offsetTop: 0, scale: 1, addEventListener(k, f) { (listeners[k] ??= []).push(f); }};
  const run = (h, extra = {}) => { Object.assign(vv, {height: h, offsetTop: 0, scale: 1}, extra); (listeners.resize || []).forEach(f => f()); };
  const coarse = {matches: true, addEventListener() {}};
  const b = boot({}, false, {globals: {visualViewport: vv, innerHeight: 800, matchMedia: q => /coarse/.test(q) ? coarse : {matches: false, addEventListener() {}}}});
  const root = b.document.documentElement;
  assert.equal(root.classList.contains('kb'), false, 'normal height: no compact layout');
  run(380, {offsetTop: 12}); assert.equal(root.classList.contains('kb'), true); assert.equal(root.style['--vvh'], '380px'); assert.equal(root.style['--vvt'], '12px');
  assert.equal(root.classList.contains('kb-tall'), false, '380px visible: one row of chips'); run(430); assert.equal(root.classList.contains('kb-tall'), true, '430px visible: room for two rows'); run(419); assert.equal(root.classList.contains('kb-tall'), false);
  run(800); assert.equal(root.classList.contains('kb'), false); assert.equal(root.classList.contains('kb-tall'), false); assert.equal(root.style['--vvh'], undefined, 'variables are removed again');
  run(700); assert.equal(root.classList.contains('kb'), false, '100px covered (browser toolbar): not a keyboard');
  run(660); assert.equal(root.classList.contains('kb'), true, 'layout viewport 800 with 660 visible: 140px covered counts as a keyboard');
  run(300, {scale: 2}); assert.equal(root.classList.contains('kb'), false, 'a pinch-zoomed page is not a keyboard');
  const css = read('css/styles.css'), js = read('js/app.js');
  assert.match(css, /html\.kb \.app \{ position: fixed; left: 0; right: 0; top: var\(--vvt, 0px\);[^}]*height: var\(--vvh, 100%\)/);
  assert.match(css, /html\.kb \.sheet \{ min-height: calc\(var\(--lh\) \* 3 \+ var\(--pad\) \* 2\); \}/);
  assert.match(css, /html\.kb \.rhyme-panel:not\(\[hidden\]\) \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/, 'one row of chips that scrolls sideways');
  assert.match(css, /html\.kb\.kb-tall \.rhyme-panel:not\(\[hidden\]\) \{ flex-wrap: wrap;[^}]*max-height: 4\.7rem;/, 'two rows when there is room');
  assert.match(css, /html\.kb \.rhyme-dock \{[^}]*flex-direction: column;[^}]*border: 1px solid var\(--edge\);/, 'one bordered card: header line, then chips');
  assert.match(css, /html\.kb \.rhyme-hint, html\.kb \.rhyme-more \{ display: none; \}/); assert.match(css, /html\.kb \.rhyme-group:first-child \.rhyme-group-label \{ display: none; \}/);
  assert.match(read('index.html'), /<div class="rhyme-head">[\s\S]*<span id="rhymeGroup" class="rhyme-group-now" aria-hidden="true"><\/span>/, 'decorative group label beside the toggle');
  assert.match(js, /root\.classList\.toggle\('kb-tall', on && vv\.height >= 420\)/);
  assert.match(js, /vv\.height < 520 \|\| covered > 120/);
});
test('README: Safari save wording and offline dictionary download are explained', () => {
  const r = read('README.md');
  assert.equal(/Safari cannot save back/.test(r), false); assert.match(r, /Ask for each download/);
  assert.match(r, /Go online and open the app once so the syllable\s+dictionary downloads/); assert.match(r, /do that before going offline/);
});

test('High contrast (yellow) tone: black on yellow in light, yellow on black in dark, one ink on one background, valid preference', () => {
  assert.equal(AppPreferences.create({getItem: () => 'hc-yellow'}).get('syl-tone'), 'hc-yellow');
  const b = boot({'syl-tone': 'hc-yellow'}); assert.equal(b.document.documentElement.getAttribute('data-tone'), 'hc-yellow');
  const l = palette(':root[data-tone="hc-yellow"]'), d = palette(':root[data-tone="hc-yellow"][data-theme="dark"]');
  assert.deepEqual([l.ink, l.bg], ['#000000', '#ffe600']); assert.deepEqual([d.ink, d.bg], ['#ffe600', '#000000']);
  assert.ok(ratio(l.ink, l.bg) >= 15, 'light contrast ' + ratio(l.ink, l.bg).toFixed(1)); assert.ok(ratio(d.ink, d.bg) >= 15);
  const css = read('css/styles.css'); assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root\[data-tone="hc-yellow"\]:not\(\[data-theme="light"\]\)/, 'System theme follows the OS');
});
test('e-ink tone: paper grey with soft ink, outlined badges, no transitions or animation, valid preference', () => {
  assert.equal(AppPreferences.create({getItem: () => 'eink'}).get('syl-tone'), 'eink');
  const b = boot({'syl-tone': 'eink'}); assert.equal(b.document.documentElement.getAttribute('data-tone'), 'eink');
  for (const sel of [':root[data-tone="eink"]', ':root[data-tone="eink"][data-theme="dark"]']) {
    const p = palette(sel);
    assert.ok(ratio(p.ink, p.sheet) >= 7 && ratio(p.ink, p.bg) >= 7, sel + ' ink contrast ' + ratio(p.ink, p.sheet).toFixed(1));
    assert.ok(ratio(p.muted, p.bg) >= 4.5, sel + ' muted text contrast ' + ratio(p.muted, p.bg).toFixed(1));
    assert.ok(ratio(p.edge, p.bg) >= 3, sel + ' control border contrast ' + ratio(p.edge, p.bg).toFixed(1));
    assert.ok(ratio(p.focus, p.bg) >= 3, sel + ' focus ring contrast');
  }
  const css = read('css/styles.css');
  assert.match(css, /:root\[data-tone="eink"\] \*, :root\[data-tone="eink"\] \*::before, :root\[data-tone="eink"\] \*::after \{ transition: none !important; animation: none !important; box-shadow: none !important; \}/);
  assert.ok(css.lastIndexOf(':root[data-tone="eink"] #counts b { background: transparent;') > css.lastIndexOf('#counts b, .seg button'), 'outlined badges come after the inverted-solid rule');
});

test('block cursor: drawn only in the mirror, on the caret character, never over a selection; blinks unless reduced motion', () => {
  const N = miniDom(), hl = new N('div');
  global.document = {createElement: x => new N(x), createTextNode: x => Object.assign(new N('#text'), {_text: String(x)}), addEventListener() {}, removeEventListener() {}, activeElement: null};
  const ta = Object.assign(new N('textarea'), {value: 'ab\ncd', selectionStart: 1, selectionEnd: 1, scrollTop: 0, scrollLeft: 0});
  const m = AppMirror.create({textarea: ta, el: hl, document: global.document});
  const cells = () => hl.all(n => (n.className || '').split(' ').includes('bc'));
  m.setCaret(true); assert.equal(cells().length, 0, 'not focused: no cursor'); document.activeElement = ta;
  m.refresh(); assert.equal(cells()[0].textContent, 'b'); assert.equal(hl.textContent.replace('\u200b', ''), 'ab\ncd', 'text is unchanged');
  ta.selectionStart = 0; ta.selectionEnd = 2; m.refresh(); assert.equal(cells().length, 0, 'a selection hides it');
  ta.selectionStart = ta.selectionEnd = 2; m.refresh(); assert.match(cells()[0].className, /eol/, 'end of a line gets a block');
  ta.selectionStart = ta.selectionEnd = 5; m.refresh(); assert.match(cells()[0].className, /eol/, 'end of text too');
  m.setCaret(false); assert.equal(cells().length, 0); assert.equal(hl.textContent, '');
  const css = read('css/styles.css');
  assert.match(css, /#hl \.bc \{[^}]*animation: bc-blink/); assert.match(css, /prefers-reduced-motion: reduce\) \{ #hl \.bc \{ animation: none; \}/);
  assert.match(css, /:root\[data-tone="terminal"\] #ed \{ caret-color: transparent;/);
  assert.doesNotMatch(css, /:root\[data-tone="(?:grey|cool|warm|hc-bw|hc-yellow|eink)"\] #ed \{ caret-color: transparent/);
  assert.match(read('js/app.js'), /mirror\.setCaret\(t === "terminal" \|\| t === "amber"\)/);
});

test('content security policy: strict, matches what the app really loads, no inline scripts', () => {
  const html = read('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const dir = n => new RegExp('(?:^|; )' + n + ' ([^;]+)').exec(csp)?.[1];
  assert.equal(dir('default-src'), "'none'"); assert.equal(dir('script-src'), "'self'"); assert.equal(dir('object-src'), "'none'");
  assert.equal(dir('base-uri'), "'none'"); assert.equal(dir('form-action'), "'none'"); assert.equal(dir('worker-src'), "'self'"); assert.equal(dir('manifest-src'), "'self'");
  assert.equal(/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp), false);
  assert.match(dir('connect-src'), /^'self' https:\/\/api\.github\.com https:\/\/raw\.githubusercontent\.com$/, 'only the optional CMUdict refresh reaches out');
  for (const m of html.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc="[^":]+"/, 'every script is an external same-origin file');
  assert.equal(/\son[a-z]+="/i.test(html), false, 'no inline event handlers'); assert.equal(/<style/i.test(html), false); assert.equal(/javascript:/i.test(html), false);
  assert.equal(/<(?:script|link|img)[^>]+(?:src|href)="https?:\/\//.test(html), false, 'no third-party scripts, styles or images');
  assert.equal(/(?:eval|new Function)\(/.test(['js/app.js', 'js/mirror.js', 'js/rhymes-ui.js', 'js/dictionary.js', 'sw.js'].map(read).join('\n')), false);
  const hosts = new Set(); for (const f of ['js/app.js', 'js/dictionary.js', 'js/rhymes.js', 'js/rhymes-ui.js', 'sw.js']) for (const m of read(f).matchAll(/https?:\/\/([a-z.]+)/g)) hosts.add(m[1]);
  assert.deepEqual([...hosts].sort(), ['api.github.com', 'raw.githubusercontent.com'], 'every host the code contacts is allowed by the policy');
});

test('per-line cache: repeated lines are not recounted, results stay correct, and a dictionary change invalidates', () => {
  const c = SyllableCounter.create();
  const a = c.line('the poem zzxq'); assert.equal(c.line('the poem zzxq'), a, 'same object served from the cache');
  assert.equal(a.words, 3); assert.equal(a.estimated >= 1, true);
  const before = c.line('poem').n; c.setDictionary({poem: [2, 3]}, null);
  const after = c.line('poem'); assert.equal(after.variable, 1); assert.equal(after.estimated, 0); assert.notEqual(after, c.line('poem ') , 'different text, different entry');
  assert.equal(after.n, 2); assert.equal(typeof before, 'number');
  for (let i = 0; i < 25000; i++) c.line('w' + i); assert.equal(c.line('poem').n, 2, 'still right after the cache is trimmed');
  const app = read('js/app.js'); assert.match(app, /heightCache/); assert.match(app, /sig !== heightSig/);
});

test('rhymes dock: one card with a flat full-width header, unchanged on-screen-keyboard layout', () => {
  const css = read('css/styles.css');
  assert.match(css, /html:not\(\.kb\) \.rhyme-dock \{[^}]*border: 1px solid var\(--edge\);[^}]*overflow: hidden;/);
  assert.match(css, /html:not\(\.kb\) \.rhyme-toggle \{[^}]*width: 100%;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(css, /html:not\(\.kb\) \.rhyme-panel \{ border: 0; border-top: 1px solid var\(--rule\);/);
  assert.match(read('index.html'), /<span id="rhymeLabel">Rhymes<\/span>/, 'the label with the word and count is kept');
});

test('first run: Settings opens once with About expanded; never again, never for returning visitors, never when storage is unwritable', () => {
  const saved = {}, b = boot(saved, true, {firstRun: true}), n = b.nodes;
  assert.equal(n.morePanel.getAttribute('open'), ''); assert.equal(n.aboutAcc.getAttribute('open'), ''); assert.equal(n.displayAcc.getAttribute('open'), null, 'Display collapses so About is in view');
  assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'true'); assert.equal(saved['syl-welcomed'], '1', 'flag saved as soon as it opens');
  n.moreClose.click(); assert.equal(n.moreBtn.getAttribute('aria-expanded'), 'false');
  const again = boot(saved, true, {firstRun: true}).nodes; assert.equal(again.morePanel.getAttribute('open'), null, 'second visit: closed'); assert.equal(again.displayAcc.getAttribute('open'), ''); assert.equal(again.aboutAcc.getAttribute('open'), null);
  const returning = {'syl-tone': 'warm'}, r = boot(returning, true, {firstRun: true}).nodes;
  assert.equal(r.morePanel.getAttribute('open'), null, 'saved preferences: not a first run'); assert.equal(returning['syl-welcomed'], '1', 'flagged so a later reset cannot trigger it');
  boot(saved, true).nodes.resetPrefs.click(); assert.equal(saved['syl-welcomed'], '1', 'Reset to defaults leaves the flag alone');
  assert.equal(boot({}, true, {firstRun: true}).nodes.morePanel.getAttribute('open'), '');
  assert.equal(boot({}, true, {firstRun: true, readOnlyStorage: true}).nodes.morePanel.getAttribute('open'), null, 'unwritable storage: no auto-open');
});
