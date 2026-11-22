# Typewrencher™

**Typewrencher wrenches words.**

Typewrencher is a small, private writing tool. Type or paste text and it shows the syllable count for every line, with running totals, and can suggest rhymes for the word you are on. It is plain HTML, CSS and JavaScript: no build step, no framework, no account, no tracking. Your text never leaves your device, unless you explicitly export it to a cloud drive or other device.

## Features

- **Syllables per line.** A count sits beside each line and stays aligned with it at any font and text size, including when lines wrap.
- **Totals.** The footer shows lines, words and syllables.
- **Dictionary-backed.** Counts come from [CMUdict](http://www.speech.cs.cmu.edu/cgi-bin/cmudict), plus a supplemental list for words whose count varies (*poem*, for example). Words in neither list are estimated.
- **Honest markers.** A `~` beside a count means it includes an estimated word. A `±` means it includes a word with more than one valid count. The **estimated** and **variable** buttons in the footer list those words, where each first appears and how often.
- **Rhymes (optional).** Turn on *Show rhymes* in Settings. A panel follows your caret (or the selected word) and lists rhymes grouped by syllable count, most common words first. Click or tap a word to replace the one you are on, keeping its capitalization. Shift-click copies it. The word being checked is highlighted in your text.
  - *Include near rhymes* adds words that share the stressed vowel (off by default: exact rhymes only).
  - *Include rich rhymes* adds words that share the same starting sound (*bread/red*; off by default).
- **Open and export `.txt`.** Optionally add the syllable count to each exported line and a lines/words/syllables summary at the top. Exports with either start with a `Typewrencher Export: <name>` line; when you open one in a browser the counts and header come out automatically, and in the Mac app (or for an older export without that line) a bar offers to remove them. The app cannot save back over the file you opened, so each export is a new download. In Safari, set “Ask for each download” in Settings, General, to choose a location and replace an existing file.
- **Look and feel.** Color tones (Warm, Cool, Grey, B&W, High contrast, e-ink, retro_term, retro_amber), Light/Dark/System theme, Serif/Sans/Mono fonts (first-time visitors get retro_term, Dark and Mono; Reset to defaults returns to those), seven text sizes, line wrapping on or off. B&W, High contrast, e-ink, retro_term and retro_amber are strictly monochrome; the retro tones draw a blinking block cursor.
- **Accessible.** Palettes are tested for WCAG 2.2 AA contrast. Targets are at least 44px on touch. Switch state is not color-only, and animation respects reduced motion.
- **Installable and offline.** Add it to your Dock or Home Screen. Go online and open the app once so the syllable dictionary downloads and is saved. After that it works with no connection. The rhyme dictionary (about 3.5 MB) and word-frequency list are saved only after you turn on *Show rhymes* while online, so do that before going offline if you want rhymes there. If a dictionary was never downloaded, counts fall back to estimates and rhymes are unavailable.

## Run it

There is nothing to install. Open `index.html` in a browser, or serve the folder so the dictionary and service worker work:

```sh
node serve.js
# then open the address it prints
```

Any static host works (GitHub Pages, Netlify, plain FTP). Service workers need HTTPS or `localhost`.

## Project layout

```
index.html              the app
css/styles.css          all styles (tones, themes, sizes via CSS variables)
js/
  app.js                UI wiring, counts, settings, export
  counter.js            syllable counting and estimation
  dictionary.js         CMUdict loading and caching
  rhymes.js             rhyme index and lookup
  rhymes-ui.js          the Rhymes panel
  mirror.js             the text mirror layer: rhymed-word mark and retro block cursor
  host.js               bridge to the planned Mac app's web view; does nothing in a browser
  version.js            release number and build id, shown on the last line of About (kept current by tools/)
  editor.js dialogs.js preferences.js license.js
data/                   CMUdict counts, full CMUdict, supplemental list, word frequencies (+ .gz twins)
icons/ manifest.webmanifest sw.js    install and offline support
tools/                  data builders, the release stamper, and build-site.js (the files GitHub Pages publishes)
tests/app.test.js       test suite
LICENSE  THIRD_PARTY_NOTICES.md
```

## Development

```sh
node tests/app.test.js      # run the tests (a recent Node, no dependencies)
node tools/stamp.js         # after ANY change: stamps ?v= hashes and rewrites the offline file list in sw.js
node tools/stamp.js --check # fails if the stamps are stale (use in CI)
```

Always run `node tools/stamp.js` before publishing. A GitHub Actions workflow (`.github/workflows/pages.yml`) runs the stamp check and the tests on every push and pull request, and publishes to GitHub Pages from `main` (set Settings, Pages, Source to “GitHub Actions”). It keeps browsers and the offline cache from serving stale files.

### Data

| File | Purpose | Rebuild |
| --- | --- | --- |
| `data/cmudict.counts.txt` | Compact syllable counts (about 1 MB) | `node tools/cmudict.js fetch` |
| `data/cmudict.dict` | Full CMUdict with phonemes, used by Rhymes | `node tools/cmudict.js fetch --full` |
| `data/variable-words.txt` | Words whose count varies | edit by hand |
| `data/wordfreq-en.txt` | 25,000 words by frequency, for ranking rhymes | `node tools/wordfreq.js <json>` |

The app prefers the `.gz` twin of each data file and falls back to the plain file. Rebuild the twins whenever you change a data file. See `data/README.md`.

### Releasing

Upload `sw.js`, `manifest.webmanifest`, `icons/`, the css/js and data files first and `index.html` last. Visitors replace their saved copy on the next visit. If your host caches `sw.js` for a long time, updates reach visitors late.

## Privacy

Everything runs in your browser, under a Content Security Policy that allows only the app's own files. Your text is never uploaded by the app. It leaves your device only if you explicitly export it, for example to a cloud drive or another device. Preferences are stored in `localStorage`, and dictionaries are cached in the browser. The only network requests are for the app's own files.

## Contributions and forks

Forks are welcome. Typewrencher is released under CC0, so you can copy it and make your own version, for any purpose, with no credit required. I am not accepting pull requests, issues or feature requests for this project.

If you publish a fork, please give it its own name and icon. The Typewrencher name, ™ mark and wrench icon are not covered by CC0, and a different name keeps your version from being mistaken for this one. Keep the CMUdict and word-frequency notices with the data (see License below).

## License

The application code and the supplemental word list are dedicated to the public domain under [CC0 1.0](LICENSE). Third-party material keeps its own license, and its notices must travel with it:

- **CMUdict** (Carnegie Mellon University, BSD-style): `data/CMUdict-LICENSE.txt` and the notice in *Settings, Dictionary Options*.
- **Word frequencies** (`data/wordfreq-en.txt`, from [wordfreq](https://github.com/LuminosoInsight/wordfreq), CC BY-SA 4.0): keep the file header and the credit in Settings. ShareAlike applies to that list only, not to the code.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The Typewrencher name, ™ mark and wrench icon are not covered by CC0.
