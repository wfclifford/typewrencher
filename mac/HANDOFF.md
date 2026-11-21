# Mac app handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Task: single-window app with real-file documents

Status: done, merged (pull request 19, with its review follow-up). Waiting for the next task.

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

Pull request: https://github.com/wfclifford/typewrencher/pull/19

Run on macOS 27.2 with a Debug build, in scratch folders under `~/Developer`, checking files on disk (`cat`, `xxd`, `ls`, Spotlight for the Trash) as well as the window.

### Decision taken with the owner

The sandbox grants an opened file but not its folder, and renaming (and an atomic save) needs the folder. Agreed: the first time a rename needs a folder that is not granted, show the same folder panel as the drawer's Allow access, opened at that folder. If it is declined, the name field goes back and the notice line says why. Until the folder is granted, saves rewrite the file in place.

### What changed

Web (shared with the site; browsers unchanged):
- `index.html`: "+" icon (`icon-app`) in the skull button beside the skull (`icon-web`); the export glyph replaces the diskette as the `.txt` button's `icon-app`; a notice line `#hostNote` (hidden) at the end of the footer.
- `css/styles.css`: the "+" drawn as an outline; `.host-note`.
- `js/app.js`, with a host only:
  - The skull is named "New document" and sends unsent text, then `{ type: 'new' }`; it no longer sends `close`.
  - The `.txt` button reads "Export" ("Export a copy as .txt").
  - The name field posts `{ type: 'rename', name }` on Return, blur, or 1 s after typing, only when the value differs from the name the native side last set. Return no longer exports in the app.
  - `TypewrencherHost.notify(message)` and `exportNow()`.
  - About: "The plus button starts a new document. Your text is saved to its file as you type."
- `js/host.js`: header lists `new`, `rename`, `notify` and `exportNow`, and notes `close` is no longer sent.
- `tests/app.test.js`: 3 tests updated for the new behavior and 5 added, covering browser skull and `.txt`, host New, Export with `exportNow` and Done, rename commit rules, browser Return, and `notify`. 219 pass.
- `js/version.js`, `sw.js`, `?v=` hashes: regenerated by `tools/stamp.js`.

Mac:
- `TypewrencherApp.swift`: `Window` scene, not `DocumentGroup`; File menu via `CommandGroup` (New ⌘N, Open… ⌘O, Open Recent with Clear Menu, Close ⌘W, Save ⌘S, Save As… ⇧⌘S, Export… ⇧⌘E); app delegate for Finder and Dock opens (`application(_:open:)`), quit on last window closed, and saving before quitting.
- `EditorSession.swift` (new): the one document and the bridge.
  - `switchTo(url)`: save, read, update, `setDocument`, title, drawer, watcher.
  - Autosave: 0.4 s after `textChanged`; atomic when the folder is granted, otherwise in place.
  - New and untitled files, the documents folder chooser, and trashing an empty untitled file.
  - Rename, with the collision check and the folder panel.
  - Outside changes; reopening the last file at launch; window frame restore.
  - `notify` with a queue until `ready`; the files drawer.
- `WebEditorView.swift`: only hosts the web view.
- `TextFile.swift` (new; `TextDocument.swift` removed): UTF-8 read and write.
- `FolderFiles.swift`: `FileAccess`, per-file bookmarks so Open Recent and reopening at launch work under the sandbox; `FolderWatcher` became `PathWatcher` (folders and single files).
- `mac/README.md`: rewritten for the single window.

### Test results

- **a. Pass.** Typed in A, then chose B in the drawer 0.15 s later. A on disk had all the typing ("typed in A and more"); B showed in the same window with "B" in the name field; one window.
- **b. Pass.** Typing in B changed only B (`bravo\nB1`); A was byte-for-byte unchanged.
- **c. Pass.** Typed and switched twice, each within 0.15 s of typing: "-A3" ended up in A and "-B3" in B; nothing lost or crossed over.
- **d. Pass,** with one gap:
  - File > Open, Open Recent, the page's Open button, and an open-documents event for a file in another folder and in the same folder each switched the one window; one instance, one window each time.
  - Not done physically: a real Finder double-click and a real drag onto the Dock icon. Both send the same open-documents event that was tested (`open -a`), so they need a manual check.
- **e. Pass.**
  - ⌘N created `untitled.txt`; ⌘N again on it, still empty, did nothing.
  - After text, "+" created `untitled 2.txt`, then `untitled 3.txt`; "+" on the empty `untitled 3` did nothing.
  - Leaving the empty files moved them to the Trash (found there by Spotlight); `untitled` and `untitled 2`, with text, were kept.
- **f. Pass.**
  - Renamed A to "Alpha Renamed": the file, title and drawer followed, text intact.
  - "B" (taken) was refused: field restored, B untouched, notice "A file named B already exists."
  - An empty name changed nothing; "Verse/One" became `VerseOne.txt`.
  - In a folder not granted, the panel opened at that folder. Cancel restored the field with "Typewrencher needs access to “tw-sw2” to rename files there."; Allow Access renamed `Outside.txt` to `Inside.txt`.
