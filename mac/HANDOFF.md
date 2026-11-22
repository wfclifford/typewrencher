# Mac app handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Task: lock Rhymes height, and width selector

Status: ready. Two web settings. Both are site files, so merging counts as a release; follow the web rules in `CLAUDE.md` (stamp, check, tests; then rebuild the Mac site copy). The backlog has both items under Ready. Mocks were shown in the planning chat: Rhymes lock (panel keeps full height with few rhymes so the editor stops jumping) and Narrow / Standard / Wide page widths.

Both settings are app-wide and per-device, stored like the other settings (`store("syl-...")` in `js/app.js`). Neither needs a bridge change. No new dependencies.

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
- When done, move both items in `BACKLOG.md` from Ready to Testing, fill in Results below, push, open a pull request, and do not merge.

## Results

(none yet)
