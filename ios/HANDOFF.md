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

**Signing: the owner still has to supply two things.** Bundle identifier: asked; the answer was to propose one from the Mac app's (`io.github.wfclifford.Typewrencher`), so the project uses `io.github.wfclifford.Typewrencher.ios`. The owner confirmed it on 2026-11-23, after it signed and ran on their iPhone and iPad. Development team: the owner chose simulator only, so none is set and nothing was signed.

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
3. **Header overflow in narrow windows.** Besides the clipped Name field on iPhone, Slide Over (about 320 CSS px) overlaps the Name field with the Export button. **Name field width on a phone.** At 402 pt the field is clipped to about two characters. Possibly acceptable once a name is shown elsewhere, but the owner should look at it on the smallest iPhone (check 1.9).
4. **Page background before the page paints.** The web view is white until the page loads; with the dark default this is a white flash on launch. A native background colour would fix it, but the page's tone is not known to Swift, so I left it.

### Summary of check results

| Check | Result |
| --- | --- |
| 1.1 | Pass (simulator; also runs on both devices) |
| 1.2 | Pass, iPhone and iPad (owner) |
| 1.3 | iPad pass; iPhone portrait: caret pass, header unreachable with the keyboard open; iPhone landscape: owner finds too little room (not a measured fail) |
| 1.4 | Pass, iPhone and iPad (owner) |
| 1.5 | Pass, iPhone and iPad (owner; size names not recorded) |
| 1.6 | Pass, iPad (owner) |
| 1.7 | Pass for typing and paste; document switching not run (stubbed) |
| 1.8 | Pass on the iPad Pro 10.5-inch after adding an explicit Info.plist; no second window possible |
| 1.9 | iPhone 14 Pro only: name field too small, nothing else wrong |
| 1.10 | Portrait 834, landscape 1112, half split about 551 (control absent, as the 800 px rule says); one third and two thirds not offered on this iPad; Slide Over about 320 shows a header overflow (Name field covered by Export) |
| 1.11 | Pass, iPhone portrait and iPad (owner); iPhone landscape not run |
| 1.12 | Pass, iPhone (owner) |
| 1.13 | Drawer floats: pass; no trash button seen (empty list, proves nothing); caret not returned after closing: fail |

Xcode 27.2 (27B52). iPhone 14 Pro, iOS 27.2. iPad Pro 10.5-inch, iPadOS 17.7.11. Simulators iOS 27.2.

### Owner's results on the iPhone 14 Pro (iOS 27.2, Debug build run from Xcode, reported by the owner)

I could not open the owner's screenshots (macOS refused the read), so these are the owner's words, not my observations.

- **1.1:** the app runs and shows the page on the device.
- **1.3 portrait, software keyboard:** the caret line stays visible (pass). The header does not stay reachable while the keyboard is open; the footer does. Whether that is the page's intended keyboard-open layout or a fault was not decided, and `html.kb` was not inspected.
- **1.3 landscape:** the owner reports there is not enough room for the keyboard and enough of the interface to work, and suggests landscape should not be offered on the iPhone unless an external keyboard is attached. Not changed: this is the owner's decision (see below).
- **1.11 (lock Rhymes height), portrait, keyboard open:** the Rhymes panel works correctly with the lock on and off.
- **1.9:** the file name field is too small (matches finding 3).
- **1.13 / stubs:** the files drawer opens and is empty; Open and + do nothing; Export shows "couldn't save". All three are the stubbed bridge doing what it was built to do (no `setFiles`, empty replies, and `export` replying "not available yet"), not faults.
- **Not reported:** 1.2, 1.4, 1.5, 1.7, 1.12, and the iPad checks (1.6, 1.10, and the rest).

### Owner's results on the iPad Pro 10.5-inch (iPadOS 17.7.11, Debug build run from Xcode)