- **g. Failed, fixed, pass.**
  - First run: ⌘Z right after switching to B did not bring A's text, but it changed B: a newline was added, then autosaved (`bravo\n\n`). WebKit's undo history belongs to the window's undo manager and survived the swap.
  - Fix: clear the web view's undo history when a different text is shown (switching, or reloading after an outside change).
  - After the fix, three ⌘Z presses after switching left both files byte-for-byte unchanged.
- **h. Failed, fixed, pass.**
  - First run: the last file reopened, but the size came back as 900 × 450, not 1000 × 640; SwiftUI resized the window after the saved frame was applied. Fix: apply the saved frame again after SwiftUI's first sizing. Now the position and size are restored exactly.
  - With the last file gone (trashed at quit), launch created a new `untitled.txt` in the documents folder and showed "Typewrencher couldn't reopen untitled." That notice first did not appear; see item 1 under Surprising.
- **i. Failed, fixed, pass.**
  - A file changed outside with no pending edit reloaded at once.
  - First run with typing just before the outside change: the typing was lost and no notice appeared. The page holds typing about 300 ms before sending it, so the native side had not seen it. Fix: ask the page for its current text (`getText()`) before deciding.
  - After the fix, the typing was kept, written over the outside change, and the notice said "Typewrencher kept your changes; the file was also changed elsewhere."
- **j. Pass.** ⌘N, then ⌘Q: the empty `untitled.txt` left the folder and was in the Trash (renamed by the Trash to `untitled.txt 14-44-27-745.txt` because an `untitled.txt` was already there).
- **k. Pass.** No alert or sheet appeared (sheet count 0 each time); each message went to the notice line:
  - Rename collision and declined folder: see f.
  - Unreadable file (not UTF-8): "Typewrencher couldn't open Garbled: it is not UTF-8 text."; the current file stayed open.
  - Failed save (file made read-only): "Typewrencher couldn't save Locked: no permission."; the file on disk was unchanged. After making it writable, ⌘S saved.
  - `NSApp.presentError` and `NSAlert` are no longer used anywhere.
- **l. Pass.** `node tools/stamp.js --check` passes, and `node tests/app.test.js` exits 0 with 219 tests.
  - The built site rendered in WebKit without a host: skull "Erase text and filename", `.txt` label and "Save as .txt", the Open button shown, no files button, no notice line, no `TypewrencherHost`.

Also checked:
- Export… (⇧⌘E) wrote a copy and the button showed Done, staying on the file.
- Save As… (⇧⌘S) wrote the new file and switched to it.
- Close (⌘W) saved and quit.

### Left out or different from the task

- **Notice line instead of the status region.** Item 13 asks for the status line "the same line `say()` uses", but that region (`#status`) is screen-reader only. `notify` writes to a new visible notice line under the counts and also announces through `say()`. A notice clears after 12 s or when the next one replaces it.
- **Quit blocked while saving fails.** While a save keeps failing, switching files and quitting are refused too (the text stays, with the notice showing). Nothing is lost, but the person stays on that file until the save can succeed.
- **Rename with folder access but other errors.** A move that fails (for example, a read-only folder) shows "Typewrencher couldn't rename …" and keeps the old name; not tested beyond the collision and access cases.
- **Case-only rename** ("poem" to "Poem") is allowed past the collision check; not tested.
- **External change while the file is deleted:** the notice says the file was moved or deleted; the text stays in the page and the next save fails with a notice. Not tested.

### Surprising

1. **The page reloaded once per launch.** The window's view switched between two structures (with and without `.navigationDocument`), so when the first file opened SwiftUI built a second web view and reloaded the page, dropping a notice sent at launch. The view structure is now fixed and the title bar's file icon is set with `NSWindow.representedURL`. One web view was confirmed in the log afterwards. Earlier tests are unaffected, because the reload happened only on the first file of a launch.
2. WebKit's undo survives replacing a textarea's value (g above).
3. `NSLog` from the sandboxed debug app did not show in `log show`; `Logger` with `privacy: .public` did. That logging was used only for this investigation and removed.
4. Bookmarks for folders and files work without the `bookmarks.app-scope` entitlement.

### Follow-up (owner's review of PR 19)

Run on macOS 27.2 with a Debug build, plus the installed Release build where noted, in scratch folders under `~/Developer`, checking files on disk. The app's preferences were backed up first and pointed at scratch files during the tests.

#### What changed

