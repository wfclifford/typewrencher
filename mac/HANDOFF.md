# Mac app handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Recheck: no "Choose folder" button on the Mac after `setFiles` gained `chooseFolder` (#61, #62)

Checked by the owner on the Mac (Debug build run from Xcode, site copy built from the iOS 2b branch's web files, Clean Build Folder first). I did not run the Mac app for this one; this is the owner's report, recorded as given. The Mac sends no `chooseFolder`, so its drawer should be unchanged.

- Open the files drawer: there is no "Choose folder" button at the bottom. **Pass.**
- Hover a row: the trash icon still shows; the date, path line and count look as before. **Pass.**
- The owner's summary was "1 and 2 pass".

## Recheck: trash buttons still show on the Mac after `setFiles` gained `trash` (#59)

Checked by the owner on the Mac (Debug build run from Xcode, site copy built from the `hide-trash-on-ios` branch, Clean Build Folder first). I did not run the Mac app for this one; this is the owner's report, recorded as given. The Mac sends no `trash` field, so its drawer should be unchanged.

- Hover a drawer row: the trash icon still replaces the date. **Pass.**
- Click the trash icon once: it arms and reads "Delete?" (not confirmed on a file). **Pass.**
- The owner's summary was "all pass" for the three items offered (the two above and the page opening as before); the third was not itemized.

## Recheck: files drawer touch fixes (#55) in the Mac app

Checked by the owner on the Mac (Debug build run from Xcode, site copy for the `drawer-touch-hover` branch built with `node tools/build-site.js mac/Typewrencher/site`, Clean Build Folder first). I did not run the Mac app for this one; this is the owner's report, recorded as given: items 2 to 6 of the list below all pass.

Changes under check (CSS only; no native Mac code changed): the drawer row, date and trash hover styles now apply only under `@media (hover: hover)`, and `touch-action: manipulation` is set on the drawer panel and its list.

- Hover over a file row: the row gets the light tint, the date is replaced by the trash icon, and the icon gets a border on hover. **Pass.**
- Hover over the current (highlighted) row: it keeps its solid highlight. **Pass.**
- Click a row to open it, and click quickly between two or three rows: files open as before, nothing misbehaves. **Pass.**
- Keyboard: Tab into the drawer; a focused row shows the trash icon in place of the date. **Pass.**
- Trash: one click on a row's trash icon arms it ("Delete?"); not confirmed on a file. **Pass.**

Not run: a second Mac window size (the Mac window is a single window), other themes, VoiceOver.

## Recheck: web changes up to #65 (owner's pass)

On 2026-11-27, with `main` at f90fffe (merge of #65, which includes the rhyme mark underline #63 and the files drawer filling the row on narrow windows #65), the site copy was rebuilt with `node tools/build-site.js mac/Typewrencher/site` and the Mac app rebuilt and run from Xcode (no build errors; the copy's `css/` and `js/app.js` matched the repo). **The owner ran the Mac app tests and reports that all of them pass.** I did not run them myself, and the owner did not list which checks were run, so this records "all Mac app tests", not individual items. Nothing in the Swift code changed.

## Recheck: the full-screen files drawer for the iPhone and iPad app (#66), Mac unchanged (owner's pass)

On 2026-11-27, after #66 was merged (`main` at ad30e4a), the owner ran the Mac app tests and reports that **all of them pass**. #66 changes the shared page so that, only when the host sends `chooseFolder` (the iPhone and iPad app does; this app does not), the files drawer becomes a full-screen sheet from the left; the Mac app must keep its docked drawer and the narrow-window fill from #65. I did not run the Mac tests myself, did not rebuild the Mac site copy, and do not know whether the owner rebuilt it first, and the owner did not list which checks were run, so this records "all Mac app tests", not individual items. Nothing in the Swift code changed. On the same day the owner also reported that all tests pass on the iPhone and on the iPad.

## Recheck: web changes #43, #47, #48, #49 in the Mac app

Checked on the Mac (macOS 27.2) in a Debug build run from Xcode, `main` at 588628b, site copy rebuilt with `node tools/build-site.js mac/Typewrencher/site`. `node tools/stamp.js --check` is current and `node tests/app.test.js` passes (245). No code was changed: no check failed. I drove the real window with CGEvent clicks and screenshots, in a scratch folder `~/Developer/tw-check`. Window 1512×949 pt, then 480×700 and 1400×860 pt. The first launch showed a macOS "differs from previously opened versions" prompt; the owner chose Open Anyway.

**a. Name field (#47), narrowest window.** Pass. The window cannot be made narrower than 480 pt (asked for 300, got 480). At 480×700 the header is one row: files drawer, Open, +, Name field, Export (label "Export"), Settings.

**b. Export button (#48).**
- Success: after saving a copy through the save panel the button read "Done" in a capture 0.5 s later and "Export" again in a capture 3.7 s later. The 2.5 s was not timed more closely than that.
- Empty text: Export with an empty document shows no panel (the page says "Nothing to save yet." on the status line; I did not look at the status line then).
- Cancel: pressing Escape in the save panel closed it, the button stayed "Export", and no file was written.
- "Couldn't save": **not run.** I found no safe way to make a save fail, and the owner cannot test it on the Mac either. It stays untested here; the iPad Slide Over pass in `ios/HANDOFF.md` covers the page logic.
- Under 360 px: not applicable on the Mac (minimum width 480 pt).

**c. Files drawer caret (#49).**
- Mouse: with the drawer open, clicking the drawer button closed it and the caret was in the text (seen in one capture; the caret blinks).
- Keyboard (Tab to the button, Space, focus stays on the button): **pass, by the owner on the Mac.** My own attempt was inconclusive: Tab and Shift-Tab moved focus between the editor and the Name field, but I could not see focus on the header buttons in the screenshots and never saw it on the drawer button. The owner ran it by hand afterwards and reports it passes.

**d. Name field select on focus (#43).** Pass for the selection: in a new untitled document, clicking the Name field selected "untitled" (and Tab into the field on an existing document selected "Sonnet"). Typing over the selected name in a new untitled document: pass, by the owner on the Mac (I did not run it).

**e. Rhymes and page width, Lock Rhymes height on and off.**
- Lock on (it was on, left over from the earlier task): typing the made-up word `zzqxv` kept the Rhymes panel at its full height (about 176 pt, the same as with rhymes listed) and "No pronunciation found for “zzqxv”." showed inside it.
- Lock off: the same word shrank the panel to its title and the message row, and the editor grew into the space. I turned the lock back on afterwards.
- "Lock Rhymes height" sits under "Show rhymes" and its help line and above "Include near rhymes".
- Page width: Narrow narrows the page and the header, editor, gutter count, Rhymes panel and footer follow it; the count stays on its line. With Settings open, Standard and Wide look the same because the text area is already narrower than both. With Settings closed at 1400 pt, Standard is centered with margins. Wide page: pass, by the owner on the Mac. Wrapping off, other themes, and the persistence after relaunch were not run this time.

**f. Header order, drawer, status line.** The header order is unchanged (files drawer, Open, +, Name, Export, Settings) at 480 pt and at 1400 pt. The drawer (folder name, file count, rows, path) and the status line (counts, estimated and variable, dictionary state) were seen once each and showed the expected content. I did not compare them with an older build, so "unchanged" is confirmed only for the header order.

**Not run:** "Couldn't save" on the Mac (cannot be tested there), VoiceOver, other themes, persistence after relaunch. The keyboard half of c, typing over the selected name and Wide page were later run by the owner on the Mac and pass.

**Notes.**
- Clicking in the text while Settings is open closes the Settings drawer; not checked against earlier behavior.
- Typing a path (with `/` or `~`) into the save panel's name field opens the panel's "Go to the folder" field and can produce a file name with colons; that was my input, not the app.
- The scratch folder now has an `untitled.txt` with test text; nothing in the repo besides this file changed.

## Task: move files to the Trash from the files drawer, with Undo

Status: decided by the owner; the interaction was mocked up and approved. Nothing is built yet. Mac app only. Browsers have no files drawer and must behave exactly as before.

Get current first (the site copy the app serves is not tracked by git):
1. Pull `main`.
2. Run `node tools/build-site.js mac/Typewrencher/site`, then build and run the app.
Since the last Mac check, `main` gained the export marker with the "Remove counts / Keep" bar (already tried on the Mac and fine) and the rule that text in `[ ]` is ignored in counts (web only, not yet tried on the Mac: typing `[Chorus]` should show no count). No native code has changed since the last Mac task.

### Decision

- Each file row in the drawer can be deleted. The file leaves the folder, but it goes to the macOS Trash (`FileManager.trashItem`), not permanent removal. Undo puts it back.
- The design principles in `CLAUDE.md` apply: no `NSAlert`, no confirm dialogs, no sheets, no toasts. Feedback is inline.

### Interaction (approved mockup)

1. Hover or keyboard focus on a row shows a trash button where the date is. It has its own Tab stop and the accessible name "Move <name> to the Trash".
2. First click turns the button into "Delete?" (filled, with the trash icon) for 4 seconds, then it reverts. While armed, the file name shortens with an ellipsis so the button does not cover it.
3. Second click moves the file to the Trash. The row leaves the list and the file count updates.
4. The bar under the header (the one used for "Remove counts / Keep") shows: Moved "<name>" to the Trash. with Undo and Dismiss, for about 8 seconds. Reuse the pattern or add a sibling bar, but keep it inline. Announce it through the status line for screen readers.
5. Undo moves the file back to its original path and refreshes the drawer. If a file with that name has since been created, do not overwrite it: report the problem inline.

### Bridge (protocol 1 stays compatible; additive only)

- Add page to native `{ type: 'trash', name }`, with a reply of `{ ok, undoId }` or an error string, and `{ type: 'untrash', undoId }`. Other names are fine, but existing messages keep their shape.
- Update the header comment in `js/host.js`, the handler in `mac/Typewrencher/WebEditorView.swift` and the tests in the same change.

### Decide and report, do not assume

- **Sandbox.** Trashing needs write access to the folder. Check how the entitlements and `FolderAccess` (the security-scoped bookmark) apply. Listing a folder is not the same as being able to delete in it (see the comment in `FolderFiles.swift` about iCloud-synced Documents). If a file cannot be trashed, show the reason inline.
- **Undo from the Trash.** Use `trashItem(at:resultingItemURL:)` and keep the resulting URL. Test that moving the file back works under the sandbox. If the sandbox blocks it, report the exact error before choosing a workaround.
- **Deleting the open document.** Switch the window to a new empty document, cancel any pending autosave so the file is not written back, and make sure Undo restores the file cleanly. Describe what you chose.
- **Other cases.** A file open in another app, an iCloud file that is not downloaded, and a name that already exists in the Trash: observe what happens and handle each inline.
- Keep the single-window model and the header order: files drawer, Open, +, name field, Export, Settings.

### Web side

- Changes to site files count as a release. Never edit `js/version.js`, the `?v=` hashes or the generated block in `sw.js` by hand. After web changes run `node tools/stamp.js`, then `node tools/stamp.js --check` and `node tests/app.test.js`. All tests must pass.
- Add tests for the drawer markup, the armed state and its timeout, the bar with Undo, keyboard access, and that browsers are unchanged.
- Update the README or `mac/README.md` if they list drawer features.

### Check on the Mac and report what you observed, with exact errors

a. Hover, focus and Tab reach the trash button; VoiceOver reads its name (claim this only if you ran VoiceOver).
b. The armed state reverts after 4 seconds; long names are shortened, not covered.
c. Trashing a file removes the row, updates the count and shows the bar, and the file is in the Trash in Finder.
d. Undo restores the file to the same place and the drawer lists it again.
e. Trashing the open document, as above.
f. A folder without granted access, or a file that cannot be trashed: the failure shows inline.
g. All themes, and a narrow window where the drawer floats.
h. `[Chorus]` in the text shows no syllable count.

Do not claim anything you did not run on the Mac. If a check fails, report the exact observation first, then fix it.

### Results

Built on branch `trash-with-undo`. Checked on the Mac (macOS 27.2) in a Debug build, window about 1512×949 pt, in a scratch folder `~/Developer/tw-check` (Poem.txt, Other.txt and a file with a long name), by driving the real window with CGEvent clicks and screenshots. `node tools/stamp.js --check` is current and `node tests/app.test.js` passes (241). Timing was loose: some screenshots came late, so only what a screenshot or `ls` showed is claimed.

**What was built.** Page: a trash button beside each file button in every row (`li > button.file + button.file-trash`), the armed state, and a `#trashBar` after `#stripBar` (reuses `.strip-bar`). Bridge: `trash` replies `{ ok }` or rejects with a short reason. Documented in the `js/host.js` header; handler in `EditorSession.swift` (`trash`); tests added. **Update:** an `untrash` message and Undo were built and then removed again; see the Undo note below. Browsers: nothing is created or shown without the host (a test checks this).

**Decisions.**
- Sandbox: no new entitlement. Trashing uses the folder grant that `FolderAccess` already keeps; without it the native side replies "Typewrencher has no access to this folder" (the drawer shows no trash buttons then, because it only lists files once access is granted).
- Undo (built, then removed): the first version kept the Trash URL from `trashItem(at:resultingItemURL:)` and moved the file back with `moveItem`. On my Debug build that worked (see d). On the app the owner ran, it failed with "Couldn't restore <name>: no permission", because the App Sandbox lets the app move a file into the Trash but not back out. Why my run and theirs differ was not found; I did not get to run Undo on a Release build. The page's Undo was removed (PR #42), the bar now says the move cannot be undone here and points to the Trash in Finder, and the unused `untrash` handler and `undoId` were then removed from Swift and the bridge. Undo stays out until someone can reproduce the failure and fix it.
- Open document: the newest text is saved first (if that save fails the trash is refused), the window switches to a new empty `untitled.txt` in the same folder, and the old file's pending autosave and late text from the page are not written back (a write to a file that no longer exists is skipped). Undo restores the file but does not reopen it; the empty untitled file stays and is trashed by the existing rule when left.

**Observed on the Mac.**
- a. Hover shows the trash icon where the date was (screenshot). Tab order and VoiceOver: not run, not claimed.
- b. First click gives a red "Delete?" with the trash icon, the date is hidden and the long name shortens to "A very lon…" instead of sitting under the button; after about 4 seconds it reverted (checked with a screenshot after 4.5 s).
- c. Second click: the row left the list, the count went from "3 files" to "2 files" then "1 file", the bar (first under the header with Undo and Dismiss; after PRs #41 and #42 at the top of the drawer, Dismiss only) showed `Moved “Other” to the Trash.`, and the file was gone from the folder (`ls`). I did not open Finder, so "in the Trash in Finder" was not seen directly. The 8 second timeout was not timed.
- d. **Superseded.** On my Debug build, Undo restored `Other.txt` to `~/Developer/tw-check` (`ls`), the drawer listed it again, and the bar said `Restored “Other”.`, with no sandbox error. On the app the owner ran, the same step failed with "no permission", so my result does not hold in general and Undo was removed. Not run: Undo on a Release build.
- e. Trashing the open Poem.txt: the window switched to an empty `untitled`, `untitled.txt` was created, Poem.txt did not come back, and the drawer updated. Undoing the open document was not tried.
- f. Only the no-access case was seen: before the grant the drawer showed "needs your permission" and "Allow access", with no trash buttons. A file that cannot be trashed was not tried.
- g. Only one theme (e-ink, light) and a wide window were seen. Other themes and a narrow window with a floating drawer: not run.
- h. `[Chorus]` no count: not run.

**Not run:** a file open in another app, an iCloud file that is not downloaded, a name that already exists in the Trash, the bar timeout on the real app, and the Tab/VoiceOver items. In one stretch two clicks trashed two rows in a row because screenshots were delayed; the app behaved correctly for each click it received.

**Note:** the empty trash button after the armed state reverts is slightly wider than the icon alone (an empty label span with a gap); cosmetic.

## Previous task (done): check the Rhymes lock, page width and rhyme mark in the Mac app

Status: the web side is done and released (site release 0.1.20: Lock Rhymes height, Page width, the rhyme mark change, and the e-ink fix). Your part is to check it in the running Mac app and fix only what is broken there. Nothing in this task changes the bridge.

Steps:

1. Pull `main`, run `node tools/build-site.js mac/Typewrencher/site`, then build and run the app.
2. Check each item below in the running app and report what you observed:
   a. **Page width.** Settings drawer, Display Options: "Page width" (Narrow, Standard, Wide) sits under "Wrap long lines", with its label on the same row as the buttons. At a wide window each step changes the page width and the syllable gutter stays aligned with its lines, with wrapping on and off. At a narrow window (under 800px) the control is hidden.
   b. **Lock Rhymes height.** Settings drawer, Dictionary Options: turn on "Show rhymes". "Lock Rhymes height" appears under "Show rhymes" and above "Include near rhymes". With it on, the open Rhymes panel keeps the same height even with few or no rhymes, and the editor above it does not move while typing. It is off by default, and "Reset to defaults" turns it off.
   c. **Rhyme mark.** With Show rhymes on, put the cursor in a word. In retro_term, retro_amber, B&W and High contrast the marked word is an outline with a thick underline, and the block cursor (retro_term and retro_amber) is the only solid cell, including when it sits inside the marked word. In e-ink (light and dark) the marked word is a soft shade. In Grey, Warm and Cool it is a soft tint.
   d. Both settings persist after quitting and relaunching the app.
   e. The header order is still: files drawer, Open, +, name field, Export, Settings.
3. Do not claim anything you did not run on the Mac. If a check fails, report the exact observation, then fix it on a branch (web fixes follow the web rules in `CLAUDE.md`).
4. Fill in Results below on the same branch, push, open a pull request, and do not merge.

### Reference: what was built (web, already released)

### 1. Lock Rhymes height

- **Placement.** A switch in the settings drawer, in `#rhymeOptions`, directly under the "Show rhymes" switch and its help text and ABOVE "Include near rhymes". Because `#rhymeOptions` is hidden unless Rhymes is on, the switch appears only then. Same markup as the other switches (`label.switch.dictionary-toggle`, `role="switch"`), label "Lock Rhymes height", with a one-line help paragraph in the same style (for example: "Keeps the Rhymes panel the same height, so the text above it does not move while you type.").
- **Behavior.** Off by default. When on and the panel is open, the panel keeps its tallest size even with few or no rhymes. Desktop layout: `.rhyme-panel` has `max-height: 9rem`; when locked give it that as a fixed `height` too. Keyboard-open layout (`html.kb`): the tall layout (`html.kb.kb-tall`) uses `max-height: 4.7rem`; lock that only under `kb-tall`. Never lock on short visible heights (the non-tall `kb` layout stays one row), and keep the editor's three-line minimum (see `.sheet`). When the panel is collapsed nothing is reserved.
- **Implementation hint.** Toggle a class on `<html>` or `#rhymePanel` (for example `rhyme-locked`) and do it in CSS; do not measure in JS.
- Messages and empty states ("no rhymes" text) must still display inside the locked panel.

### 2. Width selector

- **Placement.** In the settings drawer's "Editor" group (`.opt`), directly under the "Wrap long lines" switch. A small segmented control of three buttons in the same style as the other choice buttons (use `aria-pressed`, like the tone buttons): Narrow, Standard, Wide. Label it "Page width".
- **Behavior.** Standard is today's layout and the default; it must look exactly as it does now (`.app` has `max-width: 62rem`). Narrow and Wide change that max width through a CSS variable or `data-width` attribute on the root; pick values that look right (starting points: about 44rem and about 84rem). Everything inside, the header, the editor, the syllable gutter, the Rhymes panel and the footer, follows the page width.
- **Where it shows.** Only where it can matter: wide windows (desktop browsers, the Mac app, iPad). Hide the whole control on phones and narrow windows (for example below 800px wide; the page already switches font size at 800px). If the window is narrower than the chosen width, the layout just fills the window as it does today.
- **Check the gutter.** At every step, and a few fonts and sizes, confirm the syllable counts in the margin stay aligned with their lines, with wrapping on and off, including after changing the window size (`ResizeObserver` re-render already exists).

### Both

- Add tests in `tests/app.test.js`: switch exists and sits in the required order in the drawer markup, default off / Standard, saved value restored, the root class or attribute changes, and the width control is hidden on narrow windows if that is done in JS.
- Accessibility: keyboard reachable in drawer order, visible focus, names readable by VoiceOver (check on the Mac if you can run it; do not claim it otherwise).
- Update the README settings list if it lists settings.
- Check all themes, and phone and tablet sizes in the browser; the keyboard-open layout can only be confirmed on a real iPhone, so say that is untested.
- Browsers keep working as before; the Mac app picks it up through the site copy, so run the build-site command and check both settings in the running app.

## Results

Checked on the Mac (macOS 27.2) in a Debug build of the app with the site built by `node tools/build-site.js mac/Typewrencher/site`, window 1400×860 pt, a scratch file `~/Developer/tw-check/Poem.txt`. All observations are from screenshots of the running app. One Mac-only problem was found and fixed (item a, files drawer at Narrow); everything else passed as released.

**a. Page width.** Pass, after one fix.
- "Page width" (Narrow, Standard, Wide) sits directly under "Wrap long lines" in Display Options, label on the same row as the buttons.
- Each step changes the page width: the header, editor, gutter, Rhymes panel and footer all follow it. Narrow and Wide with wrapping on, Standard with wrapping off (a long line stays on one row and scrolls): the syllable counts stayed on their lines each time, including a wrapped first line (its count on the first row, nothing on the wrapped rows).
- At a 760 pt wide window the whole Page width row is hidden.
- **Found and fixed:** at Narrow with the files drawer open (Mac app only), the drawer floated over the left of the text, hiding the gutter and the line starts. Cause: at Narrow the text row is under 44rem, which is the drawer's "float when too narrow" rule (`@container work (max-width: 44rem)`). Fix in `css/styles.css`: at Narrow, while the drawer is open, the page is widened by the drawer and its gap (`max-width: calc(var(--page-w) + 15.75rem)`), so the drawer sits beside the text and the text keeps the Narrow width. Only Narrow is changed: Standard and Wide with the drawer open look as before, and browsers never show the drawer, so they are unchanged. Re-checked in the rebuilt app: drawer beside the text, counts aligned; closing the drawer gives the same Narrow page with identical line wrapping; Standard with the drawer open unchanged. On a window too small for both, the existing float rule still applies. Added a test; stamp, `--check` and `node tests/app.test.js` (225 pass) run.

**b. Lock Rhymes height.** Pass.
- Appears only with Show rhymes on, under Show rhymes and its help text, above Include near rhymes, with the help line "Keeps the Rhymes panel the same height, so the text above it does not move while you type."
- On, typing a made-up word ("zzqxv", no rhymes): the panel kept its full height, the top edge did not move, and "No pronunciation found for "zzqxv"." showed inside it. Off, the same word: the panel shrank to the message and the editor grew.
- Off by default (it was off before I turned it on). "Reset to defaults" turned it off (seen after turning Show rhymes back on, since Reset also turns Show rhymes off).

**c. Rhyme mark.** Pass, with the cursor inside "light".
- retro_term and retro_amber (light, and retro_term dark): an outline with a thick underline. The block cursor on "g" is the only solid cell and blinks (one capture with it on, one with it off).
- B&W and High contrast: an outline with a thick underline, ordinary line cursor.
- e-ink light and dark: a soft shade, no outline.
- Grey, Warm, Cool (and Grey dark): a soft tint with a thin border in the tone's color.

**d. Persistence.** Pass. With Wide and the lock on, quit with Cmd-Q and relaunched: Wide was still selected and applied, and the made-up word still showed a full-height panel.

**e. Header order.** Pass: files drawer, Open, +, Name field, Export, Settings.

**Not checked:** VoiceOver (not run, so not claimed); keyboard order through the new controls; the keyboard-open (`html.kb`) layouts, which need an iPhone. Noted, not a bug: Reset to defaults leaves Color Tone and Theme as they were.
