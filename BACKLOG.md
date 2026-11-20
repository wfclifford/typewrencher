# Backlog

Personal working list for Typewrencher. This project does not take issues, pull requests or feature requests; forks are welcome.

**Status key:** Ready (decided, build on "build it") · Idea (documented or proposed, not scheduled) · Testing (shipped, needs verification) · Done · Rejected

## Ready

## Idea

- **Autism-friendly improvements.** Documented in the Docs artifact "Autism-friendly improvements for Typewrencher".
- **Safari Tab behavior.** Safari skips buttons and toggles by default. Options: a README note, or `tabindex` on the controls (unverified).
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
