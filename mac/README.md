# Typewrencher for Mac (starter)

An unbuilt starting point for the macOS app: a SwiftUI `DocumentGroup` whose window is a `WKWebView`
running the existing web app through the bridge in `js/host.js` (protocol 1). These files were written
without Xcode and have **not been compiled**; expect small fixes on first build.

## Files

- `Typewrencher/TypewrencherApp.swift`: the app; one window per document.
- `Typewrencher/TextDocument.swift`: a plain UTF-8 `.txt` document.
- `Typewrencher/WebEditorView.swift`: the web view and the bridge (`ready`, `textChanged`, `export`; `setDocument` back).
- `Typewrencher/SiteSchemeHandler.swift`: serves the bundled site at `typewrencher://app/`.

## Set up in Xcode

1. File > New > Project > macOS > App. Product name `Typewrencher`, interface SwiftUI, language Swift. Save it **inside this `mac/` folder**.
2. Delete the template's `ContentView.swift`, `*App.swift` and any template document file; add the four files above to the target (the template's folder is `mac/Typewrencher/`, so they may already be in place).
3. Target > Signing & Capabilities: App Sandbox on, with **User Selected File: Read/Write**. No network entitlement is needed.
4. Target > Info > Document Types: add one type, Name `Plain Text`, Types `public.plain-text`, Role `Editor`, so Finder opens `.txt` files here.
5. Build the site into the app: from the repo root run `node tools/build-site.js mac/Typewrencher/site`, then drag the `site` folder into the Xcode project as a **folder reference** (blue folder), target membership on. Re-run the command whenever the web files change. The folder is ignored by git.
6. Run. In Safari, Develop > this Mac > Typewrencher shows the web console.

## Things to check first

See "First session on the Mac: what to try" in the planning brief.
