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
   The folder is ignored by git and is a folder reference (blue folder) in the Xcode project. **Run this again whenever the web files change**; the app only sees a copy.
3. Open `mac/Typewrencher.xcodeproj` in Xcode, choose "My Mac", and press Run.
4. In Safari, Develop > this Mac > Typewrencher shows the page's web console (debug builds).

## Notes

- Inside the app the page hides its own Open button (File > Open does that); the filename field and the `.txt` button stay, and the button opens the native save panel.
- The sandbox allows User Selected File (Read/Write) and Outgoing Connections (Client). WebKit's processes need the network entitlement to start; the page's Content Security Policy still limits which hosts it can reach.
- Keep bridge protocol 1 compatible. If it must change, update `js/host.js`, `window.TypewrencherHost` in `js/app.js` and `WebEditorView.swift` together.

## Things to check

See "First session on the Mac: what to try" in the planning brief.