Widths are my readings of three screenshots the owner supplied (screenshot pixels divided by 2, the iPad's scale), not `innerWidth` readings, so treat them as about right, within a few px.

- **1.8 single scene: pass on this iPad.** The owner found no way to open a second window.
- **1.10 page width:**
  - Portrait, full screen: 834 CSS px (from the iPad's screen size, not measured). Owner: Page width works.
  - Landscape, full screen: 1112 CSS px (screenshot). Owner: Page width works. The settings drawer was closed in the screenshot, so I did not see the control myself.
  - Split View, half: about 551 CSS px (screenshot). Owner: no Page width control, which matches the 800 px rule. Header, editor and footer fit.
  - Split View one third and two thirds: not run. This iPad only offers 50/50.
  - Slide Over: about 320 CSS px (screenshot). Whether the control was hidden was not reported.
  - **Fail, Slide Over:** the header row overflows. The "Name" label shows as "N" and the Export button sits over the name field, so the field cannot be used. Seen in a screenshot. A web (CSS) change would be needed; none made.
- **1.6 hardware keyboard (owner, iPad, iPadOS 17.7.11): pass.** Typing, undo, redo, arrows, Option-arrow and selection all worked, with no beep reported.
- **1.3 software keyboard (owner, iPad, portrait and landscape): pass.** Caret line, header and footer all stayed visible in both orientations. This differs from the iPhone, where the header was not reachable with the keyboard open.
- **1.11 lock Rhymes height (owner, iPad): pass,** locked and unlocked.
- **1.5 gutter alignment (owner): pass on both the iPhone 14 Pro and the iPad Pro 10.5-inch.** The owner tried every text size the app offers, in portrait and landscape, with wrapping on and off. The seven size names and the paragraph length were not recorded.
- **1.2 settings persist (owner): pass.** Font, color tone and theme survived a force-quit and relaunch. Confirmed by the owner on both the iPhone 14 Pro and the iPad Pro 10.5-inch.
- **1.7 undo (owner): pass for typing and a paste.** Undo took them back in order. Switching documents is stubbed (the + button does nothing), so that part is **not run**.
- **1.4 safe areas (owner): pass.** iPhone 14 Pro portrait and landscape (both directions), around the Dynamic Island, rounded corners and home indicator, and the iPad Pro 10.5-inch. This replaces my simulator-only "partial pass" in the table above.
- **1.12 rhyme mark (owner): pass.** Reported as passing for every tone in system light and dark, on the iPhone 14 Pro (the step was given for it). The owner did not list the tones one by one, and did not say whether the iPad was also checked.
- **1.13 drawer on a phone (owner, iPhone 14 Pro; two screenshots I read): partial.**
  - Pass: the drawer opens and floats over the left of the text (it covers part of the text; the text does not reflow).
  - No trash buttons appear. The drawer is empty because the stub sends no files, so this says nothing about what the page will do once files are listed (see finding 2).
  - **Fail: closing the drawer does not return the caret.** The owner closed the keyboard, opened and closed the drawer, and had to tap the text again to bring the keyboard back. Note the keyboard was already closed before the drawer was opened, so this shows the drawer does not refocus the text, not that it loses a caret the keyboard still held. Whether the page is meant to refocus (it may rely on the Mac or desktop focus behavior) was not checked; a web change would be needed, none made.
  - With the keyboard open, the header, including the files drawer button, has scrolled out of view (screenshot), and the owner has to close the keyboard to reach it. The system's form-accessory bar (up, down and check buttons) shows above the keyboard and takes space; whether it can be hidden natively, or whether this layout is the page's intent, was not tried.
- **1.9 phone layout (owner, iPhone 14 Pro, the only iPhone the owner has): the name field is too small, nothing else is wrong.** The other header buttons and the drawer fit. The owner proposes moving the Open and + buttons into the files drawer to make room for the name field. That is a web change and was not made; it would also change the header order the Mac app and `mac/HANDOFF.md` rely on, so it would need to be iOS-only or decided for all platforms.
- **Not run on the iPad:** 1.13 and the Slide Over Page width control; anything not listed above.

**Decision for the owner:** locking the iPhone to portrait is one line in the build settings (`INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone`). "Landscape only with an external keyboard" cannot be set in the plist; it would need code that watches for a keyboard and restricts orientation, which is more than this phase and is not built.

**Deployment target:** the owner's iPad runs iPadOS 17.7.11, so the iOS 18.0 target first committed would not install there. It is now 17.0 (builds for the simulator). The development team is deliberately not in the committed project file (the repo is public): set your own team in Signing & Capabilities, and do not commit that line.

**For the owner to run on devices:** 1.3 to 1.6, 1.10 and 1.11 as listed, plus 1.2, 1.7, 1.9, 1.12, 1.13 and landscape for 1.4. Decision gate (1.3, 1.5): not decided here.

**Notes.** `SiteSchemeHandler.swift` is copied, not shared, so a change to the Mac copy has to be repeated in `ios/Typewrencher/`. The Debug-only log file and the `twdebug` script handler are not compiled into Release builds (the script and file writes are under `#if DEBUG`; the navigation log line still goes to `os.Logger`).

## Follow-up: iPhone header out of reach with the keyboard open

Status: fix built and checked in the simulator, and confirmed by the owner on the iPhone 14 Pro (portrait): with the keyboard open the header and the files drawer button are visible and tappable.

**What was wrong.** Not scrolling: with the keyboard up the web view's scroll offset stayed (0, 0) and its frame stayed full-screen. The page correctly switched to its keyboard layout (`html.kb kb-tall`) and pinned `.app` to the top edge (`position: fixed; top: var(--vvt, 0px)` in `css/styles.css`), which ignores the top safe area. Without the keyboard `.app` starts 62 pt down on the iPhone 17 simulator (the safe-area inset) and the header is at 78; with it, the header was at 16, under the status bar and Dynamic Island, where it cannot be tapped. Safari does not show this because its viewport already starts below that area. Seen on the iPhone 17 simulator (iOS 27.2); the owner's iPhone 14 Pro report matches the screenshot.

**The fix (iOS only, no web file touched).** `ios/Typewrencher/WebEditorView.swift` injects one style rule at document end: `html.kb .app { top: calc(var(--vvt, 0px) + env(safe-area-inset-top, 0px)); height: calc(var(--vvh, 100%) - env(safe-area-inset-top, 0px)); }`. A comment there says to delete it if `css/styles.css` ever handles the inset.

**Checked in the simulator (iPhone 17, iOS 27.2, portrait).** With the keyboard open the header sits below the status bar, in the same place as without the keyboard, and tapping the files drawer button opened the drawer. The owner also confirmed on the iPhone 14 Pro (portrait): the rhyme panel sits above the keyboard with nothing cut off, a long pasted document keeps the caret line visible and the header in place, and Settings opens and closes with the keyboard open. Not run: landscape and the iPad (the iPad did not show the problem before).

**Decision for the owner: where the rule should live.** The same rule in `css/styles.css` would fix it at the source, but it is a site release, it changes the layout in browsers and installed web apps that I have not tested (in Safari the inset is 0 with the keyboard open, so it should be a no-op there, but that is unverified), and it needs the stamp, tests and a release. Left as a native rule for now. Not changed here: the system's form-accessory bar (up, down and check buttons) above the keyboard still takes about 50 pt; hiding it is possible natively and was not tried.

## Follow-up: Name field on phones

Status: merged (#47). Built, tests pass, checked in the iPhone 17 simulator, and verified on an iPhone by the owner. Not run: the iPad, or in a desktop or Mac window.

**Cause.** Two things. The header left the Name field about 32 pt of a 402 pt screen. And its font was 0.9rem (about 14.4 px): iOS zooms into any field under 16 px when it gets focus, which is the "screen zooms in" the owner saw (in the simulator it also showed as the page shifted left and the editor behind the keyboard).

**Change (web, a site release).** `css/styles.css`: under 480 px the filename gets its own full-width row under the buttons (option 1 of the mockups the owner approved; header order and every button unchanged); on touch screens (`pointer: coarse`) `#fname` is 16 px. The Mac app's window is never narrower than 480 pt, so its header is unchanged. One test added; stamp, `--check` and `node tests/app.test.js` (242 pass) run.

**Seen in the simulator (iPhone 17, iOS 27.2).** Row 1: files, Open, +, Export, Settings. Row 2: "Name" and a field about 370 pt wide. Tapping the field opened the keyboard with no zoom, no sideways shift, and the editor and footer in place.

**Not run, and a known risk.** Narrower than 402 pt, for example Slide Over at about 320 CSS px: row 1 needs about 291 pt of the 288 available, so Settings (and the field row below it) will probably wrap onto another row. That is no longer an overlap, but it is untested and unsightly. Also not run: the iPad, landscape, a desktop browser at 480 to 600 px, and the Mac app.

## Follow-up: Slide Over header (very narrow windows)

Status: built, tests pass (243). Rendered at 320 and 402 CSS px in desktop Chrome through an iframe, with a stand-in for the app bridge. **Not run in iPad Slide Over itself, on the iPad, the iPhone, or the Mac app.**

**Problem.** At about 320 px the buttons row needed about 291 pt of 288 available, so Settings wrapped to another row.

**Change (web, a site release).** Under 360 px the idle Export label is hidden (`#save:not(.flashing) #saveLabel { display: none; }`) and the button keeps a 44 px minimum width and its accessible name ("Export a copy as .txt", or "Save as .txt" in a browser). `js/app.js`: `flash()` adds a `flashing` class to the button while "Done" or "Couldn't save" shows and removes it after 2.5 s, so the feedback stays visible. In a browser the idle ".txt" label is hidden the same way under 360 px, so a very narrow browser window is affected too.

**Seen at 320 px (desktop Chrome, not an iPad).** Files, Open, + on the left, an icon-only Export and Settings on the right, all on one row; the Name row sits below. At 402 px the row is unchanged: "Export" is shown. The dictionary dialog covered the Name row in the capture (the scratch page has no dictionary files).

**Not run, known risk.** "Couldn't save" is longer than "Export", so for 2.5 s at 320 px the label could push Settings to a second row. Not tried. The "Done" label should fit (it is shorter than "Export"); not tried either.

**Owner's first iPad result (Slide Over): not a test of this change.** The owner saw Settings on a second row. The site copy the app bundles (`ios/Typewrencher/site`, not tracked by git) had been built before this change and had neither the new CSS rule nor the `flashing` class, so the iPad ran the old header. It was rebuilt afterwards. "Done" never shows in the iOS app yet because the bridge replies "not available yet" to every export until the files phase wires it up (not run, not failed). **Still to do: run the rebuilt app in Slide Over and check that all five buttons are on one row.** Lesson for next time: run `node tools/build-site.js ios/Typewrencher/site` whenever the branch changes.

**Owner's second iPad result (Slide Over), after rebuilding the site copy.** The idle row passes: all five buttons are on one row. "Couldn't save" then pushed Settings onto its own row above the Name row, and the owner asked for the message to appear in the Name row instead.

**Change (web).** Under 360 px a failed save shows in the Name row, in place of the word "Name" (a decorative `#fnameNote` span; the status line and the button's accessible name still carry the message), and the Export button stays icon-only. "Done" stays on the button. `flash()` takes a third argument (`failed`), sets `flashing` on the button for "Done" only and `flash-error` on `.savebox` for a failure, and clears both after 2.5 s. At 360 px and wider nothing changes: the failure shows on the button as before. Tests: 244 pass; stamp `--check` current.

**Seen in desktop Chrome through a 320 px and a 402 px iframe, with a bridge that rejects exports.** At 320 px: "Couldn't save" in the Name row, buttons row on one line with an icon-only Export. At 402 px: "Couldn't save" on the button, Name row unchanged. **Owner confirmed on the iPad in Slide Over: pass** ("Couldn't save" in the Name row, Settings stays on the top row). In the iOS app every export fails until the files phase, so the failure message is what Slide Over will show.

## Follow-up: the caret after the files drawer closes (1.13)

Status: built, tests pass (245), seen on the iPhone 17 simulator, and confirmed by the owner on an iPhone (pass). **Not run on the iPad or the Mac app.**

**Problem (owner, iPhone).** Tapping the files drawer button took focus off the text, and closing the drawer did not give it back: the owner had to tap the text to bring the keyboard back.

**Change (web, a site release).** `js/app.js`: when the files drawer button closes the drawer with a finger or the mouse, `ed.focus()` puts the caret back in the text (the keyboard comes back on an iPhone or iPad). Opening it does not touch focus. A click from the keyboard (event `detail` 0, Space or Enter) keeps focus on the button, so a keyboard user does not lose their place. **The Mac app changes too:** a mouse click that closes the drawer now returns the caret to the text there as well; the Mac app was not run. Closing the drawer another way (Reset to defaults) is unchanged. One test added.

**Seen on the iPhone 17 simulator (iOS 27.2, real taps).** With the drawer open and no keyboard, tapping the drawer button closed it, and the keyboard came back with the caret in the text (the hierarchy shows the text view "Keyboard Focused").

## Follow-up: iPhone locked to portrait

Status: built; seen in the iPhone 17 simulator only. **Not run on the iPhone 14 Pro.** iPad unchanged.

The owner decided that landscape leaves too little room on an iPhone with the keyboard open, so the iPhone app runs in portrait only. `INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone` is now `UIInterfaceOrientationPortrait`; the iPad keeps all four orientations (read from the built `Info.plist` with `plutil -p`). In the simulator, turning the device to landscape left the app's UI orientation at Portrait. Not done: landscape on an iPhone with an external keyboard, which a plain build setting cannot express (the owner decided to wait on that). The earlier "iPhone landscape for Lock Rhymes height" check is no longer needed.

## Task: iOS phase 2, files (2a: the app's Documents folder)

Status: decided by the owner on 2026-11-23; nothing built yet. Phase 1 passed the gate (the web view stays; see Results above). Browsers and the Mac app must not change.

Decisions already made (do not reopen): documents in 2a live in the app's own Documents folder, visible in the Files app, so no picker is needed to start; files are deleted and moved in the Files app, so **no trash button on iOS**; export uses the system share sheet (the one accepted exit); no iCloud claims; free Apple account, no TestFlight; bundle identifier `io.github.wfclifford.Typewrencher.ios`; the iPhone is portrait only; one window.

How the work is sliced:
- **2a (this task):** reopen the last file at launch, autosave a moment after typing stops, New (`untitled.txt`, `untitled 2.txt`, ...), rename, the files drawer for the Documents folder, opening a file from that drawer, and export through the share sheet.
- **2b (later):** a chosen documents folder through the document picker, kept as a security-scoped bookmark, and Open for a single `.txt` elsewhere.
- **2c (later):** reload when a file changes from outside (file coordination, a refresh when the app returns to the foreground), and what happens with iCloud files that are not downloaded. No claims until run.

Build for 2a: the native side of bridge protocol 1 in `ios/Typewrencher/` (Swift, no dependencies, protocol unchanged): `ready` (reopen the last document or start `untitled.txt`, then `setDocument` and `setFiles`), `textChanged` (autosave), `new`, `rename` (refuse a taken name, send the old name back), `files` and `openFile` (list the Documents folder's `.txt` files, newest first, and switch), `export` (share sheet, reply when finished or cancelled), `notify` for inline messages. `open`, `grantFolder` and `trash` stay stubs in 2a. Read and write plain UTF-8; a file that is not UTF-8 is reported inline, never overwritten. Save on leaving the foreground. Use `mac/Typewrencher/EditorSession.swift` as the reference for behavior, not as code to copy blindly (AppKit parts do not apply).

Web changes (separate pull request, listed here so they are not forgotten; each is a site release with the stamp, tests and the Mac recheck): hide the per-row trash button on iOS (the page needs a capability or flag from the host); wording that assumes the Mac ("Allow access", Finder); check that "Done" shows after a share-sheet export. Do not touch js/, css/, index.html, sw.js or tools/ in the native pull request.

Run these checks (simulator where possible; the owner runs the device ones and sends results back):
2a.1 A new launch opens an empty `untitled.txt` that exists in the app's Documents folder and shows in the Files app.
2a.2 Typing saves to that file within about a second; force-quit right after typing and relaunch: the text is there.
2a.3 Switching documents (drawer) after typing keeps the typing in the file you left, and undo does not bring back the other file's text (the check phase 1 could not run).
2a.4 New creates `untitled 2.txt` and an empty untitled file left behind is cleaned up or kept as decided in Results.
2a.5 Rename: a free name renames the file; a taken name is refused inline and the field goes back; name characters the page already strips stay stripped.
2a.6 A file added or deleted in the Files app shows in the drawer after the app returns to the foreground (device).
2a.7 Export opens the share sheet; sharing shows "Done" on the button, cancelling closes it quietly.
2a.8 A non-UTF-8 file opens with an inline message and is not overwritten.
2a.9 No alerts, sheets or toasts interrupt writing; the share sheet is the only exit.

Results to record, each as pass, fail or not run, with the exact error or what was seen, the device and iOS version; the Xcode version; any web change that would be needed, listed but not made.

Results: see "2a progress" below (filled in as each step is built).

### 2a progress (branch `ios-phase-2a`, in order)

**Step 1: reopen the last document at launch, or start `untitled.txt` (built; simulator, and the Files-app check on the iPhone 14 Pro).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. Otherwise not run on the iPhone or the iPad.

Built: `DocumentStore.swift` (the app's Documents folder; remembers only the last file's name, because the container path changes between installs; creates `untitled.txt`, `untitled 2.txt`, ...), `TextFile.swift` (UTF-8 read), `EditorSession.swift` (on the bridge's `ready`: reopen the last document or start a new one, then `setDocument`; a second `ready` after a page reload shows the open document again; inline `notify` messages; clears the web view's undo history when a new file is shown). `Info.plist` gains `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` so the Documents folder shows in the Files app. All other bridge messages are still stubs.

Seen in the simulator (read from the app's container with `simctl`, and from screenshots):
- 2a.1: a fresh install's first launch created an empty `untitled.txt` in the app's Documents folder. **Confirmed on the iPhone 14 Pro by the owner: the Files app shows a Typewrencher folder with `untitled.txt` in it (pass).** The owner did not say whether the Name field read "untitled" there; not recorded. Not run on the iPad.
- A relaunch reused `untitled.txt` (no `untitled 2.txt`).
- A file containing "Roses are red,\nviolets are blue" was shown after relaunch, with the name "untitled" and 2 lines, 6 words, 9 syllables.
- 2a.8: a file with invalid UTF-8 bytes was left byte-for-byte unchanged, the app opened a new `untitled N.txt`, and the page showed "Typewrencher couldn't open untitled 3: it is not UTF-8 text." under the counts. (A first version overwrote that reason with a second "couldn't reopen" message; fixed.)

Known, not fixed yet: every launch where the last file cannot be read leaves another empty `untitled N.txt` behind, and an empty untitled file is never cleaned up. That belongs to 2a.4 (decide in Results whether an empty untitled file is removed when left, as on the Mac, or kept).

**Step 3: the files drawer, switching, New and rename (built; simulator, and the checks below on the iPhone 14 Pro).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. **Not run on the iPad.** The bridge now also handles `new`, `files`, `openFile` and `rename`; `open`, `grantFolder`, `trash`, `close` and `export` are still stubs.

Decision (owner, 2026-11-24): an empty `untitled` file that this app created is deleted when the person leaves it (iOS has no Trash for app files; nothing is lost; no other file is ever removed). A renamed file is kept even when empty.

Built: `DocumentStore` lists the `.txt` files (newest first), tracks which untitled files the app created (names only), removes an empty one when left, and cleans names like the Mac. `EditorSession` queues operations one at a time, asks the page for its current text before a switch, saves the file being left, treats typing that arrives late (after the switch, before the page shows the new file) as belonging to the file just left, clears the web view's undo history when a new file is shown, sends `setFiles` while the drawer is open (title "Typewrencher", path "On My iPhone/Typewrencher" or "On My iPad/Typewrencher", as the Files app shows it), refuses a taken name inline and sends the old name back, and refreshes the list when the app returns to the foreground.

Seen in the simulator (files read from the app's container):
- 2a.1/drawer: a container with `Alpha.txt`, `Bravo.txt` and the app's `untitled.txt` listed all three with times and a "3 files" count, `untitled` marked current.
- 2a.3, switching: typing " plus typed" in Alpha left "alpha text plus typed" in `Alpha.txt`; switching to Bravo showed "bravo text" with the name "Bravo", and neither file was changed by the switch.
- 2a.4: pressing `+` created `untitled.txt`; pressing it again without typing did not create another. Switching away from an empty `untitled` deleted it (the drawer then listed "2 files").
- 2a.5: renaming `untitled` to "X" produced `X.txt` (kept although empty). Renaming it to the taken name "Bravo" changed nothing on disk and the field went back to "X"; two `rename` messages reached the app (the second was refused). **The inline text "A file named Bravo already exists." was not seen**: the screenshot was taken after the keyboard and accessory bar covered the notice line, so only the unchanged files and the restored field are claimed.

**Not run, step 3:** undo after switching (2a.3 needs a shake or a hardware keyboard on a device; the code clears the undo history on every switch); typing during the 0.3 s before a switch (the late-typing path cannot be raced with these tools); a file added or deleted in the Files app showing after the app returns to the foreground (2a.6, device); the iPad.

**Findings (web changes, none made here).**
1. **The first tap on a drawer row does nothing on iOS; the second tap opens the file.** The page's CSS reveals the trash button and hides the date on `li:hover` (css/styles.css, `.files-list li:hover .file-trash` and `.file-when`). On a touch screen iOS treats the first tap as the "hover" and only the second as the click. Seen in the simulator: the first tap sent no `openFile`; the second did. A fix is `@media (hover: hover)` around those rules, or never revealing content on hover on touch. This will make the drawer feel broken on the iPhone, so it should go in the first web pull request.
2. The accessibility tree lists a "Move <name> to the Trash" button for every row, including on iOS. The planned web change (no trash button on iOS) covers it.

**Owner's results on the iPhone 14 Pro for step 3: "all steps pass as described" (pass).** That covers: opening a file from the drawer (it took two taps, as finding 1 describes, so the two-tap behavior is confirmed on the device), switching between two files, undo after typing and switching (the other file's text did not come back; **2a.3 pass**), and a file added or deleted in the Files app showing in the drawer after returning to the app (**2a.6 pass**). The owner's wording did not itemize each step; recorded as a summary.

**Web follow-ups found in step 3, tracked in pull request #55 (not part of this branch until it merges).** Both were confirmed by the owner on the iPhone 14 Pro after the fixes were bundled into the app: (1) a drawer row now opens on a single tap (the `:hover` styles apply only under `@media (hover: hover)`); (2) switching files quickly no longer magnifies the page (`touch-action: manipulation` on the drawer panel and its list; the zoom was not reproduced in the simulator, only seen and then cleared on the device). Still open for the next web pull request: hide the trash button on iOS (needs a way for the page to know it runs on iOS), Mac-only wording.

**Step 4: export through the share sheet (built; simulator only).** Xcode 27.2, iPhone 17 and iPad Pro 11-inch (M5) simulators, iOS 27.2, Debug build. **Not run on the iPhone 14 Pro or the iPad Pro 10.5-inch.** `export` is no longer a stub: `EditorSession.export` writes the page's text to a temporary `<name>.txt` and hands it to the system share sheet (`UIActivityViewController`; on an iPad a popover anchored under the Export button). The reply is `ok` after sharing or copying, `declined` if the sheet was closed without choosing (the page then says nothing), or `failed: <reason>`. The temporary file is removed when the sheet finishes. `open`, `grantFolder`, `trash` and `close` are still stubs.

Seen in the simulator:
- 2a.7, iPhone 17: Export opened the share sheet showing "Alpha, Text Document, 21 bytes" (the size of "alpha text plus typed") with Copy and Save to Files. Closing it by tapping outside replied `declined`, left the button reading "Export" and showed no message. Exporting again and choosing Copy replied `ok` and the button read **Done**. The temporary file was gone after each of those two exports. (A folder left in tmp from my first attempt, 10:19, is from killing the app while the sheet was open; iOS clears tmp.)
- 2a.7, iPad Pro 11-inch: Export opened a popover anchored under the Export button showing "untitled, Text Document, 19 bytes" (the size of "hello from the iPad"); no crash. Not completed or cancelled there.
- Not run: "Save to Files" itself; the "failed" reply; sharing an empty document (the page disables Export then); a Mac or iPhone device.

2a.9 (nothing interrupts writing): in everything above, the share sheet was the only thing that appeared on top of the page; no alert, sheet or toast came from the app. Simulator only; the owner should look for any other pop-up on a device.

**Unexplained, to watch for (iPad simulator, once).** In my first iPad-simulator run the Debug trace showed `ready` twice before the first `textChanged`, and of "hello from the iPad" only "e iPad" ended up in the page and the file (a page that loads twice shows the native copy of the text again, which would lose what was typed before the second load). I could not make it happen again: in three further launches there was one `makeUIView` and one `ready`, and typing was saved whole. The first run had no timestamps. The Debug trace now timestamps every line and logs `makeUIView`, so the next occurrence can be explained. Possible causes not ruled out: SwiftUI rebuilding the web view; my simulated taps and typing landing on the wrong element (the loss in that run could also be input that went to the Settings button). If the owner ever sees typed text vanish on the iPad, this is the first thing to look at.

**Owner's results for step 4 on the iPhone 14 Pro and the iPad Pro 10.5-inch: "all tests pass".** The owner was asked to export with Save to Files and open the saved file (text and name right), to close the sheet without choosing (nothing appears), and to repeat on the iPad (popover looks right). The answer did not itemize each one, so it is recorded as the owner's summary. No typed text vanished on the iPad (the unexplained double load above was not seen again).

Not run: the failed-export path; sharing to something other than Files; the Mac app (unaffected).

**Phase 2a status.** Steps 1 to 4 are built and have passed on the iPhone and the iPad. Checks: 2a.1 pass, 2a.2 pass, 2a.3 pass, 2a.4 simulator pass (New, blank page, empty untitled removed), 2a.5 pass (rename, taken name refused; the inline text of the refusal not seen), 2a.6 pass, 2a.7 pass, 2a.8 pass (simulator), 2a.9 pass (simulator, and the owner saw nothing else). Still to do for the whole of phase 1 and 2: the web change to hide the trash button on iOS and fix Mac-only wording; 2b (a chosen folder) and 2c (outside changes, iCloud).

**Step 2: autosave (built; simulator, and the force-quit check on the iPhone 14 Pro).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. **Otherwise not run on the iPhone; not run on the iPad.**

Built: `EditorSession.textChanged` writes the page's text 0.4 s after the page's own 300 ms debounce (`saveNow`, atomic write through `TextFile.write`); `saveBeforeLeaving` (called when the SwiftUI scene phase leaves active) saves what the native side knows, then asks the page for its current text (`TypewrencherHost.getText()`) and saves that, inside a background task. A file moved or deleted outside the app is not recreated; a failed save shows a sticky inline message and keeps the text on the page.

Seen in the simulator (file contents read from the app's container):
- 2a.2, typing: typing "Roses are red" left exactly that in `untitled.txt` about a second later (the trace shows a `textChanged` message).
- 2a.2, leaving the foreground: with the save delay stretched to 300 s in a scratch build (not committed; the committed delay is 0.4 s), the file still had the old text before pressing Home and the new text right after, so the save on leaving works. **The app-switcher swipe (a real force-quit) passed on the iPhone 14 Pro, by the owner**: typed a line, swiped the app away within a second, relaunched from the Home Screen, and the line was there and in the file in the Files app. (I could not swipe with the tools available; Home is the same scene-phase change that comes first.) A 30 s delay run was inconclusive (the timer could have fired first) and is not counted.
- File deleted under the running app, then typing: the file was not recreated, and the page showed "Typewrencher couldn't save untitled: it was moved or deleted outside Typewrencher. Your text is still on the page; Export keeps a copy." The text stayed on the page.

Not run: a failure that is not "deleted" (a full disk, a read-only file); a very large document; the iPad. Switching documents, New, rename, the drawer and export are still to come (steps 3 and 4).

## Follow-up: no trash button on iOS

Status: built, tests pass (249), checked in the iPhone 17 simulator, and confirmed by the owner on the iPhone 14 Pro and on the Mac. **Not run: the iPad with a trackpad or mouse** (the owner has none to try).

Decision (owner, from the start of the iOS work): no trash button on iOS; files are deleted in the Files app. How the page learns this: an optional field on `setFiles`, `trash`. `false` hides the per-row trash buttons; left out or `true`, they show. This is additive to bridge protocol 1: documented in the `js/host.js` header; the iOS `EditorSession.sendFiles` sends `trash: false`; the Mac sends nothing, so it is unchanged (its Swift handler needed no edit). Tests cover both cases. The date that the trash button replaces on hover or focus is now hidden only for rows that have a trash button.

Seen in the simulator (accessibility tree of the open drawer): 3 rows (X, Alpha, Bravo) and 0 "Move … to the Trash" buttons; before this change each row had one.

Found but not changed: the root element gets `data-host="mac"` for any host, including the iOS app (it only selects which icons Open and Export show), so the name is misleading on iOS. Renaming it would touch CSS, JS and tests; left alone.

**Owner's results.** iPhone 14 Pro: no row has a trash button, every row still shows its date (including the one tapped), and a single tap still opens a file (pass). Mac app (site copy built from this branch): the trash icon still replaces the date on hover, and a click still arms it as "Delete?" (pass; not confirmed on a file). iPad hover with a trackpad or mouse (a row must keep its date when hovered, since it has no trash button): **not run**, no pointer device available; the CSS rule that scopes the date-hiding to rows with a trash button is covered by a test but was not seen with a real hover.

## Task: iOS phase 2b, a chosen documents folder

Status: decided by the owner on 2026-11-24 (how the folder is chosen); the rest of the scope below is my proposal for the owner to correct before any code is written. Nothing built yet. Browsers and the Mac app must not change.

Decisions already made (do not reopen): the app's own Documents folder stays the default; a chosen folder is optional; the folder is chosen with a **"Choose folder" button at the bottom of the files drawer, shown only in the iOS app** (it opens the system folder picker); no trash button on iOS; export through the share sheet; no iCloud claims; free Apple account.

Scope (2b):
- **Choose a folder.** A new additive bridge message `chooseFolder` (page to native) opens the system folder picker (`UIDocumentPickerViewController`, folders). The chosen folder is remembered as a security-scoped bookmark, listed in the drawer (title: the folder's name; the path line says where it is in the Files app as far as iOS reveals it), and becomes where New creates files. Cancelling the picker changes nothing and says nothing.
- **Switching folders.** The current document is saved first; the app then opens the newest `.txt` in the new folder, or creates `untitled.txt` there. Files in the folder left behind are not touched. Picking the app's own folder (On My iPhone, Typewrencher) in the picker goes back to it.
- **Remembering.** The last document is remembered with the folder it was in, so a relaunch reopens it in the right folder. If the chosen folder can no longer be reached (deleted, moved, an unavailable drive, a stale bookmark), the app falls back to its own folder with an inline message and never loses text.
- **Open.** The page's Open button (message `open`, a stub today) shows the system file picker for one `.txt` (opened in place). A file outside the documents folder opens and saves where it is: atomic write first, and if iOS refuses (access to the file only, not its folder), an in-place write, as the Mac does; a failure is shown inline and the text stays on the page. The drawer keeps listing the documents folder; the open file simply has no highlighted row.
- **Web change (a separate pull request, a site release):** `setFiles` gets an optional `chooseFolder: true` (the iOS app sends it; the Mac and browsers do not), which draws a "Choose folder" button at the bottom of the drawer; clicking it posts `{ type: 'chooseFolder' }`. Documented in the `js/host.js` header, tested, and the Mac rechecked (no button there). Do not touch js/, css/, index.html, sw.js or tools/ in the native pull request.
- **Not in 2b:** reloading when a file changes from outside, coordinated reads and writes (`NSFileCoordinator`), and iCloud files that are not downloaded: that is 2c. No claim about iCloud Drive is made until 2c has run; picking a folder that happens to be in iCloud Drive is allowed, and anything odd that is seen is recorded, not fixed here.

Assumptions, **confirmed by the owner on 2026-11-24**:
1. After choosing a folder, files left in the app folder stay there and are not listed. They are reachable in the Files app, with Open, or by choosing the app's own folder again. Two details go with this: after a folder switch the app shows an inline notice (about 12 seconds, no web change): "Now using <folder>. Your earlier documents are still in the Typewrencher folder in Files."; and the app's memory of which empty `untitled` files it created becomes **per folder** (today it is by name only, which is safe with one folder but could delete an empty `untitled.txt` the person made themselves in the chosen folder).
2. One chosen folder at a time, plus the app folder as the default. There is no recent-folders list; to change folder, choose again (the picker usually reopens where it was). A recent-folders list can be a later follow-up. Open has no recents either.
3. Bookmarks are created without `.withSecurityScope` (iOS), and access is started when the folder is chosen or reopened and kept for as long as it is the documents folder.

Build order (owner, 2026-11-24): (1) the web change for the button, as its own pull request; (2) the folder picker and bookmark storage; (3) switching, remembering and the fallback; (4) Open.

Run these checks (simulator where possible; the owner runs the device ones and sends results back):
2b.1 The "Choose folder" button shows in the iOS app's drawer and does not show on the Mac or in a browser (Mac recheck).
2b.2 Choosing a folder in the picker lists its `.txt` files in the drawer, with the folder's name as the title.
2b.3 New creates `untitled.txt` in the chosen folder (seen in the Files app), and an empty untitled file is removed when left, as in 2a.
2b.4 Typing saves into a file in the chosen folder (read it in the Files app); force-quit and relaunch from the Home Screen reopens the last file from the chosen folder (the bookmark survives).
2b.5 Switching files and renaming inside the chosen folder work as in 2a (a taken name is refused inline).
2b.6 Removing or moving the chosen folder in the Files app, then relaunching: the app falls back to its own folder with an inline message, no crash, no lost text.
2b.7 Open picks a single `.txt` from elsewhere; it opens, edits save in place or fail inline, never silently.
2b.8 Cancelling either picker changes nothing and shows nothing.
2b.9 Choosing the app's own folder in the picker goes back to the app folder; its files are all still there. After any folder switch the inline notice names the new folder and says where the earlier documents are.
2b.9b An empty `untitled.txt` that the person made themselves in the chosen folder is never deleted by the app (untitled files are remembered per folder).
2b.10 No alert, sheet or toast other than the two system pickers and the share sheet.
2b.11 A folder chosen in iCloud Drive: record what is seen (no claims).

Results to record, each as pass, fail or not run, with the exact error or what was seen, the device and iOS version; the Xcode version; any web change that would be needed, listed but not made.

Results: see "2b progress" below (filled in as each step is built).

### 2b progress (branch `ios-phase-2b`, in order)

**Web step (done, merged as #61, live as release 0.1.34):** `setFiles` gets an optional `chooseFolder: true` that draws the "Choose folder" button at the bottom of the drawer; the click posts `{ type: 'chooseFolder' }`.

**Step 2: the folder picker and bookmark storage (built; simulator, and confirmed by the owner on the iPhone 14 Pro).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. **Not run on the iPad.**

Built: `ChosenFolder.swift` (the remembered folder as a bookmark; `FolderPicker`, the system folder picker); `DocumentStore` now keys everything it remembers by folder (the last document per folder, and the untitled files the app created as "folder|name", reading the old bare names as the app folder); `EditorSession` resolves the chosen folder at launch (falls back to the app's own folder if it cannot be reached, with no message yet), handles `chooseFolder`, sends `chooseFolder: true` and `trash: false`, highlights the open file only if it is in the listed folder, renames inside the file's own folder, and keeps access to a folder started for as long as it is the documents folder or holds the open file. `chooseFolder` is a new bridge message handled in the iOS app; `open`, `grantFolder`, `trash` and `close` are still stubs.

Seen in the simulator (test folders `Lyrics` with `Song A`, `Song B` and an empty `untitled.txt` made "by the person", and `Poems`, put in the simulator's On My iPhone storage):
- 2b.1 (iOS half): the drawer shows a "Choose folder" button under the path line. Not run: that the Mac and browsers show none (the tests say so; the Mac recheck is still to do).
- 2b.2: Choose folder opened the real system folder picker; choosing Lyrics listed its 3 files with the title "Lyrics" and the path line "Lyrics" (iOS does not say where an arbitrary folder is, so only the app folder ("On My iPhone/Typewrencher") and iCloud Drive folders get a location; the iCloud branch was **not run**). No row was highlighted, since the open document was still in the app folder.
- 2b.3: with a non-blank document open, `+` created `untitled 2.txt` **in Lyrics** (taking a free name next to the person's `untitled.txt`); switching to Song A then deleted the empty `untitled 2.txt` and **left the person's empty `untitled.txt` alone** (2b.9b, seen once).
- 2b.4: after a relaunch the app reopened in Lyrics with Song A open (the bookmark survived and the last document is remembered per folder). Typing into Song A saved into the file in Lyrics (`Song A.txt` read back correct). A second launch after choosing the On My iPhone root restored that folder too.
- 2b.8: closing the picker by swiping it down changed nothing and showed nothing, and the Choose folder button worked again afterwards.

**Found and fixed in this step:** when a different folder was chosen, the first version stopped access to the folder the open document was in. The simulator does not enforce that, so the save still worked there; on a device a save could have been refused while the document stayed open. Access is now kept for the documents folder and for the folder of the open file, and ended when neither needs it.

**Not run, step 2:**
- **(Resolved on the device, see below.) 2b.9: choosing the app's own folder (Typewrencher) in the picker to go back to the default.** In the simulator the picker would not open the Typewrencher folder (tap and double tap did nothing). I do not know whether that is the simulator or how iOS behaves. **If it cannot be picked on the device, there is no way back to the default folder and a "Use app folder" choice is needed.** The code path (`sameFolder` against the app's Documents folder) exists but has not been run.
- That a device enforces the folder access the way the code assumes (the simulator does not): this is the main reason for the iPhone test of 2b.4.
- 2b.5 (rename and switching inside a chosen folder), 2b.6 (the chosen folder removed), 2b.7 (Open), 2b.10, 2b.11 (iCloud Drive).
- The inline notice after a folder switch, and switching to a document in the new folder (step 3): after choosing a folder the open document stays where it is and the drawer lists the new folder.

**Owner's results for step 2 on the iPhone 14 Pro: "1, 2, 3, 4, and 5 all pass".** The owner was asked to: build the site and run the app (1); open the drawer and tap Choose folder, picking a folder in the Files app (2); check the drawer lists that folder's `.txt` files and that `+` creates a file in it, confirmed in the Files app (3); type into a file in that folder, force-quit, relaunch from the Home Screen, and check the text saved and the app reopens in that folder (4); and choose Choose folder again and try picking the app's own Typewrencher folder under On My iPhone (5). All five passed; the answer did not itemize them or say which folder was used. **That settles the open risk: the app's own folder can be picked on the device, so there is a way back to the default and no "Use app folder" choice is needed** (the simulator's picker simply would not open it). It also means the device does allow saving into a chosen folder and reopening it after a force-quit; the owner's word is the only record of it, I did not see it.

**Step 3: switching to a document in the new folder, the notice, and the fallback (built; simulator only).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. **Not run on the iPhone 14 Pro or the iPad.**

Built: choosing a folder is now an operation in the same queue as switching files (`EditorSession.folderChosen` and `switchStore`). The open document is saved first (if that fails, nothing changes and the picked folder's access is ended); then the app opens, in the new folder, **the document last open there, else the newest `.txt`, else a new `untitled.txt`** (a change from the plan's "newest": coming back to a folder reopens what was open in it; unreadable files are skipped, up to five); the empty untitled file left behind is removed if the app made it; and the page shows the notice. At launch, a remembered folder that cannot be reached means the app uses its own folder and says so (the bookmark and the folder's name are kept, so a drive or folder that comes back works again).

Seen in the simulator:
- Notice and switch: from the On My iPhone root, choosing `Poems` saved the open document, opened `Roses` (the Name field read "Roses", the drawer listed Poems with 1 file and Roses highlighted), and showed "Now using “Poems”. Your earlier documents are still in “File Provider Storage”." The empty `untitled.txt` the app had left in the old folder was deleted. (Not seen: the other two wordings, from the app folder to a chosen one and back.)
- Fallback: with the chosen folder deleted, a relaunch opened the app's own folder (the drawer said "Typewrencher", "On My iPhone/Typewrencher"), the document typed there earlier was intact, and the page said "Typewrencher couldn’t reach “Poems”, so it is using its own folder. Choose the folder again to go back."
- **Moving is not losing:** with the folder merely moved (out of storage to another place), the bookmark followed it: the app opened it under its new name and location. A folder moved with the Files app may behave the same on a device; not tried there.

Not run, step 3: choosing the same folder again; a save that fails during the switch (the switch should then not happen); the app-folder and chosen-to-chosen wordings of the notice; the fallback and the folder coming back later; iCloud Drive; the iPad.

**Owner's results for step 3 on the iPhone 14 Pro.** Steps 1 and 2 (choosing a folder that has files: the app opens a document and shows the notice; choosing another and then the first again: it reopens what was open there) **passed**. Step 3 (delete the chosen folder, relaunch) found two problems: (a) with the folder in **Recently Deleted**, the files still showed and worked, so the app kept saving into a folder the person had deleted (iOS empties Recently Deleted after about 30 days); (b) with the folder **deleted for good**, the drawer still showed the folder's name, with no files, instead of the fallback. Choosing a folder again went back to the original Typewrencher folder correctly. It was not recorded whether the app was force-quit before returning to it; my launch-time fallback only ran on a fresh launch.

**Fix (built; simulator only): the documents folder is checked whenever the app returns to the foreground, and Recently Deleted counts as gone.** `ChosenFolder.isReachable` requires the folder to exist, be listable, and not have ".Trash" or "Recently Deleted" in its path; it is used at launch and on each return to the foreground (`EditorSession.leaveFolderIfLost`). If the folder is lost the app moves to its own folder (queued like any other file operation), keeps the bookmark, and says "“<folder>” was deleted or can’t be reached, so Typewrencher is using its own folder. Choose a folder again to go back." **Unsaved text is never dropped:** if the open document had text that could not be saved (its file went with the folder), the text is first written as a new file in the app folder (`Roses.txt`, or `Roses 2.txt` if taken), and the notice says so; if even that fails the app stays put and says so, keeping the text on the page.

Seen in the simulator: (1) the app resumed from the background (a single page load, not a relaunch) after its chosen folder was deleted: it showed the app folder and the notice. (2) The chosen folder moved into a folder named `.Trash` while the app was away: same result. (3) Unsaved text: typing into a document, deleting the folder under the running app, typing more (the page showed "Typewrencher couldn’t save Roses: it was moved or deleted outside Typewrencher. Your text is still on the page; Export keeps a copy."), leaving and returning: `Roses.txt` appeared in the app folder holding "roses are red first second", including the text that could not be saved, and the notice named the copy.

**Not known:** how a real iPhone names Recently Deleted for a folder in On My iPhone or iCloud Drive. I used the names the simulator and iOS are believed to use; if a device names it differently the app keeps working in the deleted folder as it did before. That is what the next device test is for. Not run: the iPad; an unplugged external drive; iCloud Drive; the fallback when the folder comes back later (the bookmark is kept, so it works again after the next launch).

**Step 4: Open for a single `.txt` from anywhere (built; simulator only).** Xcode 27.2, iPhone 17 simulator, iOS 27.2, Debug build. **Not run on the iPhone 14 Pro or the iPad.** The page already posted `open`; the iOS app now answers it (`EditorSession.chooseFile`, `FilePicker` in `ChosenFolder.swift`): the system file picker for one plain-text file, opened in place (not copied), queued like any other switch. The file's own access is kept while it is the open file and ended when another file is opened. `TextFile.write` still swaps a new file into place, and if iOS refuses because only the file (not its folder) is accessible it rewrites the file in place, as the Mac does. Bridge protocol 1 unchanged; `grantFolder`, `trash` and `close` are still stubs.

Seen in the simulator: the Open button showed the system file picker (it reopened where it was last used); going to Lyrics and picking `Song B` opened it (the Name field read "Song B", 1 line, 2 words); the drawer kept listing the documents folder, with no row highlighted; typing into it saved into `Song B.txt` in Lyrics ("chorus line edited via Open").

Not run, step 4 (2b.7): backing out of the file picker; the in-place write fallback and iOS enforcing access to the file alone (the simulator enforces neither, so on a device a save into a file whose folder is not accessible is the case to watch: it must show the inline failure and keep the text on the page); opening the same file twice; a file that is not UTF-8 (opening should report it inline, as in 2a); the iPad. **Known limit:** a file opened this way is not reopened at the next launch (only the documents folder's last document is remembered); the app comes back to the documents folder.

**Owner's results on the iPhone 14 Pro for the lost-folder fix and Open (device).** A (delete the chosen folder while the app is in the background, return by tapping the icon, no force-quit): steps 1 to 4 pass. B (leave the folder in Recently Deleted, do not empty it): passes, so the fallback works for a folder in Recently Deleted on a device. D (Open a `.txt` from anywhere, edit it, back out of the picker): passes. **C (unsaved text) did not do what was promised:** the app returned to the Typewrencher folder with the first file selected, but the text typed after the folder was deleted stayed in the deleted folder in Recently Deleted and was not kept as a file in the Typewrencher folder. *My reading, not confirmed by the owner:* on a device the open file's URL follows the file into Recently Deleted, so the saves after the deletion succeeded (into the trash), the app saw nothing unsaved, and the rescue copy was never made. (In the simulator the URL does not follow, the save failed, and the rescue worked, which is why the simulator test passed.)

**Fix (built; simulator only for normal saving): the app never writes into Recently Deleted.** `ChosenFolder.isInTrash(url)` (a ".Trash" or "Recently Deleted" component in the path) is checked in `saveNow` and in the late write to the file just left; such a file is treated as moved or deleted: the text stays unsaved on the page, the sticky message appears, and when the app returns to the foreground the existing rescue keeps the text as a new file in the app's folder. Seen in the simulator: normal typing still saves ("typed in the app folder guard check" in the file). **The trash guard itself was not seen working**: the simulator's URLs do not follow a moved folder, so the situation could not be reproduced there; it needs the owner's retest of C on the device. If the device's path for Recently Deleted does not contain ".Trash" or "Recently Deleted" the guard will not trigger, and B passing only shows the folder check recognized it (which uses the same names, so they are probably right).

**Owner's retest of C on the iPhone 14 Pro: pass.** After the trash guard, text typed after the chosen folder was deleted is kept as a file in the Typewrencher folder when the app comes back (the owner's word; I did not see it, and the owner's answer did not say whether anything newer landed in Recently Deleted). That closes the lost-folder gap from the previous results. So on the iPhone, 2b.1 to 2b.8 and 2b.9, 2b.9b have been reported as passing across the device rounds above. Not run on any device: the iPad (every 2b check), iCloud Drive folders (2b.11, nothing is claimed), a Mac recheck that the "Choose folder" button never shows on the Mac or in a browser (2b.1, Mac half), and choosing the same folder twice, a save failing during a folder switch, and opening the same file twice.

**Owner's results: Mac and iPad.** Mac (site copy built from this branch's web files): the files drawer shows no "Choose folder" button, and the trash icon, date, path line and count look as before (pass; 2b.1, Mac half). iPad (Choose folder with the "Now using…" notice; typing, force-quit and relaunch reopening in that folder; Open from elsewhere, editing and saving): all three pass. The owner's answer did not name the iPad model, and the iPad runs iPadOS 17.7.11 (the iPad Pro 10.5-inch used earlier); not itemized beyond "1, 2 and 3 pass".

**Phase 2b status.** All four steps and the two fixes found on the way are built and have passed on the iPhone 14 Pro and the iPad, with the Mac recheck. Checks: 2b.1 pass (iPhone, iPad, Mac), 2b.2 pass, 2b.3 pass, 2b.4 pass, 2b.5 passed in the simulator and was exercised on devices (switching and renaming inside a chosen folder were not separately itemized by the owner), 2b.6 pass (deleted and Recently Deleted), 2b.7 pass, 2b.8 pass (the folder picker in the simulator; the file picker's cancel was not itemized), 2b.9 pass, 2b.9b pass in the simulator, 2b.10 nothing but the system pickers and the share sheet was seen, 2b.11 not run. **Not run or not claimed:** iCloud Drive folders; choosing the same folder twice; a save failing during a folder switch; opening the same file twice; a file opened with Open is not reopened at the next launch (a known limit); the unplugged-drive case.

**Owner's report on iCloud Drive folders (2b.11): "iCloud Drive folders work fine."** Recorded as given: the owner chose folders in iCloud Drive and they worked. The answer did not say on which device, what was tried (choosing, listing, creating, editing, relaunching, deleting), or what the drawer's path line showed (the "iCloud Drive/…" label in `DocumentStore.displayPath` is a guess from the path and has not been seen by me). **No claim is made about iCloud beyond that:** syncing between devices, files that are not downloaded yet, changes made on another device, and coordinated reads and writes are all phase 2c and have not been looked at.

## Task: iOS phase 2c, changes from outside and iCloud files

Status: a proposal for the owner to correct before any code is written. Nothing built yet. Browsers and the Mac app must not change. Phase 2b is merged and confirmed on the iPhone, the iPad and the Mac.

**What the Mac does (the reference):** it watches the open file and ignores the app's own saves; when another app changes the file it reloads it, unless the person has typed since the last save, in which case their text is kept and the notice line says "Typewrencher kept your changes; the file was also changed elsewhere."; a file moved or deleted outside gets a sticky notice. **What the iOS app does today:** nothing watches the open file; reads and writes are plain (uncoordinated) and happen on the main thread; the drawer's list refreshes when the app returns to the foreground, when the drawer opens, and after the app's own operations; a file or folder that is gone is noticed at the next save or the next return to the foreground (2b). The owner reports that folders in iCloud Drive "work fine" (2b.11); nothing beyond that is known about iCloud.

Decisions already made (do not reopen): documents are plain UTF-8 `.txt` files; no alerts, sheets or toasts (feedback is inline, on the notice line); free Apple account; no TestFlight; no claims about iCloud beyond what has been seen.

Scope (2c):
1. **Coordinated reads and writes.** Every read and write of a document, and the listing of a folder, goes through `NSFileCoordinator` (reads without changes, writes as a replacement), so another process, including iCloud, never sees a half-written file and the app never reads one. Saves stay atomic. File access moves **off the main thread**: a coordinated read of an iCloud file that is not on the device waits for the download, and that must never freeze the page. This changes `openNow`, `saveNow` and the listing from synchronous to asynchronous; the one-operation-at-a-time queue stays.
2. **Watching the open file** with an `NSFilePresenter` (added through `NSFileCoordinator`). A change from another app follows the Mac's rule above: reload unless the person typed since the last save; the app's own saves are recognized (the new text equals what was just saved) and ignored; undo history is cleared when the text is replaced. A move or deletion of the open file is treated like a lost folder in 2b (sticky message, nothing written into Recently Deleted, unsaved text kept as a new file in the app's folder).
3. **iCloud files that are not downloaded.** The not-downloaded state is detected with the file's `ubiquitousItemDownloadingStatus`. Opening such a file starts the download and shows "Downloading <name>…" on the notice line, then opens it when it arrives (about 30 seconds at most; typing in the page stays responsive meanwhile). On failure (offline, timeout) the notice says so and the current document stays open and unchanged. Whether such files appear in the drawer at all depends on how iOS lists them: first observe, on a device, what the listing returns for a folder with files that are not downloaded, then decide (recorded in Results before it is built).
4. **Live drawer list (optional).** While the drawer is open and the app is in the foreground, a presenter on the documents folder refreshes the list when files appear, vanish or are renamed outside; the foreground refresh stays the baseline. If notifications do not arrive for a chosen folder (not every provider sends them), the baseline is what it is, and Results say so.
5. **Carry-over from 2b, small:** choosing the same folder twice, a save failing during a folder switch (the switch must not happen), opening the same file twice, and reopening at launch a file opened with Open (needs a bookmark for the file; the app comes back to the documents folder today).

Not in 2c: resolving iCloud conflict versions (`NSFileVersion`; the plan is only to record whether conflict copies appear), any sync-status display, merging text, web changes (the notice line already carries every message), and any Mac change.

Assumptions to confirm (change them in the pull request if wrong):
1. Outside changes follow the Mac's policy exactly (reload unless typed since the last save; otherwise keep the person's text and say so; never merge).
2. No conflict-version UI: if iCloud makes a conflict copy it is just another file in the drawer.
3. Opening a not-downloaded file waits for the download with an inline message and a 30-second limit, rather than failing at once.
4. The live drawer refresh is a nice-to-have, built last, and dropped if it proves unreliable.
5. File access moves off the main thread even for local files, so there is one code path.

**Confirmed by the owner on 2026-11-28: all five assumptions stand as written.** The agreed order was: the delete spike first, then 2c step 1 (coordinated, off-main-thread file access), then 2c watching the open file, then iCloud files that are not downloaded, then the live drawer refresh and the 2b carry-overs. **Update 2026-11-28: the delete spike failed its decision rule, so there is no delete build and the order is just the 2c steps** (see "iOS files drawer, deleting files").

How it can be tested: the simulator has no iCloud account, so everything involving iCloud, and any edit "from another app", needs a device and usually a second device or the Mac editing the same file in iCloud Drive; the owner runs those and sends results back. In the simulator an outside change can be made by editing a file on disk, which exercises the watching, the reload rule and the unsaved-text rule.

Run these checks:
2c.1 A file changed by another app (or edited on disk in the simulator) while it is open with no unsaved typing: the page shows the new text, the caret and scroll do not jump more than the replacement forces, undo does not bring back the old text.
2c.2 The same with unsaved typing: the person's text is kept, the notice says so, nothing is lost either way.
2c.3 The app's own saves cause no reload, flicker or lost caret (typing continuously for a minute).
2c.4 The open file moved or deleted outside: the message appears at once (not only at the next save), typing is kept, and nothing is written into Recently Deleted.
2c.5 iCloud Drive: a file edited on the Mac (or another device) shows on the iPhone and the iPad; record exactly what happens and how long it takes. No claim beyond what is seen.
2c.6 A file that is not downloaded: opening it shows "Downloading…", then opens; offline, the failure shows inline and the current document is unchanged.
2c.7 The page never freezes while a file is read, written or downloaded (type during a slow open).
2c.8 Saving while another device writes the same iCloud file: record what happens (loss, a conflict copy, nothing).
2c.9 The drawer list shows files added, removed or renamed outside, live if built, otherwise on the next foreground.
2c.10 The carry-over items in scope item 5.
2c.11 No alert, sheet or toast other than the system pickers and the share sheet.

Results to record, each as pass, fail or not run, with the exact error or what was seen, the device and iOS version; the Xcode version; any web change that would be needed, listed but not made.

Results so far (2c is built in steps; the order is in the confirmation note above):

**Step 1, coordinated and off-main-thread file access: built (2026-11-28); tested by me on the Mac and in the iPhone 17 simulator; not yet run on a device, the iPad or with iCloud.**
- **What changed.** New `FileAccess.swift` (Foundation only): every read and write of a document, the folder listing, the rename, the delete of an empty untitled file and the creation of new files run under `NSFileCoordinator` on a background queue. Reads run side by side; writes run one at a time in the order asked for. Reads use `.withoutChanges` (no request to other presenters to save first, so step 2's presenter cannot deadlock with them); the listing also asks for metadata only, so it never starts a download. `TextFile` keeps the raw read and the atomic write, now called inside the coordinators. `DocumentStore` and `EditorSession` are async; the one-operation-at-a-time queue stays, and now also runs the debounced save and `saveBeforeLeaving`, so a save can never overlap a switch or a rename.
- **Typing during a wait is not lost.** The page stays free while a file is read, so text can be typed meanwhile. Before a switch, rename or folder change the operation calls `settle()` (ask the page for its text, save, repeat until the file holds what the page holds), once before the read and once after it, with no waiting between the last one and the switch.
- **`saveBeforeLeaving`** starts its background task before anything waits, and ends it after both saves; it now waits its turn in the queue, so behind a very slow operation the save is later than it was (step 3 adds the download time limit).
- **The drawer's list** is sent when the listing returns; an older answer that arrives after a newer request is dropped.
- **Still on the main thread, deliberately** (cheap metadata, not a read of a document): `fileExists` checks, `DocumentStore.lastFile`, the temp-file write for Export, and `ChosenFolder.isReachable`'s directory check (on a very slow provider that one can still block briefly; not changed in step 1).
- **Found by the tests, not by a device:** `Data.write(options: [.atomic, .withoutOverwriting])` is a fatal error in Foundation, not a thrown one; it would have crashed the first time a new file was created. New files are written with `.withoutOverwriting` alone.
- **Mac tests (`ios/tests/run.sh`, 22 checks, pass):** write and read back, a second write replaces the first, non-UTF-8 and a missing file give the errors the app expects, 40 concurrent writes leave one whole text, writes keep their order, 8 simultaneous creates make 8 free names and a taken name is never overwritten, rename and a case-only rename, only an empty file is removed, the listing is the `.txt` files newest first, a write waits for a coordinated read in progress and a read waits for a coordinated write in progress, and the caller keeps running while a read waits.
- **Simulator self-test (17 checks, pass; a throwaway Debug-only test that drove the real page and session, then was deleted; it is not in the repository):** launch opens `untitled.txt`; typing is saved; rename keeps the text; `+` makes a new untitled and leaves the old file alone; **switching to a file held busy by another coordinator for 1.6 s: the main thread kept running (67 ticks of 50 ms in about 3.5 s), text typed during the wait was saved to the file being left, then the busy file opened with its own text**; `saveBeforeLeaving` saved text the page had not sent yet; an empty untitled is removed when left and not listed; a rename to a taken name is refused.
- **Not run:** a device, the iPad, iCloud (no account in the simulator), a folder chosen with the picker, Open from Files, the lost-folder paths, and a lock while a save waits behind a slow operation. **Owner: please repeat the 2a and 2b checks on the iPhone** (typing saves, `+`, rename including a taken name and a case-only change, switching in the drawer, an empty untitled removed, choosing a folder and going back, Open from Files, lock and reopen after typing quickly) and tell me anything that feels slower or different.

Results for the other steps: (empty until run)

## Task: iOS files drawer, deleting files (a spike first, then a build if it passes)

Status: a proposal for the owner to correct before any code is written. Nothing built yet. Browsers and the Mac app must not change. The files drawer is now a full-screen sheet in the iOS app (#66, confirmed on the iPhone, the iPad and the Mac).

**Decision (owner, 2026-11-28): the spike's decision rule was applied and the answer is no. There is no delete build; the rule "files are deleted in the Files app, no trash button on iOS" stands.** `FileManager.trashItem` was run on the owner's iPhone in all three kinds of location and none gave a file that Files can put back (see Results below). The spike code was never merged and its local branch was deleted (it was commit 238c2d0, never pushed). What follows (Step 2, the build, and its checks D.1 to D.7) is kept only as the record of what was proposed and is **not planned**.

**The decision being reopened.** Until now the rule was "no trash button on iOS; files are deleted in the Files app", and the app sends `trash: false` in `setFiles` (`EditorSession.sendFiles`). On 2026-11-27 the owner asked whether deleting from the drawer is viable, which reopens that rule. Everything else decided earlier still stands: plain UTF-8 `.txt` files; no alerts, sheets or toasts (feedback is inline); free Apple account; no TestFlight; no claims about iCloud beyond what has been seen.

**What already exists.** The page has a per-row trash button with a two-step confirmation (the first tap arms it and reads "Delete?", the second confirms; it disarms after 4 s), always visible with a full-size target on touch screens, and a "Moved to the Trash" bar with Dismiss at the top of the drawer. The protocol has `{ type: 'trash', name }` with a reply of `{ ok: true }` or an error string that the page shows inline; `trash` in `setFiles` is sent with every list, so it can differ per list. The Mac handles it in `mac/Typewrencher/EditorSession.swift` (`trash`): the name must be a plain file name, the file must exist, trashing the open document first saves its newest text and then switches to a new empty document, a failed save refuses, and the file goes through `FileManager.trashItem`, never a permanent delete. The iOS app today handles neither `trash` nor the button (`WebEditorView.swift` handles `files` and `openFile` only).

**What is not known (this is why there is a spike).** An earlier note said "iOS has no Trash for app files". That was an assumption. `FileManager.trashItem` exists on iOS, and in 2b a deleted folder was seen to go to Recently Deleted, but it has not been seen what `trashItem` does for a file in the app's own Documents folder, in a folder chosen with the picker, or in iCloud Drive; whether it can fail, and with what error; or whether the file can be recovered. As on the Mac, the app itself will not be able to restore a file (the sandbox refuses); recovery would be in the Files app's Recently Deleted.

### Step 1: the spike (no shipped UI)

A temporary, Debug-only hook on a branch that is never merged: it calls `FileManager.trashItem(at:resultingItemURL:)` on the open file, shows the result and the error (if any) on the notice line, and writes the `resultingItemURL` to the log. The code is thrown away; only the results below are kept in this file.

Run these checks on the iPhone (and the iPad where noted):
T.1 A file in the app's own folder: where does it go (Files > Recently Deleted, on which tab)? Can it be recovered from there? Record the `resultingItemURL`.
T.2 A file in a folder chosen with the picker under "On My iPhone": the same.
T.3 A file in a folder chosen in iCloud Drive: the same; does it also appear in Recently Deleted on the Mac or the other device, and how long does that take (record what is seen, no claim beyond it)?
T.4 A file that cannot be trashed (for example, one in a folder whose access has been lost, or a read-only location if one can be found): what error does `trashItem` throw, and is anything left changed?
T.5 The open document: trash it, then type. Does the app notice (the 2b "moved or deleted" message) and keep the text?
T.6 The iPad: T.1 only.

Decision rule after the spike (recorded in Results before anything is built): if **all** the locations in use go to a recoverable Recently Deleted, build it for all. If only some do, build it only for those: the page's `trash` flag is sent per list, so the app can send `trash: true` for a folder where it works and `trash: false` where it does not. If none do, the Files-app rule stands and this task ends.

### Step 2: the build (only if the spike passes; its own pull request, after the spike's results are in)

1. **Native `trash` in `EditorSession` and `WebEditorView`.** The rules follow the Mac: the name must be non-empty, contain no `/`, and be a `.txt` file that exists in the listed folder; the file is moved with `trashItem`, never `removeItem`; any failure replies with a short reason (the page shows it inline) and leaves the file, the document and the list as they were; the list is refreshed after success. It runs through the existing one-operation-at-a-time queue, and through the coordinated file access from 2c when that is merged.
2. **The open document.** Trashing it saves its newest text first (a failed save refuses, as on the Mac), stops watching the file if 2c has added watching, then switches to a new empty untitled document in the same folder, the way New does. Trashing another file leaves the open document alone.
3. **`setFiles` sends `trash: true`** (or per list, by the spike's decision rule).
4. **Wording (a web change, its own pull request, a site release with the stamp, tests and the Mac recheck).** The page says "Moved to the Trash" and "Move <name> to the Trash". In the iOS app the place is Recently Deleted, so the page needs the host to say so (for example an optional label in `setFiles`) or the iOS wording must be accepted as is. Decided after the spike, listed here so it is not forgotten.

Not in this task: restoring a file from inside the app, deleting a folder, deleting several files at once, swipe-to-delete, a permanent delete of any kind, and iCloud files that are not downloaded (2c).

Assumptions to confirm (change them in the pull request if wrong):
1. The two-step confirmation already in the page (arm, then confirm) is enough; no alert or sheet is added.
2. Trashing the open document switches to a new empty one, as on the Mac.
3. The spike's decision rule above is right, including building for only some locations.
4. The spike comes first and independently of 2c; the build comes after 2c's coordinated file access, so the delete is coordinated like every other write.
5. A failure is shown inline with the system's short reason; the app never falls back to a permanent delete.

Checks for the build (if it is built), on the iPhone and the iPad:
D.1 A trash button shows on every row, the first tap arms it, a second tap moves the file, and the drawer list updates.
D.2 Arming and then waiting 4 s, or tapping elsewhere, disarms it; nothing is deleted.
D.3 Trashing a file that is not open leaves the open document and its text untouched.
D.4 Trashing the open document: its text is in the trashed file (check in Recently Deleted), and the app shows a new empty document.
D.5 Where the spike found trashing impossible, no button shows, or the reason shows inline and nothing changes.
D.6 The file is recoverable in the Files app's Recently Deleted.
D.7 No alert, sheet or toast other than the system pickers and the share sheet.

Results to record, each as pass, fail or not run, with the exact error or what was seen, the device and iOS version; the Xcode version; any web change that would be needed, listed but not made.

Results (spike, run by the owner on 2026-11-28 on the iPhone; the Debug-only hook trashed the open file and showed the outcome on the notice line; the screenshots were read by me, the checks were run by the owner):
- **T.1, a file in the app's own folder: moved, but not recoverable through Files.** `trashItem` returned success and moved `what.txt` to `<app container>/Documents/.Trash/what.txt` (a hidden folder inside the app's own container); the original was gone. Files > Recently Deleted listed it under "On My iPhone", and Recover was offered, but using it gave the alert "The Operation Can't Be Completed. Nothing to process." (the owner reported it "cannot be recovered"; I am reading the alert in the screenshot as the result of choosing Recover). The file still exists in the hidden `.Trash`, so nothing was lost.
- **T.2, a folder picked with the picker under "On My iPhone" (a new folder named Text): failed.** The folder was at `/var/mobile/Containers/Shared/AppGroup/<id>/File Provider Storage/Text`. `trashItem` threw `NSCocoaErrorDomain` 512: "one.txt couldn't be moved to the trash." The file stayed in place and the page still showed it open.
- **T.3, a folder picked in iCloud Drive (`…/Mobile Documents/com~apple~CloudDocs/Documents/Plain Text Drafts 7`): moved, with no Recover.** `trashItem` returned success and moved `woooop.txt` to `/private/var/mobile/Library/Mobile Documents/.Trash/woooop.txt`; the original was gone. Recently Deleted listed it under "iCloud Drive", but its long-press menu offered only Copy, Get Info and Delete Now, with no Recover. Whether it shows in Recently Deleted on the Mac, and how fast, was not checked.
- **Control: a file deleted in the Files app can be recovered** (owner), so the missing Recover is specific to `trashItem`. My guess, not verified, is that the API moves the file without recording where it came from, which Recover needs.
- **T.4, a deliberate failure case: not run**; T.2 produced a real failure instead (above).
- **T.5, trashing the open document: stuck state.** After a successful trash the document still pointed at the missing file; `+`, a rename and opening another file were all refused (each saves first, and the save fails), so only the first spike trash worked until the app was relaunched (owner-reported; the code agrees: `newDocument`, `renameNow` and `openNow` all stop when `saveNow()` fails). This confirms that any future delete must save the open document and switch to a new empty one before it trashes.
- **T.6, the iPad: not run.**

Not run, and not needed for the decision: the iPad, the cross-device iCloud check, any other kind of folder (for example another cloud provider).

Alternatives considered and **not** planned: (a) an in-app soft delete (the drawer moves a file into a folder the app owns, with Restore and Delete forever), which would be a new feature with web and Swift changes and a hidden folder left in iCloud; (b) a permanent delete behind a strong confirmation, which contradicts assumption 5 (the app never deletes permanently). If deleting from the drawer is wanted again, (a) would be its own plan.

## Recheck: drawer width and backdrop (#70), launch screen (#71), background-task warning (#72)

Reported by the owner on 2026-11-27 and 2026-11-28, on the iPhone: **#70 passes** (the files drawer is as wide as Settings, over a dimmed page that a tap closes), **#71 passes** (the launch screen: the app icon on its own near-black background `#020502`, the same in light and dark mode; it does not cover the page's own start-up, and iOS caches launch screens, so delete the app to see a change) and **#72 passes** (a warning fix in `EditorSession.saveBeforeLeaving`, behavior unchanged; I suggested typing, locking the phone and reopening, and the owner did not list which steps were run, so this records "the test passes", not that check specifically). The Mac pass for #70 is recorded in `mac/HANDOFF.md`. **Not run: the iPad, for all three**; for #70 that is the one place the first open of a session may briefly show the old docked column before the first file list arrives (the page learns it is the iPhone and iPad app from that list). I did not run the iPhone checks myself; the owner did, on the iPhone.

Working notes (found the hard way on 2026-11-27):
- **The Xcode project that Claude Code's Xcode tools are attached to is a scaffold, not this app.** It is `Typewrencher iPhone and iPad Chat` (under `~/Documents/Typewrencher iPhone and iPad`) and holds only `ContentView.swift`, `MyApp.swift` and an accent color. `BuildProject` and `RunProject` through it build and run that scaffold, so a "built successfully" from them says nothing about the app; some earlier results in this file that were reported that way should be read with that in mind. Build the real project with `xcodebuild -project ios/Typewrencher.xcodeproj -scheme Typewrencher -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/tw-ios-dd CODE_SIGNING_ALLOWED=NO build`, which also reports compiler warnings. The owner builds and runs `ios/Typewrencher.xcodeproj` in Xcode.
- **`node` is not on the PATH of a plain shell here**; run the tools through a login shell (`zsh -lic 'node tools/build-site.js ios/Typewrencher/site'`). The tests run with `node --test tests/app.test.js`.
