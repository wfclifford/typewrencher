// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
// Native host bridge. Inert in a browser.
//
// The planned Mac app runs this page inside a web view and owns the document: files, autosave,
// iCloud, menus. The page stays the editor. When the web view provides a message handler named
// "typewrencher" (window.webkit.messageHandlers.typewrencher), AppHost.create() returns a host
// object. In any ordinary browser it returns null and the page behaves exactly as before.
//
// Protocol version 1
//   page -> native, through handler.postMessage(message). The handler may reply with a promise.
//     { type: 'ready', protocol: 1 }               the page has started and TypewrencherHost exists
//     { type: 'textChanged', text }                the text changed; sent about 300 ms after typing stops
//     { type: 'export', filename, data }           the Export button asks the native side to save a copy as .txt
//     { type: 'open' }                             the page's Open button: show the native Open panel
//     { type: 'new' }                              the "+" (the skull in a browser): a new document, like File > New
//     { type: 'rename', name }                     the name field was edited: rename the file (the reply is an
//                                                  error if refused; the native side then sends the old name back)
//     { type: 'close' }                            close the window; no longer sent by the page, still handled
//     { type: 'files', open }                      the files drawer opened or closed; while open, send setFiles
//     { type: 'grantFolder' }                      ask the person for access to the document's folder
//     { type: 'openFile', name }                   switch this window to that file in the folder (saving this one)
//     { type: 'trash', name }                      move that file (a name from setFiles, with .txt) in the document's
//                                                  folder to the Trash. Reply { ok: true, undoId }, or an error string
//                                                  (a short reason such as "no permission") that rejects the promise.
//                                                  Trashing the open document switches to a new empty one first.
//     { type: 'untrash', undoId }                  put a file trashed by 'trash' back where it was. No longer sent by the
//                                                  page (the sandbox does not allow moving files out of the Trash), still
//                                                  handled. Reply { ok: true }, or an error string; nothing is overwritten.
//   native -> page, by calling window.TypewrencherHost (defined in js/app.js)
//     setDocument({ text, name })                  show this text and name; sends neither textChanged nor rename back
//     setFiles({ access, folder, path, current, files: [{ name, modified }] })
//                                                  the drawer's list; access is 'granted', 'needed' or 'none' (untitled)
//     notify(message, { sticky })                  show a short message on the notice line (no alerts in the app);
//                                                  it clears after 12 s, or stays if sticky until replaced;
//                                                  notify('') clears it. The second argument is optional.
//     exportNow()                                  do what the Export button does (File > Export)
//     getText()                                    the current text
//     exportText()                                 the text as exported: optional line counts and totals
(() => {
  'use strict';
  const PROTOCOL = 1;
  const DEBOUNCE_MS = 300;
  globalThis.AppHost = {
    PROTOCOL, DEBOUNCE_MS,
    // win: the page's window. timers: { setTimeout, clearTimeout } from the page's own realm.
    create(win, timers) {
      const handler = win && win.webkit && win.webkit.messageHandlers && win.webkit.messageHandlers.typewrencher;
      if (!handler || typeof handler.postMessage !== 'function') return null;
      const { setTimeout, clearTimeout } = timers;
      let timer = null, pending = null;
      const post = message => { try { return handler.postMessage(message); } catch (_) { return undefined; } };
      const host = {
        protocol: PROTOCOL,
        post,
        // Remember the newest text and send it once typing has paused.
        textChanged(text) {
          pending = { text };
          clearTimeout(timer);
          timer = setTimeout(host.flush, DEBOUNCE_MS);
        },
        // Send any text that has not gone yet (on blur and when the page is hidden).
        flush() {
          clearTimeout(timer); timer = null;
          if (!pending) return;
          const { text } = pending; pending = null;
          post({ type: 'textChanged', text });
        },
        // Drop unsent text because the native side is about to replace it.
        cancel() { clearTimeout(timer); timer = null; pending = null; },
        // Same shape as the page's download helper: save({ filename, data }) resolves when saved
        // and rejects with code 'declined' when the person cancelled.
        downloads: {
          save({ filename, data }) {
            return Promise.resolve(post({ type: 'export', filename, data })).then(() => {}, error => {
              const e = new Error('Could not save');
              e.code = /declin|cancel/i.test(String((error && error.message) || error)) ? 'declined' : 'failed';
              throw e;
            });
          }
        }
      };
      return host;
    }
  };
})();
