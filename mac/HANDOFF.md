# Mac app handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Task: single-window app with real-file documents

Status: not started

Make the Mac app a SINGLE-WINDOW app in which every document is a real file from the moment it exists, and finish the web side of the same change. You own both the Swift and the web changes; they ship together in one pull request.

Goal: one window, always. Whatever opens a file (the page's Open button, File > Open, Open Recent, a Finder double-click, a file dropped on the Dock icon, a file chosen in the files drawer, the new-document action) switches the text area AND the filename field of that one window to that file. No second window ever opens, and the web view never reloads.

Replace the SwiftUI `DocumentGroup` with a single-window scene (`Window`, not `WindowGroup`) and our own document model.

### Native side

1. **Model.** One observable object holds the current file URL, the text and the display name (the file name without ".txt"). `TextDocument.swift` can go away or become plain read/write helpers (UTF-8 `.txt` only). There is no in-memory untitled document: a new document is a new file on disk.
2. **`switchTo(url)`**, the one function every way of opening a file uses. It (a) writes the current file (the page has already sent its newest text; apply the last `textChanged` before saving), (b) reads the new file, (c) updates the model, (d) calls `window.TypewrencherHost.setDocument({ text, name })`, (e) updates the window title, the drawer's selected row (`sendFiles` with the new "current" name) and the folder watcher. If saving or reading fails, tell the person with an inline message (see item 13) and stay on the current file.
3. **Autosave.** Edits are written to the current file a moment after the page's debounced `textChanged` messages. Write atomically. There is no Edited dot and no unsaved state.
4. **New documents.** The page sends `{ type: 'new' }` when the person clicks the skull button (which becomes a "new document" button inside the Mac app, item 10); File > New (Cmd-N) must do the same thing natively. The skull never asks about unsaved changes, because with autosave there are none; if saving the current file fails, show an inline message (item 13) and stay on it. The action:
   - If the current file is an app-created, still-empty "untitled" file, do nothing.
   - Otherwise create a new empty file in the current file's folder (or the "documents folder") named `untitled.txt`; if that name is taken, `untitled 2.txt`, `untitled 3.txt` and so on, using the first number not already in the folder. Then `switchTo` it. Remember that the app created it and that it is untitled.
   - "Documents folder": the folder of the last file opened or created, remembered across launches with a security-scoped bookmark. If there is none yet, show one folder-chooser panel ("Choose a folder for new documents"), remember the choice, and continue. If creating a file fails for lack of permission, say so with an inline message (item 13); do not fall back silently.
   - When switching away from, closing the window on, or quitting with an untitled file that the app created and that is STILL EMPTY (zero bytes), move it to the Trash with `FileManager.trashItem`. Never remove any other file; never remove a file that has text in it.
5. **Rename.** The page sends `{ type: 'rename', name: '<new name without .txt>' }` when the person finishes editing the name field (Return, leaving the field, or a pause of about a second). Swift renames the current file in the same folder to that name plus ".txt" with `FileManager.moveItem`, then updates the model, the window title, the drawer (current row) and Open Recent. Rules:
   - Clean the name like the page does for export: no "/" or ":" characters, trim spaces and dots at the ends; an empty result means no change.
   - If a file with that name already exists in the folder, do not overwrite it and do not rename: reply to the message with an error, call `setDocument({ text, name: <old name> })` so the field goes back to the old name, and show an inline message such as "A file named ... already exists" (item 13).
   - If the name did not change, do nothing. Renaming ends the "untitled" state of that file (it is no longer trashed when empty).
   - A rename must not lose text: save the current text first, and keep the file watcher from reporting the rename as an external change.
6. **Menus** (use `CommandGroup` to replace the File items): New (Cmd-N), Open... (Cmd-O), Open Recent (a submenu built from `NSDocumentController.shared.recentDocumentURLs`, with Clear Menu), Save (Cmd-S; saves now: ask the page for `getText()` and write it, with no visible change), Export... (Shift-Cmd-E; calls `exportNow()` on the page, so the panel and the "Done" label are the same as the button), Save As... (Shift-Cmd-S; writes the text to a chosen new file and switches to that file, unlike Export, which writes a copy and stays on the current file), Close (Cmd-W closes the window; quitting the app when it closes is acceptable). Call `NSDocumentController.shared.noteNewRecentDocumentURL(url)` whenever a file is opened, created or renamed. The page's .txt export (its save panel) stays as it is.
7. **Finder and Dock.** Opening a `.txt` file from Finder or onto the Dock icon calls `switchTo(url)` in the existing window (use `onOpenURL` or an `NSApplicationDelegateAdaptor` `application(_:open:)` handler, whichever works; it must never create a second window). Keep the Plain Text document type in `Info.plist`.
8. **Files drawer.** Keep it as it is (folder access, watcher, list). `openFile` calls `switchTo(url)` with the chosen file in the same folder. Replace uses of `parent.fileURL` and `parent.document` with the model. The drawer must show a new untitled file as soon as it is created and the renamed name after a rename.
9. **External changes and launch.** If the current file changes on disk while open and there is no pending edit, reload it into the page; if the person has typed since the last save, keep their text and say so with an inline message (item 13). Restore the window's size and position between launches (`setFrameAutosaveName`). On launch, reopen the last-open file if it still exists (needs a security-scoped bookmark under the sandbox); otherwise do the "new document" action.

### Web side

10. **Skull becomes New, inside the Mac app only.** When a host is present, the skull button no longer erases or closes anything: it flushes unsent text and posts `{ type: 'new' }` (the same action as File > New). Its accessible name becomes "New document" (it is "Erase text and filename" in a browser) and its icon becomes a plain "+" in the existing button style (the page already switches icons with `html[data-host="mac"] .icon-app` and `.icon-web`; add the "+" as the `icon-app` variant). Remove the Mac-only `close` behavior of the skull; the native side may keep handling a `close` message but the page no longer sends it. Update the About text that describes the skull (`aboutSkull` in `js/app.js`) to say, in the Mac app, that the plus button starts a new document and your text is saved to its file as you type. In a browser everything about the skull stays as it is. No separate "+" button is added.
11. The name field posts `{ type: 'rename', name }` when the person finishes editing it (Return, blur, or about a second after typing stops), only inside the app and only if the value differs from the last name Swift set. `setDocument` must not trigger a rename message.
11b. **Save button becomes Export, inside the Mac app only.** The page's `.txt` button does not save the document (autosave does that); it writes a copy, with the optional per-line syllable counts and the totals summary. When a host is present, relabel it "Export" with an export glyph (the `icon-app` variant; the diskette stays for browsers) and the accessible name "Export a copy as .txt". The "Done" success label and the status line ("Done title.txt") stay as they are. It keeps posting `export` and the native save panel stays. Add a native-to-page method `window.TypewrencherHost.exportNow()` that does exactly what clicking that button does (including the "Done" label), so that File > Export can use it.
12. Update the header comment in `js/host.js` to list the new messages and methods (`new`, `rename`, `notify`, `exportNow`). Add tests to `tests/app.test.js`: in a browser the skull still erases (with its existing confirmation) and the `.txt` button keeps its label; with a host the skull is named "New document", flushes and posts `new`, and the save button is named "Export a copy as .txt" and still posts `export`; `exportNow()` does what the button does; the name field posts `rename` only on commit and not on `setDocument`; the existing 214 tests still pass. Follow the web rules in `CLAUDE.md` (stamp, check, tests).
13. **Inline messages, no modals.** The design principles in `CLAUDE.md` say feedback stays inside the UI: no `NSAlert`, no `NSApp.presentError`, no sheets for errors or notices. Add a native-to-page method `window.TypewrencherHost.notify(message)` that shows the message in the page's status line (the same line `say()` uses; it may also set the live-region text so screen readers hear it). Swift calls it for every message in this task: a failed save or read, a permission failure, a rename that collides with an existing file, an external change that did not overwrite the person's typing, a file that could not be reopened on launch. Keep messages short and plain ("A file named My poem already exists." / "Typewrencher kept your changes; the file was also changed elsewhere."). Replace the existing `NSApp.presentError(error)` calls in `WebEditorView.swift` the same way. If the page is not ready yet (no `ready` message), queue the message and send it after `ready`. The native file panels (Open, Save As, the folder chooser, the .txt export panel) stay: they are the file-access boundary. Add `notify` to the header comment in `js/host.js` and a test that it shows the message and does nothing in a browser.

### Test and report (verify on disk, not only in the UI)

a. Open file A, type, open file B from the drawer: A on disk has the typing, and B is shown in the same window with its name in the filename field.
b. Type in B: only B's file changes, never A's.
c. Switch twice in a row quickly, with typing just before each switch: no text is lost or crosses over.
d. Open via File > Open, Open Recent, the page's Open button, Finder double-click and a drag onto the Dock icon: exactly one window each time, and it switches.
e. New (Cmd-N and the skull button) creates `untitled.txt`, then `untitled 2.txt` after the first has text, then `untitled 3.txt`; New on an empty untitled file does nothing; switching away from an empty untitled file moves it to the Trash, and switching away from one with text keeps it.
f. Rename: type a new name and the file on disk is renamed, the title and drawer follow, and the text is intact; a name that already exists is refused with the field restored and no file overwritten; an empty name changes nothing; a name with "/" is cleaned.
g. Cmd-Z right after a switch or a rename must not bring the previous file's text into the current one.
h. Close the window and relaunch: the size is restored and the last file reopens (or a new untitled file is created if it cannot).
i. A file changed by another app while open: reloads when there is no pending edit; keeps the typed text when there is, with an inline message.
j. Quit with an empty untitled file: it ends up in the Trash, not in the folder.
k. No alert, sheet or `presentError` appears for any error above (rename collision, failed save, unreadable file, denied folder): each shows as an inline status-line message.
l. Web: `node tools/stamp.js --check` and `node tests/app.test.js` pass; the site in a browser is unchanged (same skull, same `.txt` button, no new controls without a host).

If something cannot be done reliably under the sandbox or SwiftUI, say what and propose the smallest alternative instead of working around it silently.

## Results

(The coding session fills this in: what changed file by file, the result of every test above with exact errors for failures, what was left out, anything surprising, and the pull request link.)
