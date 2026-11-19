/*
 * mirror.js - the transparent text layer drawn over the editor (#hl).
 * Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
 *
 * It copies the editor's text, in the editor's font and wrapping, so two things can be drawn exactly over it:
 *   - a mark on the word the Rhymes panel is checking (setMark), and
 *   - a block cursor in the retro tones (setCaret), drawn at the caret while the editor has focus and nothing is selected.
 * Only <mark> and .bc elements are visible (css/styles.css); the layer never takes taps. It is rebuilt on every change, so a
 * fresh cursor restarts its blink and stays solid while you type.
 */
(function (root) {
  'use strict';

  // Fill `el` with `value`, marking [mark.start, mark.end) and putting the cursor cell at `caret` (an index, or null).
  function paint(doc, el, value, mark, caret) {
    el.textContent = '';
    const len = value.length;
    const markOk = mark && mark.end > mark.start && mark.start >= 0 && mark.end <= len;
    if (!markOk && caret === null) return;

    function plain(parent, a, b) { if (b > a) parent.appendChild(doc.createTextNode(value.slice(a, b))); }
    function eol(parent) { const s = doc.createElement('span'); s.className = 'bc eol'; parent.appendChild(s); }
    // value[a, b) with the cursor cell inside it, if the cursor falls in this range.
    function emit(parent, a, b) {
      if (caret === null || caret < a || caret >= b) return plain(parent, a, b);
      plain(parent, a, caret);
      if (value[caret] === '\n') eol(parent);
      else {
        const code = value.charCodeAt(caret), width = code >= 0xd800 && code <= 0xdbff && caret + 1 < b ? 2 : 1; // keep a surrogate pair whole
        const c = doc.createElement('span'); c.className = 'bc'; c.textContent = value.slice(caret, caret + width); parent.appendChild(c);
        return plain(parent, caret + width, b);
      }
      plain(parent, caret, b);
    }

    if (markOk) {
      emit(el, 0, mark.start);
      const m = doc.createElement('mark'); emit(m, mark.start, mark.end); el.appendChild(m);
      emit(el, mark.end, len);
    } else emit(el, 0, len);
    if (caret !== null && caret >= len) eol(el);
    el.appendChild(doc.createTextNode('​')); // keeps a trailing newline's height, like the editor
  }

  function create(opts) {
    const ta = opts.textarea, el = opts.el, doc = opts.document || document;
    let mark = null, caretOn = false, queued = false, empty = true;

    function draw() {
      queued = false;
      const caret = caretOn && doc.activeElement === ta && ta.selectionStart === ta.selectionEnd ? ta.selectionStart : null;
      if (!mark && caret === null) { if (!empty) { el.textContent = ''; empty = true; } return; }
      paint(doc, el, ta.value, mark, caret); empty = false;
      el.scrollTop = ta.scrollTop; el.scrollLeft = ta.scrollLeft;
    }
    function schedule() {
      if (queued) return; queued = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(draw); else setTimeout(draw, 0);
    }
    function syncScroll() { if (!empty) { el.scrollTop = ta.scrollTop; el.scrollLeft = ta.scrollLeft; } }

    ta.addEventListener('scroll', syncScroll);
    ['input', 'keyup', 'click', 'focus', 'blur'].forEach(function (k) { ta.addEventListener(k, schedule); });
    const onSelection = function () { if (caretOn && doc.activeElement === ta) schedule(); };
    doc.addEventListener('selectionchange', onSelection);
    return {
      setMark: function (m) { mark = m ? { start: m.start, end: m.end } : null; draw(); },
      setCaret: function (on) { caretOn = !!on; draw(); },
      refresh: draw,
      destroy: function () { doc.removeEventListener('selectionchange', onSelection); mark = null; caretOn = false; draw(); }
    };
  }

  const api = { create: create, paint: paint };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AppMirror = api;
})(typeof self !== 'undefined' ? self : this);
