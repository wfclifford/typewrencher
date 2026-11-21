# Typewrencher for Mac

A single-window SwiftUI app whose window is a `WKWebView` running the existing web app through the
bridge in `js/host.js` (protocol 1). The native side owns the document, the files and the menus; the page
stays the editor. Every document is a real `.txt` file from the moment it exists, and edits save as you type.

## Files

- `Typewrencher.xcodeproj`: the Xcode project (macOS only, App Sandbox on).
- `Typewrencher/TypewrencherApp.swift`: the app: one `Window` scene, the File menu, and the app delegate (Finder and Dock opens, quitting).
- `Typewrencher/EditorSession.swift`: the one document and the bridge: `switchTo(url)` (every way of opening a file), autosave, New and untitled files, rename, changes from outside, reopening at launch, the files drawer.
- `Typewrencher/WebEditorView.swift`: hosts the web view.
- `Typewrencher/TextFile.swift`: plain UTF-8 read and write.
- `Typewrencher/FolderFiles.swift`: saved folder and file permissions (security-scoped bookmarks), the drawer's file list, and the file and folder watcher.
- `Typewrencher/SiteSchemeHandler.swift`: serves the bundled site at `typewrencher://app/`.
- `Typewrencher/Info.plist`: declares the Plain Text document type so Finder can open `.txt` files here.

## Build and run

1. Install Node.js 22 or newer (nodejs.org) if it is not installed.
2. From the repo root, build the site into the app's folder:
   `node tools/build-site.js mac/Typewrencher/site`
   The folder is ignored by git. In the Xcode project it sits inside the synced `Typewrencher` folder and is set to **Apply Once to Folder** (File inspector, next to Target Membership), so it is copied into the app as one folder. Applied to each file instead, Xcode flattens it and the build fails with "Multiple commands produce … CMUdict-LICENSE.txt". **Run this again whenever the web files change**; the app only sees a copy.
3. Open `mac/Typewrencher.xcodeproj` in Xcode, choose "My Mac", and press Run.
4. In Safari, Develop > this Mac > Typewrencher shows the page's web console (debug builds).

## How it behaves

- **One window, always.** File > Open, Open Recent, the page's Open button, Finder, the Dock icon and the files drawer all switch that window to the file; closing the window quits the app. The window's size and position are kept between launches, and the last file reopens (or a new untitled file starts if it cannot).
- **Saving.** Edits are written a moment after you stop typing, with no Edited state. File > Save writes at once; File > Save As writes to a new file and switches to it; File > Export (and the page's Export button) writes a copy with the export options.
- **New.** The "+" button (the skull in a browser) and File > New create `untitled.txt`, `untitled 2.txt`, … in the current file's folder, or in the documents folder (chosen once). An untitled file that is still empty when you leave it goes to the Trash.
- **Renaming.** Editing the name field renames the file in its folder. A name that is taken is refused and the field goes back.
- **Changes from outside.** A file changed by another app reloads, unless you have typed since the last save; then your text is kept and the notice line says so.
- **No alerts.** Messages appear on a notice line under the counts (`TypewrencherHost.notify`); only the native file panels open.

## Sandbox notes

- The sandbox grants the file you open, not its folder. Folders are granted once with an Open panel at that folder ("Allow Access"): from the drawer, when renaming, and for the documents folder. `FolderFiles.swift` keeps each grant as a security-scoped bookmark. No extra entitlement is needed.
- Renaming, creating files and atomic saves need the folder. Without it, saves rewrite the file in place.
- Being able to list a folder is not permission to open its files (Documents synced with iCloud allow the first but not the second), so the drawer counts a folder as granted only with a saved grant.
- The sandbox allows User Selected File (Read/Write) and Outgoing Connections (Client). WebKit's processes need the network entitlement to start; the page's Content Security Policy still limits which hosts it can reach.
- Keep bridge protocol 1 compatible. If it must change, update `js/host.js`, `window.TypewrencherHost` in `js/app.js` and `EditorSession.swift` together.
- Keep `EditorWindow`'s view structure fixed: a branch there makes SwiftUI build a new web view, which reloads the page.

## Things to check

After a change to the Swift files or the bridge, run the checklist in `HANDOFF.md` (tests a–l), checking files on disk as well as the window. At least:

1. The page loads from `typewrencher://app/` with no Content Security Policy errors in the web console.
2. Opening a `.txt` file shows its text in the one window, with its name in the name field.
3. Typing saves to that file, and only that file, within about a second.
4. Switching files right after typing keeps the typing in the file you left.
5. The "+" creates `untitled.txt`; leaving it empty puts it in the Trash.
6. Export opens a save panel, writes the copy and shows "Done"; Cancel closes it quietly.
