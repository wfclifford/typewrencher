// Word Hammer. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(function () {
  'use strict';
  const counter = SyllableCounter.create();
  const lineSyl = text => counter.line(text);
  let preferenceStorage = null;
  try { preferenceStorage = localStorage; } catch (_) {}
  const preferences = AppPreferences.create(preferenceStorage);
  var ed = document.getElementById("ed");
  var gutter = document.getElementById("gutter");
  var counts = document.getElementById("counts");
  var sLines = document.getElementById("sLines");
  var sWords = document.getElementById("sWords");
  var sSyl = document.getElementById("sSyl");
  var statusEl = document.getElementById("status");
  var statusTimer = null;
  function say(msg) {
    clearTimeout(statusTimer);
    statusEl.textContent = "";
    statusTimer = setTimeout(function () { statusEl.textContent = msg; }, 60);
  }

  var wrapOn = true;
  var dictActive = false; // gutter markers only mean something once CMUdict is in use
  var mz = document.getElementById("measure");

  // Copy everything that affects wrapping from the real text box, so the hidden copy breaks lines
  // exactly where the text box does (not just at the same width).
  var COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "letterSpacing",
    "wordSpacing", "textTransform", "textIndent", "tabSize", "lineHeight", "whiteSpace", "overflowWrap", "wordBreak", "textRendering"];
  function lineHeights(lines) {
    var cs = typeof getComputedStyle === "function" ? getComputedStyle(ed) : null, lh = 0;
    if (cs) {
      COPY.forEach(function (k) { if (cs[k]) mz.style[k] = cs[k]; });
      mz.style.paddingLeft = cs.paddingLeft; mz.style.paddingRight = cs.paddingRight;
      lh = parseFloat(cs.lineHeight) || 0;
    }
    mz.style.width = ed.clientWidth + "px";
    // Heights depend only on the line's text and on the box and font, so they are remembered per line
    // and thrown away whenever the width, font, size or spacing changes.
    var sig = ed.clientWidth + "|" + COPY.map(function (k) { return cs ? cs[k] : ""; }).join("|");
    if (sig !== heightSig) { heightCache.clear(); heightSig = sig; }
    var out = new Array(lines.length), need = [], seen = Object.create(null), i;
    for (i = 0; i < lines.length; i++) {
      var known = heightCache.get(lines[i]);
      if (known !== undefined) out[i] = known;
      else if (!seen[lines[i]]) { seen[lines[i]] = true; need.push(lines[i]); }
    }
    if (need.length) {
      var frag = document.createDocumentFragment();
      for (i = 0; i < need.length; i++) {
        var d = document.createElement("div");
        d.textContent = need[i];
        frag.appendChild(d);
      }
      mz.textContent = "";
      mz.appendChild(frag);
      if (heightCache.size > 20000) heightCache.clear();
      for (var j = 0; j < need.length; j++) {
        var h = mz.children[j].getBoundingClientRect().height;
        // A wrapped line is a whole number of text lines. Snap to it so tiny measuring differences
        // (fractional pixels) cannot add up down the page.
        var rows = lh ? Math.max(1, Math.round(h / lh)) : 0;
        heightCache.set(need[j], lh && Math.abs(h - rows * lh) < 1 ? rows * lh : h);
      }
      mz.textContent = "";
      for (i = 0; i < lines.length; i++) if (out[i] === undefined) out[i] = heightCache.get(lines[i]);
    }
    return out;
  }
  var heightCache = new Map(), heightSig = "";

  function render() {
    var lines = ed.value.split("\n"), html = "", total = 0, words = 0, filled = 0, estimated = 0, variable = 0;
    var hs = wrapOn ? lineHeights(lines) : null;
    for (var i = 0; i < lines.length; i++) {
      var r = lineSyl(lines[i]);
      estimated += r.estimated; variable += r.variable;
      var st = hs ? ' style="height:' + hs[i] + 'px"' : "";
      if (r.n) {
        var flags = "", why = "";
        if (dictActive && r.estimated) { flags += '<i class="flag">~</i>'; why += ", " + r.estimated + " estimated"; }
        if (dictActive && r.variable) { flags += '<i class="flag">\u00b1</i>'; why += ", " + r.variable + " variable"; }
        html += "<div role=\"listitem\"" + st + "><b>" + (flags ? '<span class="flags" aria-hidden="true">' + flags + "</span>" : "") + "<span class=\"sr\">Line " + (i + 1) + ", </span>" + r.n + "<span class=\"sr\"> syllable" + (r.n === 1 ? "" : "s") + why + "</span></b></div>";
        total += r.n; words += r.words; filled++;
      }
      else html += "<div aria-hidden=\"true\"" + st + "></div>";
    }
    counts.innerHTML = html;
    Array.from(counts.children).forEach((node, i) => {
      const result = lineSyl(lines[i]); // cached: no recount
      node.title = result.estimated + ' estimated word(s); ' + result.variable + ' word(s) with alternate counts';
    });
    document.getElementById('estCount').textContent = estimated;
    document.getElementById('varCount').textContent = variable;
    sLines.textContent = filled;
    sWords.textContent = words;
    sSyl.textContent = total;
    gutter.scrollTop = ed.scrollTop;
  }

  var saveBtn = document.getElementById("save");
  var saveLabel = document.getElementById("saveLabel");
  var clearBtn = document.getElementById("clearBtn");
  var fname = document.getElementById("fname");
  var savebox = document.getElementById("savebox");
  var downloads = null, resetTimer = null;

  function flash(label) {
    saveLabel.textContent = label;
    say(label);
    saveBtn.setAttribute("aria-label", label);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(function () { saveLabel.textContent = ".txt"; saveBtn.setAttribute("aria-label", "Save as .txt"); }, 2500);
  }
  function fileName() {
    var n = fname.value.replace(/[\u0000-\u001f\\\/:*?"<>|]/g, "").replace(/\.txt$/i, "").replace(/^[\s.]+|[\s.]+$/g, "");
    return (n || "title") + ".txt";
  }
  fname.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
  });
  function syncSave() {
    var empty = ed.value.length === 0;
    saveBtn.setAttribute("aria-disabled", String(empty));
    clearBtn.setAttribute("aria-disabled", String(empty && !fname.value));
  }

  fname.addEventListener("input", syncSave);

  function localSave() {
    var blob = new Blob([exportText()], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    flash("Exporting");
  }

  // iPhone and iPad: the share sheet offers Save to Files (including iCloud Drive) in one tap.
  // Everywhere else the file is downloaded, which is what desktop browsers expect.
  function isIOS() {
    var nav = typeof navigator === "undefined" ? null : navigator;
    return Boolean(nav) && (/iPad|iPhone|iPod/.test(nav.userAgent || "") || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));
  }
  function shareFile() {
    if (typeof File !== "function" || !isIOS() || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return null;
    var file;
    try { file = new File([exportText()], fileName(), { type: "text/plain" }); } catch (_) { return null; }
    var data = { files: [file] };
    try { if (!navigator.canShare(data)) return null; } catch (_) { return null; }
    return navigator.share(data);
  }

  saveBtn.addEventListener("click", function () {
    if (!ed.value) { say("Nothing to save yet."); return; }
    var sharing = downloads ? null : shareFile();
    if (sharing) {
      sharing.then(function () { flash("Shared"); }).catch(function (e) {
        if (e && e.name === "AbortError") return; // the sheet was dismissed
        localSave();
      });
      return;
    }
    if (!downloads) { localSave(); return; }
    downloads.save({ filename: fileName(), data: exportText() }).then(function () {
      flash("Exporting");
    }).catch(function (e) {
      if (e && e.code === "declined") return;
      flash("Couldn\u2019t save");
    });
  });

  // Open a .txt file: from the Open button or by dropping a file on the editor.
  var openBtn = document.getElementById("openBtn"), openFile = document.getElementById("openFile");
  var MAX_OPEN = 5 * 1024 * 1024;
  function decodeText(buffer) {
    var text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch (_) { text = new TextDecoder("windows-1252").decode(buffer); } // older Windows files
    return text.replace(/^\uFEFF/, "");
  }
  function openText(file) {
    if (!file) return;
    if (file.size > MAX_OPEN) { say("That file is too large to open (5 MB limit)."); return; }
    if (!/\.txt$/i.test(file.name || "") && file.type && file.type !== "text/plain") { say("Only .txt files can be opened."); return; }
    if (ed.value && typeof confirm === "function" && !confirm("Replace the current text with " + (file.name || "this file") + "?")) return;
    file.arrayBuffer().then(function (buffer) {
      ed.value = decodeText(buffer).replace(/\r\n?/g, "\n");
      fname.value = (file.name || "").replace(/\.txt$/i, "");
      ed.scrollTop = 0;
      render(); syncSave();
      if (rhymeCtl) rhymeCtl.refresh(); // the rhymed-word mark follows the new text
      say("Opened " + (file.name || "file") + ".");
    }).catch(function () { say("Couldn\u2019t read that file."); });
  }
  openBtn.addEventListener("click", function () { openFile.click(); });
  openFile.addEventListener("change", function () {
    var file = openFile.files && openFile.files[0];
    openFile.value = "";
    openText(file);
  });
  ed.addEventListener("dragover", function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) e.preventDefault();
  });
  ed.addEventListener("drop", function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return; // plain text drops keep their normal behavior
    e.preventDefault();
    openText(files[0]);
  });

  savebox.hidden = false;
  syncSave();

  ed.addEventListener("input", function () { render(); syncSave(); });
  ed.addEventListener("scroll", function () { gutter.scrollTop = ed.scrollTop; });
  var root = document.documentElement;
  var sysTheme = root.getAttribute("data-theme");
  var fontBtns = document.querySelectorAll("[data-font-choice]");
  var themeBtns = document.querySelectorAll("[data-theme-choice]");

  function store(k, v) { preferences.set(k, v); }
  function load(k) { return preferences.get(k); }

  function setFont(f) {
    if (f === "sans" || f === "mono") {
      root.setAttribute("data-font", f);
    } else {
      f = "serif";
      root.removeAttribute("data-font");
    }
    fontBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-font-choice") === f ? "true" : "false");
    });
  }
  function setTheme(t) {
    if (t === "light" || t === "dark") {
      root.setAttribute("data-theme", t);
    } else {
      t = "system";
      if (sysTheme) root.setAttribute("data-theme", sysTheme); else root.removeAttribute("data-theme");
    }
    themeBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-theme-choice") === t ? "true" : "false");
    });
  }

  fontBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var choice = b.getAttribute("data-font-choice");
      setFont(choice);
      store("syl-font", choice);
      render();
    });
  });
  themeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var choice = b.getAttribute("data-theme-choice");
      setTheme(choice);
      store("syl-theme", choice);
    });
  });

  var wrapBtn = document.getElementById("wrapToggle");
  function setWrap(on) {
    wrapOn = on;
    ed.classList.toggle("wrap", on);
    ed.setAttribute("wrap", on ? "soft" : "off");
    wrapBtn.checked = on;
  }
  wrapBtn.addEventListener("change", function () {
    setWrap(wrapBtn.checked);
    store("syl-wrap", wrapBtn.checked ? "on" : "off");
    render();
  });
  window.addEventListener("resize", function () { if (wrapOn) render(); });
  setWrap(load("syl-wrap") !== "off");
  setFont(load("syl-font"));
  setTheme(load("syl-theme"));

  // The mirror layer over the editor draws the rhymed-word mark and, in the retro tones, the block cursor.
  var mirror = (typeof AppMirror !== "undefined" && document.getElementById("hl")) ? AppMirror.create({ textarea: ed, el: document.getElementById("hl") }) : null;
  var toneBtns = document.querySelectorAll("[data-tone-choice]");
  function setTone(t) {
    if (t === "warm" || t === "grey" || t === "terminal" || t === "amber" || t === "hc-bw" || t === "hc-yellow" || t === "eink") {
      root.setAttribute("data-tone", t);
    } else {
      t = "cool";
      root.removeAttribute("data-tone");
    }
    toneBtns.forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-tone-choice") === t ? "true" : "false");
    });
    if (mirror) mirror.setCaret(t === "terminal" || t === "amber"); // block cursor: retro tones only
  }
  toneBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      var choice = b.getAttribute("data-tone-choice");
      setTone(choice);
      store("syl-tone", choice);
    });
  });
  setTone(load("syl-tone"));

  var SIZES = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75];
  var sizeIdx = 2; // scale 1, the default
  var sizeDown = document.getElementById("sizeDown");
  var sizeUp = document.getElementById("sizeUp");
  var sizeLevel = document.getElementById("sizeLevel");
  var sizeDots = document.getElementById("sizeDots");
  // One whole-pixel line height for the text box, the measuring copy and the count rows. A fractional
  // value is rounded differently by each (notably in iPadOS Safari) and the error grows with every line.
  var wideMq = typeof matchMedia === "function" ? matchMedia("(min-width: 800px)") : null;
  function syncLineHeight() {
    if (typeof getComputedStyle !== "function") return;
    var rem = parseFloat(getComputedStyle(root).fontSize) || 16;
    var px = Math.max(1, Math.round((wideMq && wideMq.matches ? 2.3 : 2) * rem * SIZES[sizeIdx]));
    root.style.setProperty("--lh", px + "px");
  }
  function setSize(i) {
    sizeIdx = Math.max(0, Math.min(SIZES.length - 1, i));
    root.style.setProperty("--scale", SIZES[sizeIdx]);
    syncLineHeight();
    sizeDown.disabled = sizeIdx === 0;
    sizeUp.disabled = sizeIdx === SIZES.length - 1;
    sizeLevel.textContent = (sizeIdx + 1) + " of " + SIZES.length;
    sizeDots.setAttribute("data-level", String(sizeIdx + 1));
  }
  function stepSize(d) {
    setSize(sizeIdx + d);
    store("syl-textsize", String(sizeIdx));
    if (sizeDown.disabled && d < 0) sizeUp.focus();
    if (sizeUp.disabled && d > 0) sizeDown.focus();
    render();
  }
  sizeDown.addEventListener("click", function () { stepSize(-1); });
  sizeUp.addEventListener("click", function () { stepSize(1); });
  var savedSize = parseInt(load("syl-textsize"), 10);
  setSize(isNaN(savedSize) ? 2 : savedSize);

  var lastLine = 0;
  document.addEventListener("selectionchange", function () {
    if (document.activeElement !== ed) return;
    var line = ed.value.slice(0, ed.selectionStart).split("\n").length - 1;
    if (line === lastLine) return;
    lastLine = line;
    var n = lineSyl(ed.value.split("\n")[line] || "").n;
    say("Line " + (line + 1) + ": " + n + (n === 1 ? " syllable" : " syllables"));
  });
  ed.addEventListener("blur", function () { lastLine = -1; });

  var countsBtn = document.getElementById("exportCounts");
  var countsOn = load("syl-counts") === "on";
  function setCounts(on) {
    countsOn = on;
    countsBtn.checked = on;
  }
  countsBtn.addEventListener("change", function () {
    setCounts(countsBtn.checked);
    store("syl-counts", countsOn ? "on" : "off");
  });
  setCounts(countsOn);
  var totalsBtn = document.getElementById("exportTotals");
  var totalsOn = load("syl-totals") === "on";
  function setTotals(on) {
    totalsOn = on;
    totalsBtn.checked = on;
  }
  totalsBtn.addEventListener("change", function () {
    setTotals(totalsBtn.checked);
    store("syl-totals", totalsOn ? "on" : "off");
  });
  setTotals(totalsOn);
  function exportText() {
    var lines = ed.value.split("\n"), nLines = 0, nWords = 0, nSyl = 0;
    var out = lines.map(function (l) {
      var r = lineSyl(l);
      if (r.n) { nLines++; nWords += r.words; nSyl += r.n; }
      return countsOn && r.n ? l + "  (" + r.n + ")" : l;
    }).join("\n");
    if (!totalsOn) return out;
    var title = fname.value.replace(/\.txt$/i, "").trim();
    var head = (title ? title + "\n" : "") +
      "Lines: " + nLines + " | Words: " + nWords + " | Syllables: " + nSyl + "\n\n";
    return head + out;
  }

  var clearLabel = document.getElementById("clearLabel");
  var clearTimer = null;
  function disarm() {
    clearTimeout(clearTimer);
    clearBtn.classList.remove("armed");
    clearLabel.textContent = "";
    clearBtn.setAttribute("aria-label", "Erase text and filename");
  }
  function clearAll() {
    AppEditor.clear(ed, fname, document);
    render();
    syncSave();
    if (rhymeCtl) rhymeCtl.refresh();
  }
  clearBtn.addEventListener("click", function () {
    if (!ed.value && !fname.value) { say("Nothing to erase."); return; }
    if (!clearBtn.classList.contains("armed")) {
      clearBtn.classList.add("armed");
      clearLabel.textContent = "Erase text and filename?";
      clearBtn.setAttribute("aria-label", "Press again to erase text and filename");
      clearTimer = setTimeout(disarm, 3000);
      say("Press again to erase text and filename.");
      return;
    }
    disarm();
    clearAll();
    lastLine = 0;
    say("Text and filename erased.");
  });
  clearBtn.addEventListener("blur", disarm);
  syncSave();

  render();
  ed.focus();

  const useDictionary = document.getElementById('useCMUdict');
  const useSupplement = document.getElementById('useSupplement');
  const dictionaryStatus = document.getElementById('dictionaryStatus');
  const dictionaryDetails = document.getElementById('dictionaryDetails');
  const update = document.getElementById('retryDictionary');
  const dictChip = document.getElementById('dictChip');
  const moreBadge = document.getElementById('moreBadge');
  const moreBtn = document.getElementById('moreBtn');
  let loaded = null, supplement = null, busy = false, lastError = '', lastKind = '', updateReady = false;
  const dictNoticeMsg = document.getElementById('dictNoticeMsg');
  const dictNoticeAction = document.getElementById('dictNoticeAction');
  const dictChipShort = document.getElementById('dictChipShort');
  // What to tell the visitor, by what went wrong. The cause cannot always be told apart from the
  // browser, so each wording stays true for either explanation.
  const NOTICES = {
    network: ['Couldn\'t download the dictionary, so counts are estimates.', 'Retry in settings'],
    http: ['The dictionary download was refused, so counts are estimates.', 'Details in settings'],
    missing: ['The dictionary file wasn\'t found on this site, so counts are estimates.', 'Details in settings'],
    invalid: ['The dictionary file is incomplete or damaged, so counts are estimates.', 'Details in settings'],
    license: ['The dictionary\'s license changed, so counts are estimates.', 'Details in settings']
  };

  // Surface dictionary trouble outside the collapsed Dictionary Options section: a footer notice
  // and a badge on the gear (a "!" glyph, so it does not rely on color).
  function syncNotice() {
    const on = useDictionary.checked;
    const failed = on && !busy && !loaded && Boolean(lastError);
    let state, msg, action = '';
    if (!on) { state = 'off'; msg = 'CMUdict off'; }
    else if (busy) { state = 'loading'; msg = loaded ? 'Updating dictionary…' : 'Loading dictionary…'; }
    else if (failed) { state = 'failed'; [msg, action] = NOTICES[lastKind] || ['Dictionary unavailable, so counts are estimates.', 'Fix in settings']; }
    else if (!loaded) { state = 'off'; msg = 'Dictionary not loaded'; }
    else if (lastError) { state = 'warn'; msg = 'Using saved dictionary; update failed'; }
    else { state = 'ready'; msg = 'CMUdict ready'; }
    dictChip.setAttribute('data-state', state);
    dictNoticeMsg.textContent = msg; dictNoticeAction.textContent = action;
    // Short label for one-line phone layouts; the full wording stays in the accessible name and tooltip.
    const short = { loading: 'Loading…', ready: 'Ready', off: 'Off', warn: 'Saved copy', failed: (action || 'Details').split(' ')[0] }[state];
    dictChipShort.textContent = short;
    dictChip.title = msg + (action ? ' ' + action : '');
    dictChip.setAttribute('aria-label', 'Dictionary status: ' + msg + (action ? ' ' + action : '') + '. Open dictionary options.');
    moreBadge.hidden = !failed;
    moreBtn.setAttribute('aria-label', failed ? 'Settings, dictionary unavailable' : 'Settings');
  }
  // Land on a control that is enabled in the current state: Update is disabled while loading or off.
  dictChip.addEventListener('click', () => AppDialogs.drawer.open({ advanced: true, focus: busy || !useDictionary.checked ? 'useCMUdict' : 'retryDictionary' }));
  useDictionary.checked = load('syl-cmudict-enabled') !== 'off';
  useSupplement.checked = load('syl-supplement') !== 'off';

  function applyDictionary() {
    dictActive = Boolean(useDictionary.checked && loaded);
    counter.setDictionary(useDictionary.checked && loaded ? loaded.entries : null, useSupplement.checked ? supplement : null);
    render();
  }

  function showDictionaryState() {
    syncNotice();
    update.disabled = busy || !useDictionary.checked;
    if (!useDictionary.checked) {
      dictionaryStatus.textContent = 'CMUdict is off — all words use estimates.';
      dictionaryDetails.textContent = loaded ? 'Dictionary retained for when you turn it back on.' : 'Turn on to load pronunciation-based counts.';
      return;
    }
    if (busy) return;
    if (loaded) {
      dictionaryStatus.textContent = lastError ? 'Update failed — the saved dictionary remains active.' : 'CMUdict ready' + (loaded.local ? ' · local file' : loaded.cached ? ' · cached' : loaded.persisted ? '' : ' · session only');
      const stamp = [Object.keys(loaded.entries).length.toLocaleString() + ' entries'];
      if (supplement) stamp.push(useSupplement.checked ? '+' + Object.keys(supplement).length.toLocaleString() + ' supplemental words' : 'supplemental words off');
      if (loaded.revision && loaded.revision !== 'local') stamp.push('revision ' + loaded.revision.slice(0, 12));
      const when = loaded.fetchedAt ? new Date(loaded.fetchedAt) : null;
      if (when && !isNaN(when)) stamp.push('updated ' + when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
      if (loaded.sourceSHA256) stamp.push('SHA-256 ' + loaded.sourceSHA256.slice(0, 8));
      if (updateReady) stamp.push('newer version downloaded; it applies on your next visit');
      if (lastError) stamp.push(lastError);
      dictionaryDetails.textContent = stamp.join(' · ');
      dictionaryDetails.title = 'Revision: ' + loaded.revision + '\nSource SHA-256: ' + (loaded.sourceSHA256 || 'unavailable');
    } else {
      dictionaryStatus.textContent = lastError ? 'CMUdict unavailable — all counts are estimates.' : 'Ready to load CMUdict.';
      dictionaryDetails.textContent = lastError || 'No local dictionary file found; the first download requires internet access.';
    }
    update.textContent = loaded ? 'Re-download dictionary' : 'Retry dictionary';
  }

  // Welcome dialog: shown only while the dictionary loads at startup. A load that finishes
  // within WELCOME_DELAY never shows it, and once shown it stays at least WELCOME_MIN so it
  // cannot flash. It closes itself when the load finishes (or fails; the footer notice and
  // the status message then take over) and can be closed by hand at any time.
  const WELCOME_DELAY = 350, WELCOME_MIN = 800;
  const welcomeDlg = document.getElementById('welcomeDlg');
  const welcomeProgress = document.getElementById('welcomeProgress');
  const welcomeBar = document.getElementById('welcomeBar');
  let welcomeTimer = null, welcomeShownAt = 0, welcomeActive = false;
  const welcomeIsOpen = () => welcomeDlg.getAttribute('open') !== null;
  function welcomeShow() {
    welcomeTimer = null;
    if (!welcomeActive || welcomeIsOpen()) return;
    if (typeof welcomeDlg.showModal === 'function') welcomeDlg.showModal(); else welcomeDlg.setAttribute('open', '');
    welcomeShownAt = Date.now();
  }
  function welcomeBegin() {
    welcomeActive = true;
    welcomeTimer = setTimeout(welcomeShow, WELCOME_DELAY);
  }
  function welcomeClose() {
    if (!welcomeIsOpen()) return;
    if (typeof welcomeDlg.close === 'function') welcomeDlg.close(); else welcomeDlg.removeAttribute('open');
    ed.focus({ preventScroll: true });
  }
  function welcomeEnd() {
    if (!welcomeActive) return; // only the first load at startup uses the welcome dialog
    welcomeActive = false;
    clearTimeout(welcomeTimer); welcomeTimer = null;
    if (!welcomeIsOpen()) return;
    const wait = Math.max(0, WELCOME_MIN - (Date.now() - welcomeShownAt));
    if (wait) setTimeout(welcomeClose, wait); else welcomeClose();
  }
  document.getElementById('welcomeClose').addEventListener('click', () => { welcomeActive = false; welcomeClose(); });
  welcomeDlg.addEventListener('click', e => { if (e.target === welcomeDlg) { welcomeActive = false; welcomeClose(); } });
  welcomeDlg.addEventListener('close', () => { welcomeActive = false; ed.focus({ preventScroll: true }); });

  async function loadDictionary(force = false) {
    if (busy || !useDictionary.checked) return;
    busy = true; lastError = ''; lastKind = ''; updateReady = false; update.disabled = true; syncNotice();
    dictionaryStatus.textContent = 'Loading CMUdict…'; dictionaryDetails.textContent = '';
    try {
      loaded = await CMUDictionary.load((message, fraction, tick) => {
        // Byte-count ticks only go to the dialog; the polite status region hears stage changes only.
        if (!tick && useDictionary.checked) dictionaryStatus.textContent = message;
        welcomeProgress.textContent = message;
        if (typeof fraction === 'number') welcomeBar.setAttribute('value', String(Math.round(fraction * 100)));
        else welcomeBar.removeAttribute('value');
      }, force);
      try {
        const res = await fetch('data/variable-words.txt', { cache: 'no-cache' });
        const text = res.ok ? await res.text() : '';
        supplement = /^\s*</.test(text) ? null : SyllableCounter.parseSupplement(text);
        if (supplement && !Object.keys(supplement).length) supplement = null;
      } catch (_) { supplement = null; }
      if (loaded.refreshError) lastError = loaded.refreshError;
      if (loaded.refresh) loaded.refresh.then(ok => { if (ok) { updateReady = true; showDictionaryState(); } });
      if (useDictionary.checked) say(loaded.refreshError ? 'Using the saved dictionary. The update failed.' : 'CMUdict ready. Counts updated.');
    } catch(error) {
      lastError = error.message; lastKind = error.kind || '';
      if (useDictionary.checked) say((NOTICES[lastKind] || ['Dictionary unavailable. Counts are estimates.'])[0] + ' Open Settings, then Dictionary Options, for details.');
    } finally { busy = false; applyDictionary(); showDictionaryState(); welcomeEnd(); }
  }

  // ---- Rhymes: a dock under the editor. The pronunciation data is only fetched when it is first opened.
  const rhymeToggle = document.getElementById('rhymeToggle'), rhymePanel = document.getElementById('rhymePanel');
  let rhymeCtl = null, rhymeBusy = false;
  function rhymeMessage(text, retry) {
    rhymePanel.textContent = '';
    const p = document.createElement('p'); p.className = 'rhyme-empty'; p.textContent = text; rhymePanel.appendChild(p);
    if (retry) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tog'; b.textContent = 'Try again';
      b.addEventListener('click', loadRhymes); rhymePanel.appendChild(b);
    }
    return p;
  }
  async function loadRhymes() {
    if (rhymeCtl) { rhymeCtl.refresh(); return; }
    if (rhymeBusy) return;
    rhymeBusy = true; const status = rhymeMessage('Loading rhyme data\u2026');
    try {
      const text = await CMUDictionary.pronunciations(message => { status.textContent = message; });
      status.textContent = 'Preparing rhymes\u2026';
      const rhymeDict = await Rhymes.parseAsync(text, fraction => { status.textContent = 'Preparing rhymes\u2026 ' + Math.round(fraction * 100) + '%'; });
      if (!rhymeDict.pron || rhymeDict.pron.size < 100000) throw new Error('The rhyme data is not a full CMUdict.');
      // Optional: common words first. Without the file the lists are simply alphabetical.
      try {
        const freq = await CMUDictionary.fetchText('data/wordfreq-en.txt');
        if (freq && !/^\s*</.test(freq)) rhymeDict.setFrequency(Rhymes.parseFrequency(freq));
      } catch (_) {}
      rhymeCtl = RhymePanel.attach(Object.assign({ textarea: ed, container: rhymePanel, dict: rhymeDict, say, mirror: mirror, highlightOn: rhymesShown(), onTitle: setRhymeTitle }, rhymeSettings()));
    } catch (error) {
      rhymeMessage((error && error.message) || 'Couldn\u2019t load rhyme data.', true);
    } finally { rhymeBusy = false; }
  }
  const rhymeDock = document.getElementById('rhymeDock'), rhymesEnabled = document.getElementById('rhymesEnabled');
  const rhymeOptions = document.getElementById('rhymeOptions');
  const rhymeNear = document.getElementById('rhymeNear'), rhymeRich = document.getElementById('rhymeRich');
  let rhymeType = 'perfect';
  // The dock's one-line label names the word being checked, so the panel can stay collapsed.
  const rhymeLabel = document.getElementById('rhymeLabel');
  function setRhymeTitle(info) {
    if (!rhymeLabel) return;
    rhymeLabel.textContent = info ? 'Rhymes \u00b7 ' + info.word + (info.detail ? ' \u00b7 ' + info.count : '') : 'Rhymes';
    if (info && info.detail) rhymeToggle.setAttribute('title', info.detail); else rhymeToggle.removeAttribute('title');
  }
  // The word is marked in the text only while the Rhymes panel is on and open.
  function rhymesShown() { return rhymesEnabled.checked && rhymeToggle.getAttribute('aria-expanded') === 'true'; }
  function syncRhymeHighlight() { if (rhymeCtl && rhymeCtl.setHighlight) rhymeCtl.setHighlight(rhymesShown()); }
  function rhymeSettings() { return { mode: rhymeType, strict: !rhymeRich.checked }; }
  function setRhymeType(t, persist) {
    rhymeType = t === 'near' ? 'near' : 'perfect';
    rhymeNear.checked = rhymeType === 'near'; // the switch reads "Include near rhymes"
    if (persist) store('syl-rhymes-type', rhymeType);
    if (rhymeCtl) rhymeCtl.setOptions(rhymeSettings());
  }
  function setRhymeOpen(open, persist) {
    rhymeToggle.setAttribute('aria-expanded', String(open));
    rhymePanel.hidden = !open;
    syncRhymeHighlight();
    if (persist) store('syl-rhymes-open', open ? 'on' : 'off');
  }
  function setRhymes(enabled, persist) {
    rhymesEnabled.checked = enabled;
    rhymeOptions.hidden = !enabled;
    rhymeDock.hidden = !enabled;
    syncRhymeHighlight();
    if (persist) store('syl-rhymes', enabled ? 'on' : 'off');
    if (enabled) loadRhymes(); // the dictionary loads when Rhymes is enabled, even if the panel is collapsed
  }
  rhymeToggle.addEventListener('click', () => setRhymeOpen(rhymeToggle.getAttribute('aria-expanded') !== 'true', true));
  rhymesEnabled.addEventListener('change', () => setRhymes(rhymesEnabled.checked, true));
  rhymeNear.addEventListener('change', () => setRhymeType(rhymeNear.checked ? 'near' : 'perfect', true));
  rhymeRich.addEventListener('change', () => { store('syl-rhymes-include-rich', rhymeRich.checked ? 'on' : 'off'); if (rhymeCtl) rhymeCtl.setOptions(rhymeSettings()); });
  function applyRhymePrefs(get) {
    rhymeRich.checked = get('syl-rhymes-include-rich') === 'on';
    setRhymeType(get('syl-rhymes-type'), false);
    setRhymeOpen(get('syl-rhymes-open') !== 'off', false);
    setRhymes(get('syl-rhymes') === 'on', false);
  }
  applyRhymePrefs(load);

  useSupplement.addEventListener('change', () => {
    store('syl-supplement', useSupplement.checked ? 'on' : 'off');
    applyDictionary(); showDictionaryState();
    say(useSupplement.checked ? 'Supplemental words on.' : 'Supplemental words off.');
  });
  useDictionary.addEventListener('change', () => {
    store('syl-cmudict-enabled', useDictionary.checked ? 'on' : 'off');
    applyDictionary();
    if (useDictionary.checked && !loaded && !busy) loadDictionary();
    else {
      if (useDictionary.checked && busy) { dictionaryStatus.textContent = 'Loading CMUdict…'; dictionaryDetails.textContent = ''; }
      showDictionaryState();
      syncNotice();
    }
  });
  update.addEventListener('click', () => loadDictionary(true));
  // Word lists behind the footer's "estimated" and "variable" counts.
  const wordsDlg = document.getElementById('wordsDlg');
  const wordsList = document.getElementById('wordsList');
  let wordsOpener = null;
  const esc = t => t.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  // Same tokenizing as the counter, so the totals here match the footer counts.
  function wordReport(kind) {
    const found = new Map();
    ed.value.split('\n').forEach((text, i) => {
      const tokens = text.normalize('NFC').replace(/[\u2019\u2018]/g, "'").match(/\p{L}+(?:'\p{L}+)*/gu) || [];
      tokens.forEach(token => {
        const r = counter.word(token);
        if (!(kind === 'estimated' ? r.estimated : r.variable)) return;
        const key = token.toLowerCase();
        const entry = found.get(key) || { word: key, r, line: i + 1, times: 0 };
        entry.times++;
        found.set(key, entry);
      });
    });
    return Array.from(found.values());
  }

  function wordNote(e, kind) {
    let note = 'Counted as ' + plural(e.r.n, 'syllable', 'syllables');
    if (kind === 'estimated') note += ' (estimate)';
    else note += ' · also ' + e.r.counts.filter(c => c !== e.r.n).join(' or ');
    return note + ' · first on line ' + e.line + ' · ' + plural(e.times, 'use', 'uses');
  }

  function openWords(kind, opener) {
    const list = wordReport(kind), estimated = kind === 'estimated';
    wordsOpener = opener;
    document.getElementById('wordsTitle').textContent = estimated ? 'Estimated words' : 'Variable words';
    document.getElementById('wordsIntro').textContent = estimated
      ? (useDictionary.checked && loaded
        ? 'These words are not in CMUdict, so each count is a guess based on spelling.'
        : 'CMUdict is off or not loaded, so every word is estimated from its spelling.')
      : 'CMUdict lists more than one pronunciation for these words, with different syllable counts. The first listed count is used.';
    const uses = list.reduce((sum, e) => sum + e.times, 0);
    document.getElementById('wordsSummary').textContent = list.length
      ? plural(list.length, 'word', 'words') + ' · ' + plural(uses, 'use', 'uses') + ' in this document'
      : 'No ' + kind + ' words in this document.';
    wordsList.innerHTML = list.map(e => '<li><span class="w-word">' + esc(e.word) + '</span><span class="w-note">' + esc(wordNote(e, kind)) + '</span></li>').join('');
    if (typeof wordsDlg.showModal === 'function') wordsDlg.showModal(); else wordsDlg.setAttribute('open', '');
    wordsDlg.scrollTop = 0;
  }
  function closeWords() {
    if (typeof wordsDlg.close === 'function') wordsDlg.close(); else wordsDlg.removeAttribute('open');
    if (wordsOpener) wordsOpener.focus();
  }
  document.getElementById('estBtn').addEventListener('click', e => openWords('estimated', e.currentTarget || document.getElementById('estBtn')));
  document.getElementById('varBtn').addEventListener('click', e => openWords('variable', e.currentTarget || document.getElementById('varBtn')));
  document.getElementById('wordsClose').addEventListener('click', closeWords);
  // A click on the dialog element itself is a click on the backdrop.
  wordsDlg.addEventListener('click', e => { if (e.target === wordsDlg) closeWords(); });
  wordsDlg.addEventListener('close', () => { if (wordsOpener) wordsOpener.focus(); });
  document.getElementById('resetPrefs').addEventListener('click', () => {
    const d = AppPreferences.defaults;
    Object.keys(d).forEach(k => store(k, d[k]));
    setWrap(d['syl-wrap'] !== 'off'); setFont(d['syl-font']); setTheme(d['syl-theme']); setTone(d['syl-tone']);
    setSize(parseInt(d['syl-textsize'], 10));
    setCounts(d['syl-counts'] === 'on'); setTotals(d['syl-totals'] === 'on');
    useDictionary.checked = d['syl-cmudict-enabled'] !== 'off';
    useSupplement.checked = d['syl-supplement'] !== 'off';
    applyRhymePrefs(k => d[k]);
    applyDictionary();
    if (useDictionary.checked && !loaded && !busy) loadDictionary(); else showDictionaryState();
    render();
    say('Settings reset to defaults.');
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (wrapOn) render(); }).observe(ed);
  // Anything that changes how lines wrap or how tall they are: re-measure.
  const remeasure = () => { syncLineHeight(); render(); };
  if (wideMq && typeof wideMq.addEventListener === 'function') wideMq.addEventListener('change', remeasure);
  if (typeof window.addEventListener === 'function') window.addEventListener('orientationchange', remeasure);
  if (typeof visualViewport !== 'undefined' && visualViewport && visualViewport.addEventListener) visualViewport.addEventListener('resize', () => { if (wrapOn) render(); });
  // On-screen keyboard: when little height is left, pin the app to the visible area (html.kb) so the editor
  // keeps a few lines and the Rhymes panel becomes one row of chips just above the keyboard.
  function syncKeyboard() {
    const vv = typeof visualViewport !== 'undefined' ? visualViewport : null, root = document.documentElement;
    if (!vv || !root) return;
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const covered = (typeof innerHeight === 'number' ? innerHeight : vv.height) - vv.height;
    const on = !!touch && (vv.scale || 1) < 1.05 && (vv.height < 520 || covered > 120);
    root.classList.toggle('kb', on);
    if (on) { root.style.setProperty('--vvh', Math.round(vv.height) + 'px'); root.style.setProperty('--vvt', Math.round(vv.offsetTop || 0) + 'px'); }
    else { root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt'); }
  }
  if (typeof visualViewport !== 'undefined' && visualViewport && visualViewport.addEventListener) {
    visualViewport.addEventListener('resize', syncKeyboard); visualViewport.addEventListener('scroll', syncKeyboard);
    syncKeyboard();
  }
  if (typeof document.fonts !== 'undefined' && document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(remeasure);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', remeasure);
  }
  // First run only: open Settings once with About expanded (and Display collapsed so About is in view). "First run" means
  // nothing of ours is saved yet; the flag is saved at once, even for a returning visitor, so this never repeats. It is
  // not part of the preferences, so Reset to defaults leaves it alone. If storage cannot be written, nothing opens.
  function firstRun() {
    try {
      var s = preferenceStorage;
      if (!s || typeof s.key !== "function" || s.getItem("syl-welcomed") !== null) return false;
      var saved = false;
      for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf("syl-") === 0) saved = true; }
      s.setItem("syl-welcomed", "1");
      return !saved && s.getItem("syl-welcomed") === "1";
    } catch (_) { return false; }
  }
  var welcomed = firstRun();
  if (welcomed) {
    document.getElementById('displayAcc').removeAttribute('open');
    document.getElementById('aboutAcc').setAttribute('open', '');
    AppDialogs.drawer.open();
  }
  if (useDictionary.checked) { if (!welcomed) welcomeBegin(); loadDictionary(); } else showDictionaryState();
  // Offline support: the worker saves the app's files so it opens with no connection after one visit.
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
