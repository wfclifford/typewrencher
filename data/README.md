# Local CMUdict

Put the dictionary here and the app reads it from your own site instead of GitHub:

    data/cmudict.counts.txt    compact syllable counts made from CMUdict (about 1 MB)
    data/CMUdict-LICENSE.txt   CMUdict's license (keep it with the data)
    data/cmudict.json          revision, SHA-256 and fetch date, shown in the app
    data/variable-words.txt    optional supplemental words (see the main README)
    data/wordfreq-en.txt       optional: common words first in the Rhymes panel (CC BY-SA 4.0; tools/wordfreq.js)
    data/cmudict.dict          the full dictionary: needed by the Rhymes panel (loaded only when it is
                               first opened), and used for counts only if the compact file is absent

Make the files with `node tools/cmudict.js fetch` (Node 18+). It downloads CMUdict, checks its
license, and writes the compact file (about 70% smaller than cmudict.dict; counts only, which
is all the app uses), the license and `cmudict.json`. Add `--full` to keep the full
`cmudict.dict` as well; the Rhymes panel needs it (it holds the pronunciations, which the counts file
does not). Check the result with `node tools/cmudict.js check`.

The app tries `cmudict.counts.txt`, then `cmudict.dict`, then (only if neither exists) GitHub,
unless `upstreamFallback` is set to false at the top of `js/dictionary.js`. An existing site with
only `cmudict.dict` keeps working. To switch, upload `cmudict.counts.txt` and the new
`cmudict.json` (keep `cmudict.dict` if you want the Rhymes panel). Visitors with a saved copy keep it
for one visit while the new file downloads in the background.

## Pre-compressed twins (.gz)

Every data file has a `.gz` twin (`cmudict.counts.txt.gz`, `cmudict.dict.gz`, `wordfreq-en.txt.gz`), made by
`tools/cmudict.js fetch` and `tools/wordfreq.js`. The app asks for the twin first and unpacks it itself
with the browser's built-in `DecompressionStream`, so it needs no server setting: about a quarter of the
bytes (counts 1.0 MB to 0.36 MB; full dictionary 3.45 MB to 0.88 MB; frequency list 195 KB to 90 KB), whether or
not your host compresses text. If the twin is missing, damaged, or the browser is too old to unpack it
(before Chrome 80, Safari 16.4, Firefox 113), the app quietly uses the plain file, so upload both. A host that
labels `.gz` files `Content-Encoding: gzip` also works (the browser unpacks them and the app accepts the plain text).
The SHA-256 in `cmudict.json` is of the unpacked text, so it is the same either way. If you edit a data file by hand,
delete its `.gz` twin or regenerate it, because a stale twin would be used instead.

Serve the folder over HTTP (`node serve.js` or any static host): browsers usually refuse
to read this file when index.html is opened straight from disk.

CMUdict is Copyright (C) 1993-2015 Carnegie Mellon University. The license must travel
with the file wherever you copy or deploy it.

## Browser cache

After the first load the parsed dictionary is kept in the visitor's browser (IndexedDB). On
each visit the app fetches only the small `cmudict.json` and compares its `sourceSHA256`
with the cached copy: a match skips the download, a difference downloads the new
file. Re-uploading `cmudict.counts.txt` together with the `cmudict.json` that `fetch` wrote is
therefore all it takes to update everyone: returning visitors keep using their saved copy on that visit while the new one downloads in the background, and get it on their next visit (so counts never change while someone is typing). Reload dictionary applies it at once. A downloaded file that does not match the hash in `cmudict.json` (for example a half-finished FTP upload) is never saved. Without a hash in `cmudict.json` the cache is
kept until the visitor chooses Reload dictionary. A failed refresh never discards a good
cached copy, and a file that is not a usable CMUdict is never cached.

## Progress and messages

While the file downloads, the welcome dialog shows a progress bar with megabytes and a percentage. The percentage needs the server to send `Content-Length` without compression; otherwise it shows megabytes and an indeterminate bar. Failures are reported by cause: no connection, download refused (HTTP error), file not found on the site, file incomplete or damaged. Dictionary Options also shows the entry count, revision, update date and a short SHA-256 of the file in use, which is the quickest way to confirm an upload took effect.
