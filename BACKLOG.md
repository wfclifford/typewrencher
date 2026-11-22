# Backlog

Personal working list for Typewrencher. This project does not take issues, pull requests or feature requests; forks are welcome.

## Design principles

- **Focused writing environment.** A main goal on every platform. Keep people inside the UI whenever possible.
- No `alert()` or `confirm()` dialogs, no new tabs or windows, and no sending people to settings or docs elsewhere.
- Feedback is inline: button labels, the status line, the drawer. No modals or toasts.
- Accessibility fixes live in the app, not in instructions for changing browser settings.
- The iOS share sheet for export is the one accepted exit, because iOS offers no other way to save a file. New features that need to leave the writing surface (file pickers, in-place save, outbound links) face a higher bar.

**Status key:** Ready (decided, build on "build it") · Idea (documented or proposed, not scheduled) · Testing (shipped, needs verification) · Done · Rejected

## Ready


## Idea

- **Syllable targets per line.** Pick a form (haiku 5-7-5, tanka, limerick, or a custom count) and the gutter shows whether each line is on target, short or over. Builds on the existing line counts; forms live in a small list in settings. Stays inside the editor.
- **Rhyme scheme labels.** Letters in the margin (A, B, C) showing the scheme, such as ABAB or AABB, found by matching line endings with the rhyme engine. Computed on the device. Needs the rhyme dictionary loaded; decide what to show when it is off (the mockup hides the column). Mockup: a small letter badge beside each line's syllable count, same letter for lines that rhyme, letters distinguished by style as well as color (filled, outlined, tinted), a dim dot for a line with no rhyme partner, and a one-line scheme summary under the editor (for example ABAB). Mocked in the planning chat; not built.
- **Stress and meter.** CMUdict marks stressed syllables, so a line's stress pattern could be shown and checked against a meter such as iambic pentameter. The most ambitious idea. Needs care with words that have several pronunciations (the app already marks those "variable").
- **Focus mode.** Dim every line except the current one. A small CSS and JS change that fits the focused-writing goal on every platform.
- **Read it aloud.** Read the text or the current line with the device's built-in voice so people can hear the rhythm. On-device and offline on Apple platforms. Needs a clear stop control; check it works inside the Mac web view.
- **Alliteration and assonance highlights.** Optional marks, like the rhyme mark, for repeated sounds. Cheap once the phoneme data is loaded for rhymes.
- **Skull button on Mac and iOS: hold to bury, with a Graveyard.** Today the skull is "+" (New) in the Mac app and erases text in browsers. Idea: bring the skull back on Mac and iOS as a fun, safe "start over". Press and hold fills a ring around the skull; releasing early cancels, holding through clears the document; the button then reads "Undo" for a few seconds (inline, no dialogs). Erasing keeps the old text as a dated file in a "Graveyard" (the Trash on the Mac; a recoverable list in the files drawer on iOS), so nothing is lost. Extras to consider: text dissolving with the jaw rattling (skipped under reduced motion), "Last words: N syllables" in the status line, a shake-to-bury gesture on iOS (needs an off switch). Not scheduled; decide how it relates to "+" New before building.
- **Autism-friendly improvements.** Documented in the Docs artifact "Autism-friendly improvements for Typewrencher".
- **Safari Tab behavior.** Safari skips buttons and toggles by default. In-app fix only (no README note or browser-settings instructions), such as `tabindex` on the controls. Unverified in Safari.
- **Node 24 upgrade.** Bump the GitHub Actions versions in `.github/workflows/pages.yml`. Effort is documented in the Docs artifact "Upgrading GitHub Actions to Node 24".

## Testing


- **Keyboard-open Rhymes layout.** Header line plus one or two chip rows, switching at 420px visible height (`kb-tall`). Verified in Chromium only. Needs real iOS and Android devices; the 420px cutoff may need tuning.
- **Live Pages deploy** at the new `typewrencher` address.

## Done
- **Width controls (desktop and tablet).** Settings control with a few fixed steps (Narrow, Standard, Wide; Standard equals today) that widens the UI and line length. Today `.app` has `max-width: 62rem`; drive that from an app-wide per-device setting. Show it only on wide screens (desktop, Mac, iPad); hide it on phones and narrow windows. Check that the syllable gutter, line wrapping and per-line counts stay aligned at every step, font and size. Standard must look exactly as it does now. Add tests. Released in 0.1.17. Checked by the owner on iPad and iPhone; the Mac app check is still open (see `mac/HANDOFF.md`).

- **Lock Rhymes height.** Settings toggle (per-device, off by default) that holds the Rhymes panel at its tallest setting even when there are few or no rhymes, so the editor above it stops resizing while typing. Desktop layout: panel `max-height` is 9rem in `.rhyme-panel`, so give it that as a fixed height when locked. Keyboard-open layout (`html.kb`): the tall row set is `max-height: 4.7rem` under `kb-tall`; lock it to that only when `kb-tall` applies, never on short viewports, and keep the editor's three-line minimum. Only when the panel is open. Follow the existing settings pattern, add the toggle to the drawer, and add tests. Check on real iOS devices; the keyboard-open layout is still unverified there. Released in 0.1.17. Checked by the owner on iPad and iPhone; the Mac app check is still open (see `mac/HANDOFF.md`).
- **Mac app: move Open between the files drawer and New.** In the Mac app's top controls, put the Open button between the files drawer button and the "+" (New) button. The order becomes: files drawer, Open, +, name field, Export, Settings. Mac app only: browsers keep their current layout. Update tests. Checked in the running Mac app by the owner.

- "Done" success label: the `.txt` button reads "Done" on downloads, the iOS share sheet and native saves; the status line and accessible name say "Done title.txt".
- Version in About: last line of About shows `Version 0.1.N · build <id>`. The build id changes with every code change (`tools/stamp.js`); the release number counts merges on `main` that changed a site file and is set only in the deployed copy (`tools/build-site.js --release`). Local and pull request builds show `dev`.
- Content Security Policy, block cursor (retro_term, retro_amber), per-line cache, e-ink tone, high-contrast yellow tone.
- New defaults: retro_term, Dark, Mono.
- First-run welcome (drawer open, About expanded).
- Rename to Typewrencher, wrench icon, tagline "Typewrencher wrenches words."
- GitHub Pages deploy through Actions.

## Rejected

- **OpenDyslexic font.** Removed at the owner's request after issues were found. Do not re-add unless asked.
- **File System Access in-place save.**
- **Custom pronunciation file** and an **easter-egg trigger for e-ink.**
- **iOS AutoFill changes.** Leave alone.

## Notes

- Other color-tone ideas (Sepia, Typewriter, Night, Solarized, Nord, Gruvbox, pastel, Blueprint, Forest, punk) are documented only.
- The native Apple app is tracked separately.
- Installed copies keep the old icon and manifest until reinstalled.
