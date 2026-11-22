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

- **Mac app: move Open between the files drawer and New.** In the Mac app's top controls, put the Open button between the files drawer button and the "+" (New) button. The order becomes: files drawer, Open, +, name field, Export, Settings. Mac app only: browsers keep their current layout. Update tests.
- **Lock Rhymes height.** Settings toggle (per-device, off by default) that holds the Rhymes panel at its tallest setting even when there are few or no rhymes, so the editor above it stops resizing while typing. Desktop layout: panel `max-height` is 9rem in `.rhyme-panel`, so give it that as a fixed height when locked. Keyboard-open layout (`html.kb`): the tall row set is `max-height: 4.7rem` under `kb-tall`; lock it to that only when `kb-tall` applies, never on short viewports, and keep the editor's three-line minimum. Only when the panel is open. Follow the existing settings pattern, add the toggle to the drawer, and add tests. Check on real iOS devices; the keyboard-open layout is still unverified there.
- **Width controls (desktop and tablet).** Settings control with a few fixed steps (Narrow, Standard, Wide; Standard equals today) that widens the UI and line length. Today `.app` has `max-width: 62rem`; drive that from an app-wide per-device setting. Show it only on wide screens (desktop, Mac, iPad); hide it on phones and narrow windows. Check that the syllable gutter, line wrapping and per-line counts stay aligned at every step, font and size. Standard must look exactly as it does now. Add tests.

## Idea

- **Autism-friendly improvements.** Documented in the Docs artifact "Autism-friendly improvements for Typewrencher".
- **Safari Tab behavior.** Safari skips buttons and toggles by default. In-app fix only (no README note or browser-settings instructions), such as `tabindex` on the controls. Unverified in Safari.
- **Node 24 upgrade.** Bump the GitHub Actions versions in `.github/workflows/pages.yml`. Effort is documented in the Docs artifact "Upgrading GitHub Actions to Node 24".

## Testing

- **Keyboard-open Rhymes layout.** Header line plus one or two chip rows, switching at 420px visible height (`kb-tall`). Verified in Chromium only. Needs real iOS and Android devices; the 420px cutoff may need tuning.
- **Live Pages deploy** at the new `typewrencher` address.

## Done

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
