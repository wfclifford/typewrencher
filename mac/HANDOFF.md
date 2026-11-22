# Mac app handoff

This file is how the planning chat and the coding session pass work to each other through the repo. The planning chat writes the task; the coding session does it and fills in **Results**. Read `CLAUDE.md` in the repo root first.

How to use it: pull `main`, read the task below, do it on a branch, then fill in Results in the same branch and open a pull request. Do not merge it.

## Task: check the new header order in the running Mac app

Status: ready. The web change is in the pull request "Mac app: move Open between the files drawer and New". Check it on the Mac and report; fix only what is broken.

What changed (web only, no Swift or bridge change): in the Mac app, `js/app.js` moves the Open button in the header, in front of the New ("+") button, when the host bridge is active. Browsers are unchanged (screenshots in headless Chrome at 420 and 1000 px show Open still beside the name field there).

Target order, left to right: files drawer, Open, +, name field, Export, Settings.

Do this:

1. Pull the branch, run `node tools/build-site.js mac/Typewrencher/site`, build and run the app.
2. Confirm the order above at a wide window and at the narrowest window width the app allows. Report whether anything wraps or overlaps, and where.
3. Press Tab from the text area backwards and forwards: focus should visit files drawer, Open, +, name, Export, Settings in that order. VoiceOver should read Open as "Open a document".
4. Click Open: the native panel still appears and opening a file still switches the document. Click "+" and the files drawer button to confirm they still work.
5. Check each color theme for button spacing and focus rings on the moved button.
6. Do not claim anything you did not run on the Mac. If a check fails, report the exact observation.

Fill in Results below on the same branch, push, and do not merge.

## Results

(none yet; earlier results are in the history of pull request 19)
