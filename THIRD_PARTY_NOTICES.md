# Third-party notices

Typewrencher's own code and its supplemental word list are dedicated to the public domain under CC0 1.0
(see LICENSE). The material below is NOT covered by that dedication: it keeps its own license, and its
notices must stay with it.

## CMUdict

Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.

Source: https://github.com/cmusphinx/cmudict

The full copyright notice, conditions, acknowledgments and warranty/liability
disclaimer are in licenses/CMUdict-LICENSE.txt and js/license.js, and displayed in
Dictionary Options > Attribution & license. Keep the full notices and license in
source distributions, deployments, and distributions of derived syllable counts.
For binary-form distributions reproduce them in accompanying documentation and/or
other materials. No endorsement by CMUdict's authors is implied. Its license does
not automatically apply to unrelated application code.

The compact data/cmudict.counts.txt is a derived work containing only syllable counts; its header
carries the copyright line and data/CMUdict-LICENSE.txt must travel with it. The Rhymes panel reads
the full data/cmudict.dict (pronunciations) only when it is first opened and builds an in-memory
rhyme index from it (js/rhymes.js); that file is likewise CMUdict itself, so keep the same license with it.

If data/cmudict.dict is installed, the browser reads it from this site and derives ordered
unique syllable-count arrays from it; keep data/CMUdict-LICENSE.txt with that file, and
note that deploying or distributing it is redistribution of CMUdict. Otherwise the
browser fetches dictionary and license from the same resolved upstream commit, verifies
the license against the bundled notice, and derives the same arrays. Cached data includes the license, exact revision, source URL,
fetch date, and source SHA-256 when Web Crypto is available. If extracting and
redistributing cached counts, include the full applicable notices and license.

## wordfreq (word frequencies)

data/wordfreq-en.txt is the 25,000 most frequent English words from the wordfreq library
(https://github.com/LuminosoInsight/wordfreq, via https://github.com/aparrish/wordfreq-en-25000),
used by the Rhymes panel to list common words first. The data is licensed Creative Commons
Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). It was changed: the
log-frequencies were removed and only the order kept (tools/wordfreq.js). Keep the file's header and this
notice with it. The ShareAlike condition applies to the word list, not to the application code. The upstream
repository's README did not include a license file in the copy supplied; the license above is the one stated on
the repository page and by wordfreq, so confirm it before redistribution. wordfreq's own sources (Wikipedia,
subtitles, news, Google Books, web text, Twitter, Reddit) have their own terms; see its documentation.

## Original UI

The user-provided index.html had no explicit license. Its UI and portions of its
heuristic and interaction code are retained and modified. This package does not
assert ownership, relicense that original code, or grant permission to redistribute
it. Confirm the original owner's permissions before redistribution. No third-party
runtime packages, UI libraries, CDN scripts or downloaded fonts are included.
