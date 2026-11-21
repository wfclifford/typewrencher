# Notes for coding agents

Typewrencher is a static web app (HTML, CSS, vanilla JS, no build step) published on GitHub Pages, plus a native Mac app in `mac/` that runs the same web UI in a `WKWebView`. Read `README.md` and `mac/README.md` first. The owner keeps a planning brief outside the repo; open work for the Mac app is handed over in `mac/HANDOFF.md`.

## Standing decisions

- Documents are plain UTF-8 `.txt` files with no per-document settings. Fonts and colors are app-wide.
- Distribution of the Mac app is direct download for now (Developer ID, notarized). No App Store or TestFlight work for the Mac app. iPhone and iPad distribution is undecided and is being planned separately.
- Apple platforms only, for now. Mac first; iPhone and iPad later.
- The web files are shared: the live site is built from them. Browsers must behave as before.
- The Mac app is a single window. The page is the editor; Swift owns files, windows and menus.

## Bridge protocol 1 (`js/host.js`, `window.TypewrencherHost` in `js/app.js`)

Keep it compatible. New messages may be added, but existing ones keep their shape. When a message is added or changed, update the header comment in `js/host.js`, the Swift handler in `mac/Typewrencher/WebEditorView.swift` and the tests in the same change.

## Web changes

- Site files are the ones in `SITE_FILES` in `tools/build-site.js`. Merging a change to any of them counts as a release on the live site.
- Never edit `js/version.js` by hand, nor the `?v=` hashes in `index.html`, nor the generated block in `sw.js`. After changing site files run `node tools/stamp.js`, then `node tools/stamp.js --check` and `node tests/app.test.js`. All tests must pass.
- Do not add dependencies or a build step to the site.
- The Mac app serves a copy of the site: after web changes run `node tools/build-site.js mac/Typewrencher/site` (the folder is ignored by git).

## Workflow

- Work on a branch and open a pull request into `main`. Never push to `main` and never merge without the owner saying so.
- End commit messages and pull request descriptions with any attribution lines the tool gives you.
- Report what was observed, with exact errors. Do not guess at results that were not run, and do not claim a Mac behavior works unless it was run on the Mac.