- `mac/Typewrencher/EditorSession.swift`:
  - **Failing saves.**
    - A failed save sets a sticky notice ("Typewrencher couldn't save <name>: <reason>. Use Save As… to keep your text.") and remembers the reason; the next good save of that file clears it with `notify("")`.
    - Quitting while a save fails keeps the app open with "Typewrencher couldn't save <name>: <reason>. Press ⌘Q again to quit without saving, or use Save As… to keep your text." (sticky). A second quit request within 15 s, or any later one with no typing since that notice, quits without saving.
    - File > Close and the window's close button now ask the app to quit instead of closing the window first, so a refused quit never leaves the app running with no window.
  - **Save As as the way out.** Confirmed by reading and by running the previous build (below): `saveAs()` wrote the new file and then called `switchTo`, which began with `guard saveNow()` on the failing file, so it returned false. Now Save As writes the text to the new file and switches with `keepCurrent`, which does not save the old file.
  - **Switches.**
    - Every switch, and New, Save As and rename, runs as one operation at a time, and each starts from the page's current text (`getText()`).
    - A `getText()` reply that arrives after a switch is ignored.
    - Until the page shows the new file, any text it sends was typed into the file just left, and is written there, never into the new one.
  - **Rename.**
    - A case-only rename tries `moveItem` first and goes through a temporary name in the same folder if that is refused.
    - A failed move restores the field and says why (already the case; now tested).
  - **Moved or deleted file.** If the current file is moved or deleted outside the app, the sticky notice says "<name> was moved or deleted outside Typewrencher. Your text is still here; use Save As… to keep it." Later saves are refused with the reason "it was moved or deleted outside Typewrencher". The app does **not** recreate the file, so a file the person deleted or moved does not come back on its own, and a moved file does not leave a duplicate at the old path. Save As keeps the text, and quitting works as in item 1.
- `mac/Typewrencher/TypewrencherApp.swift`: File > Close calls the same quit path.
- **Web**, with a host only (browsers unchanged):
  - `index.html`: the name field's label span gets `id="fnameText"`.
  - `js/app.js`: the label reads "Name" with a host; `notify(message, { sticky })`: a sticky message stays until replaced or cleared with `notify("")`, and others still clear after 12 s.
  - `js/host.js`: header documents the optional second argument.
  - `tests/app.test.js`: 2 tests added (sticky past 12 s, cleared by an empty message, a plain one still times out; "Save as" in a browser and "Name" with a host, placeholder unchanged). 221 pass. Restamped.

#### Test results

- **1a and 1c (quit). Pass.**
  - Read-only current file, typed, ⌘Q: the app stayed open with the exact quit notice above; a second ⌘Q quit. The original file on disk was unchanged (expected).
  - The red close button with a failing save: still running, 1 window. A second click 20 s later, with no typing since, quit.
- **1b (Save As). Bug confirmed, then pass.**
  - Previous (installed) build: read-only file, typed, Save As to `Rescue.txt`: `Rescue.txt` had the text, but the window stayed on "Locked" with "Typewrencher couldn't save Locked: no permission." (the build would not quit either until the file was made writable).
  - New build, same steps: the window switched to "Rescue", `Rescue.txt` contained "locked text\n typed", the save notice cleared, and Locked was unchanged on disk.
- **2 (Name label). Pass.** The app shows "Name" beside the field; tests confirm "Save as" in a browser.
- **3 (sticky notices). Pass.**
  - The save-failure notice was still showing 15 s after typing into the read-only file.
  - It cleared after Save As.
  - Tests cover sticky versus plain and `notify("")`.
- **4 (newest text on switch). Pass.**
  - Typed " rNEND", then `open -a Typewrencher Y.txt` straight away (the whole `open -a` command took 110–133 ms; the open event arrives within that). The file left ended with " r1END", " r2END" and " r3END" in 3 of 3 rounds; Y was untouched.
  - The same with the previous build lost the typing entirely (" oldEND" never reached the file).
  - Two opens sent at the same moment, and three in a row, lost nothing and crossed nothing ("xx1" stayed in X, "xx2" in Y).
- **5. Edge cases.**
  - **Case-only rename: pass.** "X" to "x" (after granting the folder): `x.txt`, title "x", text intact, no temporary file left. On this volume the direct move worked (also checked with a separate script), so the temporary-name fallback was not exercised.
  - **Rename in a read-only folder: pass.** Field restored to "x", files unchanged, notice "Typewrencher couldn't rename x: no permission.", no sheet.
  - **File deleted while open: pass.** The text stayed in the page with the moved-or-deleted notice. Typing gave "Typewrencher couldn't save x: it was moved or deleted outside Typewrencher. Use Save As… to keep your text."; the file was not recreated. Quitting took two ⌘Q, as designed.
  - **Real Finder double-click: not done.** TextEdit is the default app for `.txt` on this Mac, so a double-click opens TextEdit; I did not change the owner's default.
  - **Real drag onto the Dock icon: not done.** The Dock auto-hides (the icon sits below the screen edge), and I did not get a reliable scripted drag.
  - **Finder's scripted Open With was not a valid test.** `tell application "Finder" to open … using …` did nothing at all, not even launching the app when it was not running, so it shows nothing about the app. A try with Finder's real right-click menu was stopped before it finished.
  - The open-documents event itself (`open -a`) works and reaches `application(_:open:)`. **Please check by hand:** double-click a `.txt` (with Typewrencher as its app) and drag a `.txt` onto the Dock icon; each must switch the one window.

#### Not done

- The Finder double-click and Dock drag above.
- The temporary-name path of the case-only rename (not reached on this volume).
