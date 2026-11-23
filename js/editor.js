// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  // Exports that carry counts or totals start with "Typewrencher Export: <name>". The marker lets the app
  // recognise its own export on Open and take the counts back out.
  const MARK = 'Typewrencher Export: ';
  const SUMMARY = /^Lines: \d+ \| Words: \d+ \| Syllables: \d+$/;
  const COUNT = /  \(\d+\)$/;
  globalThis.AppEditor = {
    clear(editor, filename, document) {
      editor.focus();
      editor.select();
      let ok = false;
      try { ok = document.execCommand('delete'); } catch (_) {}
      if (!ok || editor.value) editor.value = '';
      filename.value = '';
    },
    // Replace the whole text the way typing would, so Undo still works where the browser allows it.
    replace(editor, text, document) {
      editor.focus();
      editor.select();
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (_) {}
      if (!ok || editor.value !== text) editor.value = text;
    },
    exportHeader(name) { return MARK + name; },
    // Looks at opened text. Returns { looks, marked, text }: looks is true when it appears to be an export
    // with syllable counts, marked when it carries the Typewrencher Export line, and text is the same text
    // without the header lines and the "  (n)" counts. countable(line) says whether a line has any syllables.
    // Nothing is removed from text that does not look like an export.
    strip(source, countable) {
      const lines = String(source).split('\n');
      let start = 0, marked = false, header = false;
      if (lines[0].startsWith(MARK)) {
        marked = header = true; start = 1;
        if (SUMMARY.test(lines[start] || '')) start++;
        if (lines[start] === '') start++;
      } else if (SUMMARY.test(lines[1] || '') && lines[2] === '') { header = true; start = 3; } // older export: title, summary, blank
      else if (SUMMARY.test(lines[0]) && lines[1] === '') { header = true; start = 2; } // older export with no title
      let counted = 0, countableLines = 0;
      const body = lines.slice(start).map(line => {
        const at = line.search(COUNT), base = at < 0 ? line : line.slice(0, at);
        if (countable(base)) countableLines++; else return line;
        if (at < 0) return line;
        counted++;
        return base;
      });
      const looks = header || (countableLines >= 2 && counted >= Math.ceil(countableLines * 0.8));
      if (!looks) return { looks: false, marked: false, text: String(source) };
      return { looks: true, marked, text: body.join('\n') };
    }
  };
})();
