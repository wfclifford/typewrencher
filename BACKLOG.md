# Backlog

Personal working list for Typewrencher. This project does not take issues, pull requests or feature requests; forks are welcome.

**Status key:** Ready (decided, build on "build it") · Idea (documented or proposed, not scheduled) · Testing (shipped, needs verification) · Done · Rejected

## Ready

- **"Done" success label.** Change the `.txt` button label to "Done" on both paths, replacing "Shared" (iOS share sheet) and "Exporting" (downloads). The status line can carry more detail, such as "Done title.txt". Update tests.
- **Version in About.** Show a release number and a build id on the last line of the About section, for example `Version 0.1.12 · build 5af3c9d1`. The release number changes only when a release is cut; the build id changes with every code change, so a copy that is between releases still shows exactly which code it has. Both are automatic. The build id is the short content hash `tools/stamp.js` already computes for `sw.js`. The release number is `0.1.N`: cutting a release is one click on a "Release" workflow (Actions > Run workflow), which takes the next N after the latest `v0.1.*` tag, tags `main` and deploys with that number. The number is written into the built site by `tools/build-site.js`, so nothing is committed to bump it, and a local copy shows `dev`. The injected file must be stamped like the other scripts so offline copies update. A test confirms About shows the injected values. Use the same line in the Mac app later.

## Idea

- **Autism-friendly improvements.** Documented in the Docs artifact "Autism-friendly improvements for Typewrencher".
- **Safari Tab behavior.** Safari skips buttons and toggles by default. Options: a README note, or `tabindex` on the controls (unverified).
- **Node 24 upgrade.** Bump the GitHub Actions versions in `.github/workflows/pages.yml`. Effort is documented in the Docs artifact "Upgrading GitHub Actions to Node 24".

## Testing

- **Keyboard-open Rhymes layout.** Header line plus one or two chip rows, switching at 420px visible height (`kb-tall`). Verified in Chromium only. Needs real iOS and Android devices; the 420px cutoff may need tuning.
- **Live Pages deploy** at the new `typewrencher` address.

## Done

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
