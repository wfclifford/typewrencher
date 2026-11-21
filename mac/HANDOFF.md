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
2. **`switchTo(url)`**, the one function every way of opening a file uses. It (a) writes the current file (the page has already sent its newest text; apply the last `textChanged` before saving), (b) reads the new file, (c) updates the model, (d) calls `window.TypewrencherHost.setDocument({ text, name })`, (e) updates the window title, the drawer's selected row (`sendFiles` with the new "current" name) and the folder watcher. If saving or reading fails, show the error and stay on the current file.
3. **Autosave.** Edits are written to the current file a moment after the page's debounced `textChanged` messages. Write atomically. There is no Edited dot and no unsaved state.
4. **New documents.** The page sends `{ type: 'new' }` from a "+" button; File > New (Cmd-N) must do the same thing natively. The action:
   - If the current file is an app-created, still-empty "untitled" file, do nothing.
   - Otherwise create a new empty file in the current file's folder (or the "documents folder") named `untitled.txt`; if that name is taken, `untitled 2.txt`, `untitled 3.txt` and so on, using the first number not already in the folder. Then `switchTo` it. Remember that the app created it and that it is untitled.
   - "Documents folder": the folder of the last file opened or created, remembered across launches with a security-scoped bookmark. If there is none yet, show one folder-chooser panel ("Choose a folder for new documents"), remember the choice, and continue. If creating a file fails for lack of permission, show the error; do not fall back silently.
   - When switching away from, closing the window on, or quitting with an untitled file that the app created and that is STILL EMPTY (zero bytes), move it to the Trash with `FileManager.trashItem`. Never remove any other file; never remove a file that has text in it.
5. **Rename.** The page sends `{ type: 'rename', name: '<new name without .txt>' }` when the person finishes editing the name field (Return, leaving the field, or a pause of about a second). Swift renames the current file in the same folder to that name plus ".txt" with `FileManager.moveItem`, then updates the model, the window title, the drawer (current row) and Open Recent. Rules:
   - Clean the name like the page does for export: no "/" or ":" characters, trim spaces and dots at the ends; an empty result means no change.
   - If a file with that name already exists in the folder, do not overwrite it and do not rename: reply to the message with an error, call `setDocument({ text, name: <old name> })` so the field goes back to the old name, and show a short alert.
   - If the name did not change, do nothing. Renaming ends the "untitled" state of that file (it is no longer trashed when empty).
   - A rename must not lose text: save the current text first, and keep the file watcher from reporting the rename as an external change.
6. **Menus** (use `CommandGroup` to replace the File items): New (Cmd-N), Open... (Cmd-O), Open Recent (a submenu built from `NSDocumentController.shared.recentDocumentURLs`, with Clear Menu), Save (Cmd-S; saves now), Save As... (Shift-Cmd-S; writes a copy to a chosen new file and switches to it), Close (Cmd-W closes the window; quitting the app when it closes is acceptable). Call `NSDocumentController.shared.noteNewRecentDocumentURL(url)` whenever a file is opened, created or renamed. The page's .txt export (its save panel) stays as it is.
7. **Finder and Dock.** Opening a `.txt` file from Finder or onto the Dock icon calls `switchTo(url)` in the existing window (use `onOpenURL` or an `NSApplicationDelegateAdaptor` `application(_:open:)` handler, whichever works; it must never create a second window). Keep the Plain Text document type in `Info.plist`.
8. **Files drawer.** Keep it as it is (folder access, watcher, list). `openFile` calls `switchTo(url)` with the chosen file in the same folder. Replace uses of `parent.fileURL` and `parent.document` with the model. The drawer must show a new untitled file as soon as it is created and the renamed name after a rename.
9. **External changes and launch.** If the current file changes on disk while open and there is no pending edit, reload it into the page; if the person has typed since the last save, keep their text and say so in a simple alert. Restore the window's size and position between launches (`setFrameAutosaveName`). On launch, reopen the last-open file if it still exists (needs a security-scoped bookmark under the sandbox); otherwise do the "new document" action.

### Web side

10. Add a "+" button next to the Open button in the page, shown only when a host is present (inside the Mac app); browsers must not change. It posts `{ type: 'new' }` (flush unsent text first, as the skull does). Give it an accessible name ("New document") and a plain "+" or matching icon in the existing button style; it must be at least 44px on touch like the other buttons and work in every tone and theme.
11. The name field posts `{ type: 'rename', name }` when the person finishes editing it (Return, blur, or about a second after typing stops), only inside the app and only if the value differs from the last name Swift set. `setDocument` must not trigger a rename message.
12. Update the header comment in `js/host.js` to list the two new messages. Add tests to `tests/app.test.js`: the button is hidden in a browser and visible with a host; it posts `new`; the name field posts `rename` only on commit and not on `setDocument`; the existing 214 tests still pass. Follow the web rules in `CLAUDE.md` (stamp, check, tests).

### Test and report (verify on disk, not only in the UI)

a. Open file A, type, open file B from the drawer: A on disk has the typing, and B is shown in the same window with its name in the filename field.
b. Type in B: only B's file changes, never A's.
c. Switch twice in a row quickly, with typing just before each switch: no text is lost or crosses over.
d. Open via File > Open, Open Recent, the page's Open button, Finder double-click and a drag onto the Dock icon: exactly one window each time, and it switches.
e. New (Cmd-N and the "+" button) creates `untitled.txt`, then `untitled 2.txt` after the first has text, then `untitled 3.txt`; New on an empty untitled file does nothing; switching away from an empty untitled file moves it to the Trash, and switching away from one with text keeps it.
f. Rename: type a new name and the file on disk is renamed, the title and drawer follow, and the text is intact; a name that already exists is refused with the field restored and no file overwritten; an empty name changes nothing; a name with "/" is cleaned.
g. Cmd-Z right after a switch or a rename must not bring the previous file's text into the current one.
h. Close the window and relaunch: the size is restored and the last file reopens (or a new untitled file is created if it cannot).
i. A file changed by another app while open: reloads when there is no pending edit; keeps the typed text when there is.
j. Quit with an empty untitled file: it ends up in the Trash, not in the folder.
k. Web: `node tools/stamp.js --check` and `node tests/app.test.js` pass; the site in a browser is unchanged apart from nothing visible (no "+" button without a host).

If something cannot be done reliably under the sandbox or SwiftUI, say what and propose the smallest alternative instead of working around it silently.

## Results

(The coding session fills this in: what changed file by file, the result of every test above with exact errors for failures, what was left out, anything surprising, and the pull request link.)
