// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  globalThis.AppEditor = {
    clear(editor, filename, document) {
      editor.focus();
      editor.select();
      let ok = false;
      try { ok = document.execCommand('delete'); } catch (_) {}
      if (!ok || editor.value) editor.value = '';
      filename.value = '';
    }
  };
})();
