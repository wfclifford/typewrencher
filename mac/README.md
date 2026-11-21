# Typewrencher for Mac

A SwiftUI `DocumentGroup` app whose window is a `WKWebView` running the existing web app through the
bridge in `js/host.js` (protocol 1). The native side owns documents (open, save, Open Recent, the save
panel for the page's .txt button); the page stays the editor.

## Files

- `Typewrencher.xcodeproj`: the Xcode project (macOS only, App Sandbox on).
- `Typewrencher/TypewrencherApp.swift`: the app; one window per document.
- `Typewrencher/TextDocument.swift`: a plain UTF-8 `.txt` document.
- `Typewrencher/WebEditorView.swift`: the web view and the bridge (`ready`, `textChanged`, `export`; `setDocument` back).
- `Typewrencher/SiteSchemeHandler.swift`: serves the bundled site at `typewrencher://app/`.
- `Typewrencher/Info.plist`: declares the Plain Text document type so Finder can open `.txt` files here.

## Build and run

1. Install Node.js 22 or newer (nodejs.org) if it is not installed.
2. From the repo root, build the site into the app's folder:
   `node tools/build-site.js mac/Typewrencher/site`
   The folder is ignored by git. In the Xcode project it sits inside the synced `Typewrencher` folder and is set to **Apply Once to Folder** (File inspector, next to Target Membership), so it is copied into the app as one folder. Applied to each file instead, Xcode flattens it and the build fails with "Multiple commands produce … CMUdict-LICENSE.txt". **Run this again whenever the web files change**; the app only sees a copy.
3. Open `mac/Typewrencher.xcodeproj` in Xcode, choose "My Mac", and press Run.
4. In Safari, Develop > this Mac > Typewrencher shows the page's web console (debug builds).

## Notes

- Inside the app the page hides its own Open button (File > Open does that); the filename field and the `.txt` button stay, and the button opens the native save panel.
- The sandbox allows User Selected File (Read/Write) and Outgoing Connections (Client). WebKit's processes need the network entitlement to start; the page's Content Security Policy still limits which hosts it can reach.
- Keep bridge protocol 1 compatible. If it must change, update `js/host.js`, `window.TypewrencherHost` in `js/app.js` and `WebEditorView.swift` together.

## Things to check

After a change to the Swift files or the bridge, run the app and check, in order:

1. The page loads from `typewrencher://app/` with no Content Security Policy errors in the web console.
2. The bridge sends `ready`: opening a `.txt` file shows its text, which the native side only sends after `ready`.
3. Typing updates the document: the title bar shows "Edited", and the change autosaves.
4. File > Open of a `.txt` file shows its text.
5. Save (⌘S) writes the text back to the file.
6. The page's `.txt` button opens a save panel, writes the export, and then shows "Done"; Cancel closes it quietly.
