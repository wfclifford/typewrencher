/*
 * rhymes-ui.js - rhyme panel that follows the caret in a <textarea>. Requires rhymes.js.
 * Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
 * Styles live in css/styles.css (.rhyme-*), which use the app's own variables.
 *
 *   const panel = RhymePanel.attach({ textarea, container, dict, say, mode, strict });
 *   RhymePanel.attach also takes mirror (an AppMirror, for the word mark), highlightOn and onTitle(info|null) for the collapsed label.
 *   panel.setOptions({ mode: 'perfect' | 'near', strict: true | false });  // Settings drive these
 *
 * Click a word to replace the word at the caret (capitalization kept). Shift-click copies it.
 * Replacing fires an `input` event so the app recounts syllables and updates its Save state.
 * Adapted from the standalone module: pressed-state buttons instead of tabs, the app's switch
 * markup, no live region on the whole panel (it would announce on every caret move), caret
 * tracking on touch devices (selectionchange), curly apostrophes, and undo-friendly replacement.
 */
(function (root) {
  'use strict';

  const MAX_PER_GROUP = 24;
  const WORD_CHAR = /[A-Za-z'’]/;
  const clean = (w) => w.replace(/’/g, "'").replace(/^'+|'+$/g, '');

  function wordAt(text, start, end) {
    if (end > start) {
      const sel = text.slice(start, end).trim();
      const w = /^[A-Za-z'’]+$/.test(sel) ? clean(sel) : '';
      return w ? { word: w, start, end } : null;
    }
    let s = start, e = start;
    while (s > 0 && WORD_CHAR.test(text[s - 1])) s--;
    while (e < text.length && WORD_CHAR.test(text[e])) e++;
    const w = clean(text.slice(s, e));
    return w ? { word: w, start: s, end: e } : null;
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }

  // Keep the capitalization of the word being replaced: Title case, or ALL CAPS for 2+ capitals.
  function matchCase(original, word) {
    const letters = original.replace(/[^A-Za-z]/g, '');
    if (letters.length > 1 && letters === letters.toUpperCase()) return word.toUpperCase();
    if (letters && letters[0] === letters[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
    return word;
  }

  function attach(opts) {
    const ta = opts.textarea, box = opts.container, dict = opts.dict;
    const say = opts.say || function () {};
    let mode = opts.mode === 'near' ? 'near' : 'perfect';
    let strict = opts.strict !== false;
    let current = null;       // { word, start, end }
    let expanded = {};        // group id -> true once "+N more" is used
    let timer = null;
    const mirror = opts.mirror || null;      // AppMirror instance: the rhymed word is marked in the layer drawn over the text
    const onTitle = opts.onTitle || function () {};
    let hlOn = opts.highlightOn !== false;

    box.classList.add('rhyme-panel');

    // Mark the word being checked, in the app's mirror layer (js/mirror.js).
    function drawHighlight(hit) {
      if (mirror) mirror.setMark(hlOn && hit ? { start: hit.start, end: hit.end } : null);
    }

    function schedule() { clearTimeout(timer); timer = setTimeout(update, 120); }

    function update() {
      const hit = wordAt(ta.value, ta.selectionStart, ta.selectionEnd);
      if (!hit) { current = null; drawHighlight(null); onTitle(null); return render(null, null); }
      const same = current && current.word.toLowerCase() === hit.word.toLowerCase();
      current = hit;
      if (!same) expanded = {};
      drawHighlight(hit);
      render(hit, dict.find(hit.word, { strict }));
    }

    function flash(msg) {
      const h = box.querySelector('.rhyme-hint');
      if (h) h.textContent = msg;
      say(msg);
    }

    function replace(start, end, text) {
      ta.focus();
      ta.setSelectionRange(start, end);
      // insertText keeps the browser's undo stack and fires its own input event.
      let ok = false;
      try { ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text); } catch (_) {}
      if (ok) return;
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
      ta.setSelectionRange(start + text.length, start + text.length);
      ta.dispatchEvent(new Event('input', { bubbles: true })); // the app recounts and updates Save
    }

    function choose(word, ev) {
      if (ev.shiftKey || !current) {
        if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(word).catch(function () {});
        return flash('Copied ' + word + '.');
      }
      const original = ta.value.slice(current.start, current.end);
      const out = matchCase(original, word);
      const lead = /^'+/.exec(original), trail = /'+$/.exec(original);
      replace(current.start + (lead ? lead[0].length : 0), current.end - (trail ? trail[0].length : 0), out);
      const pos = ta.selectionStart;
      say('Replaced ' + original.replace(/^'+|'+$/g, '') + ' with ' + out + '.');
      ta.setSelectionRange(pos, pos);
      current = null;
      update();
    }

    function render(hit, res) {
      box.textContent = '';
      if (!hit) {
        return box.appendChild(el('p', { class: 'rhyme-empty', text: 'Tap a word to see rhymes.' }));
      }
      if (!res) {
        onTitle({ word: hit.word, count: 0, detail: '' });
        return box.appendChild(el('p', { class: 'rhyme-empty', text: 'No pronunciation found for “' + hit.word + '”.' }));
      }

      const groups = res[mode];
      let total = 0;
      for (const k in groups) total += groups[k].length;
      const phonetic = res.pronunciation.map(function (p) { return p.replace(/\d/, ''); }).join(' ');
      onTitle({ word: res.word, count: total, detail: res.syllables + (res.syllables === 1 ? ' syllable' : ' syllables') + ' \u00b7 ' + phonetic });
      const keys = Object.keys(groups);
      if (!keys.length) {
        box.appendChild(el('p', { class: 'rhyme-empty', text: mode === 'perfect' ? 'No exact rhymes found. Turn on Include near rhymes in Settings, Dictionary Options.' : 'No near rhymes found.' }));
      }
      keys.forEach(function (k) {
        const words = groups[k];
        const id = mode + k;
        const shown = expanded[id] ? words : words.slice(0, MAX_PER_GROUP);
        const g = el('div', { class: 'rhyme-group', role: 'group', 'aria-label': k + (k === '1' ? ' syllable' : ' syllables') }, [
          el('div', { class: 'rhyme-group-label', text: k + (k === '1' ? ' syllable' : ' syllables') + ' (' + words.length + ')' }),
        ]);
        const list = el('div', { class: 'rhyme-words' });
        shown.forEach(function (w) {
          const b = el('button', { type: 'button', class: 'rhyme-pill', text: w });
          b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the caret in the text
          b.addEventListener('click', function (e) { choose(w, e); });
          list.appendChild(b);
        });
        if (words.length > shown.length) {
          const more = el('button', { type: 'button', class: 'rhyme-pill rhyme-more', text: '+' + (words.length - shown.length) + ' more' });
          more.addEventListener('click', function () { expanded[id] = true; render(hit, res); });
          list.appendChild(more);
        }
        g.appendChild(list);
        box.appendChild(g);
      });

      box.appendChild(el('div', { class: 'rhyme-hint', text: 'Click or tap a word to replace it. Shift-click copies it.' }));
    }

    ['keyup', 'click', 'select', 'focus', 'input'].forEach(function (ev) { ta.addEventListener(ev, schedule); });
    // Touch selection handles and caret taps do not always fire click or keyup.
    const onSelection = function () { if (document.activeElement === ta) schedule(); };
    document.addEventListener('selectionchange', onSelection);
    update();
    return {
      refresh: update,
      setHighlight: function (on) { hlOn = !!on; if (!hlOn) drawHighlight(null); else update(); },
      setOptions: function (o) {
        if (o.mode) mode = o.mode === 'near' ? 'near' : 'perfect';
        if (typeof o.strict === 'boolean') strict = o.strict;
        expanded = {}; update();
      },
      destroy: function () { clearTimeout(timer); hlOn = false; drawHighlight(null); onTitle(null); document.removeEventListener('selectionchange', onSelection); }
    };
  }

  const api = { attach: attach, wordAt: wordAt, matchCase: matchCase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RhymePanel = api;
})(typeof self !== 'undefined' ? self : this);
