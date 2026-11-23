# iPhone and iPad handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Task: iOS phase 1, web view spike

Status: decided by the owner; nothing built yet. Browsers and the Mac app must not change.

Decisions already made (do not reopen): web view first; one universal iPhone and iPad app; one window on iPad (multiple scenes off); app folder plus a chosen folder for documents (not in this task); on iOS no trash button for now, files are deleted in the Files app; distribution is undecided, so use a free Apple account for the owner's own devices and do not set up TestFlight or the paid program.

Build: an ios/ Xcode project (SwiftUI, iOS and iPadOS, one universal target) with a UIViewRepresentable wrapping a WKWebView that loads the site through SiteSchemeHandler (copy or share mac/Typewrencher/SiteSchemeHandler.swift; serve typewrencher://app/ from a bundled site folder made with node tools/build-site.js ios/Typewrencher/site). Add that folder to .gitignore like the Mac one. The bridge handler may answer ready and stub every other message; files are not part of this phase. Bridge protocol 1 is unchanged. Before signing, ask the owner for the bundle identifier and the development team; do not invent them.

Do not touch js/, css/, index.html, sw.js or tools/ in this task. If a web change looks needed, list it under Results as a finding and stop. No dependencies, no alerts, sheets or toasts that interrupt writing, no claims about iCloud or the paid account.

Run these checks (simulator where possible; the owner runs 1.3 to 1.6, 1.10 and 1.11 on the iPhone and the iPad with its hardware keyboard and sends results back):
1.1 Site loads from the bundle under typewrencher://app/ and ready is posted; no console errors.
1.2 Settings persist: change font and color, force-quit, relaunch. If lost, report it (a prefs message may be added later).
1.3 Keyboard and viewport: with the software keyboard up on iPhone and iPad, the caret line stays visible, nothing scrolls out of reach, and html.kb is set correctly; rotation too. Device only.
1.4 Safe areas: nothing under the notch, home indicator or rounded corners, portrait and landscape.
1.5 Gutter alignment: at every font size the app offers, line numbers and syllable counts stay on their text lines through a long wrapped paragraph and after a rotation. Device only.
1.6 Hardware keyboard on iPad: typing, Command-Z and Shift-Command-Z, arrows, Option-arrow, selection, without a beep.
1.7 Undo: works across typing and a paste; after switching documents the history must not bring back the other file's text (a stubbed switch is fine).
1.8 Single scene: with multiple scenes off, an iPad shows one window. If SwiftUI ignores the setting, record it and try a UIKit scene delegate.
1.9 Phone layout: header buttons, name field and files drawer fit on the smallest iPhone the owner has.
1.10 Page width on iPad: portrait, landscape, Split View at one third, half and two thirds, and Slide Over. Record the CSS width in each; the Page width control shows exactly at 800 px or more and nothing overflows below it.
1.11 Lock Rhymes height: with the keyboard open and closed, portrait and landscape, the panel does not jump while typing.
1.12 Rhyme mark: readable in every tone on a device, in system light and dark.
1.13 Drawer on a phone: it floats over the text, and closing it returns the caret. The trash button should be absent on iOS; if the page shows it with the stubbed bridge, record that as a finding (do not change the web files).

Results to record, each as pass, fail or not run, with the exact error or what was seen, the device and iOS version: 1.1 to 1.13; for 1.5 the font sizes tried; the Xcode version; any web-file change that would be needed (including whether the Mac's Name-field behavior from pull request 43 needs an iOS equivalent), listed but not made.

Decision gate for the owner, not for you: if 1.3 or 1.5 fail in a way CSS or JS cannot fix, the next phase is a native-editor spike instead.

### Build and run

1. `node tools/build-site.js ios/Typewrencher/site` from the repo root (the folder is ignored by git; the `site` folder is opaque in the project, like the Mac one). Run it again whenever the web files change.
2. Open `ios/Typewrencher.xcodeproj`. For the simulator no team is needed. For a device, set your team under Signing & Capabilities, and confirm the bundle identifier (see Results).
3. In a Debug build, the bridge appends page errors, Content Security Policy violations and each bridge message to `twdebug.log` in the app's tmp folder; Safari's Develop menu also shows the page (`isInspectable`).

### Results

Built on branch `ios-phase-1`. Xcode 27.2 (27B52), simulators iOS 27.2 (iPhone 17, iPad Pro 11-inch M5), Debug build, `CODE_SIGNING_ALLOWED=NO`. Nothing was run on a physical iPhone or iPad. The only way I could drive the simulator was `simctl` (launch, screenshot, read the app's log file): I could not tap, type, rotate or force-quit, so every check that needs input is "not run".

**What was built.** `ios/Typewrencher.xcodeproj` (the same JSON project format as the Mac one), one universal target (iPhone and iPad), deployment target iOS 18.0 (my choice, not decided by the owner), no dependencies. `TypewrencherApp.swift` (one `WindowGroup`, web view ignoring safe areas), `WebEditorView.swift` (`UIViewRepresentable` around `WKWebView`, `contentInsetAdjustmentBehavior = .never` so the page's own `env(safe-area-inset-*)` applies, plus the bridge), `SiteSchemeHandler.swift` (a copy of the Mac file, unchanged), assets (the Mac icon at 1024 px), `Info.plist`. The bridge answers `ready` and every other message with an empty reply; `export` replies with the error "not available yet" so the page does not show "Done" for a file never written. `.gitignore` gained `ios/Typewrencher/site/`. js/, css/, index.html, sw.js and tools/ were not touched.

**Signing: the owner still has to supply two things.** Bundle identifier: asked; the answer was to propose one from the Mac app's (`io.github.wfclifford.Typewrencher`), so the project uses `io.github.wfclifford.Typewrencher.ios`. It is a proposal: confirm or change it before running on a device. Development team: the owner chose simulator only, so none is set and nothing was signed.

| Check | Result |
| --- | --- |
| 1.1 | **Pass (simulator).** iPhone 17 and iPad Pro 11-inch, iOS 27.2: the page loaded from `typewrencher://app/index.html`, `ready` was posted, `window.TypewrencherHost` was an object, and the Debug log recorded no `error`, `unhandledrejection`, `securitypolicyviolation` or `console.error` lines. Web Inspector was not opened, so this covers only what those hooks catch. The first screenshot after a fresh install or boot was sometimes blank white; the page appeared within a few seconds (cold simulator start). |
| 1.2 | **Not run.** Could not tap or force-quit. Nothing in the app clears `localStorage`; the data store is the default persistent one. |
| 1.3 | **Not run** (device only). |
| 1.4 | **Partial pass (simulator, iPhone 17, portrait only).** Header started below the status bar and the footer stayed above the bottom edge. Landscape and iPad rotation: not run. Not seen on a device with a notch or rounded corners. |
| 1.5 | **Not run** (device only). No font sizes tried. |
| 1.6 | **Not run** (needs an iPad with a hardware keyboard). |
| 1.7 | **Not run.** The switch is stubbed and I could not type or paste. |
| 1.8 | **Found, fixed, partly checked.** With `INFOPLIST_KEY_UIApplicationSupportsMultipleScenes = NO` and generated scene manifest, the built `Info.plist` still said `UIApplicationSupportsMultipleScenes => true` (read with `plutil -p`). Fix: an explicit `ios/Typewrencher/Info.plist` with `UIApplicationSceneManifest { UIApplicationSupportsMultipleScenes = false }`; the built plist now says false and the app launches and loads on the iPad simulator in one window. Whether iPadOS offers a second window (for example from the multitasking menu or App Exposé) was not tested, so I did not need the UIKit scene delegate and did not try it. |
| 1.9 | **Partial (simulator iPhone 17, 402 pt wide).** The header shows files drawer, Open, +, "Name", the name field, Export and Settings in one row, and it fits, but the name field is only about 70 pt wide and shows "fi" (clipped). The smallest iPhone the owner has: not run. The drawer: not opened. |
| 1.10 | **Not run.** The iPad Pro 11-inch simulator in portrait reported `innerWidth` 834 and the settings drawer was open at first launch (the first-run welcome). Split View, Slide Over, landscape: not run. The Page width control was not looked at. |
| 1.11 | **Not run.** |
| 1.12 | **Not run.** The default retro_term tone (dark) was seen on both simulators. |
| 1.13 | **Not run.** The drawer was not opened. With the stub no `setFiles` is ever sent, so the list is empty and no trash button can appear; that proves nothing about iOS. See finding 2. |

**Findings (web changes that would be needed or worth deciding; none made).**
1. **Name field (pull request 43).** The select-on-focus code in `js/app.js` (`fname.addEventListener("focus", ...)`) is not gated on the Mac host, so it also runs on iOS. Whether `select()` works there (iOS Safari often ignores `select()` outside a user gesture and may need `setSelectionRange`) was not run. A device check is needed before deciding whether iOS needs its own handling.
2. **Trash button.** I found no condition in `js/app.js` that hides the per-row trash button on iOS; the page draws it whenever a host sends a file list. Once the files phase sends `setFiles`, the button will appear unless the web side gets a flag (for example a capability the host reports) or the host never sends it. Not verified at runtime, because the stub sends no list.
3. **Name field width on a phone.** At 402 pt the field is clipped to about two characters. Possibly acceptable once a name is shown elsewhere, but the owner should look at it on the smallest iPhone (check 1.9).
4. **Page background before the page paints.** The web view is white until the page loads; with the dark default this is a white flash on launch. A native background colour would fix it, but the page's tone is not known to Swift, so I left it.

**For the owner to run on devices:** 1.3 to 1.6, 1.10 and 1.11 as listed, plus 1.2, 1.7, 1.9, 1.12, 1.13 and landscape for 1.4. Decision gate (1.3, 1.5): not decided here.

**Notes.** `SiteSchemeHandler.swift` is copied, not shared, so a change to the Mac copy has to be repeated in `ios/Typewrencher/`. The Debug-only log file and the `twdebug` script handler are not compiled into Release builds (the script and file writes are under `#if DEBUG`; the navigation log line still goes to `os.Logger`).
