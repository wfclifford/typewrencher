// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  const root = document.documentElement;
  const button = document.getElementById('moreBtn');
  const panel = document.getElementById('morePanel');
  const closeButton = document.getElementById('moreClose');
  const title = document.getElementById('drawerTitle');
  const query = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(min-width: 900px)') : null;
  let docked = false;

  const isOpen = () => panel.getAttribute('open') !== null;

  function sync(open) {
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open && docked) root.setAttribute('data-drawer', 'docked');
    else root.removeAttribute('data-drawer');
  }

  // Wide screens: a non-modal drawer docked beside the editor, which stays usable.
  // Narrow screens: a modal drawer with a backdrop.
  function show() {
    docked = Boolean(query && query.matches);
    if (docked && typeof panel.show === 'function') panel.show();
    else if (typeof panel.showModal === 'function') { docked = false; panel.showModal(); }
    else panel.setAttribute('open', '');
    sync(true);
  }

  function open(options = {}) {
    if (!isOpen()) show();
    if (options.advanced) document.getElementById('advancedAcc').setAttribute('open', '');
    const target = (options.focus && document.getElementById(options.focus)) || title;
    target.focus({ preventScroll: !options.focus });
  }

  function dismiss() {
    if (typeof panel.close === 'function') panel.close();
    else panel.removeAttribute('open');
    sync(false);
    button.focus();
  }

  button.addEventListener('click', () => (isOpen() ? dismiss() : open()));
  closeButton.addEventListener('click', dismiss);
  // A click on the dialog element itself is a click on the modal backdrop.
  panel.addEventListener('click', event => { if (!docked && event.target === panel) dismiss(); });
  // Modal dialogs close on Escape natively; a docked (non-modal) one needs this.
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && docked && isOpen()) { event.preventDefault(); dismiss(); }
  });
  panel.addEventListener('close', () => {
    if (isOpen()) return; // closed only to switch between docked and modal
    sync(false);
    button.focus();
  });
  if (query && typeof query.addEventListener === 'function') {
    query.addEventListener('change', () => {
      if (!isOpen()) return;
      const active = document.activeElement;
      const hadFocus = typeof panel.contains === 'function' && panel.contains(active);
      if (typeof panel.close === 'function') panel.close(); else panel.removeAttribute('open');
      show();
      if (hadFocus && active) active.focus();
    });
  }

  // Swipe right to close. Optional: Close, Escape and the backdrop all do the same.
  let drag = null;
  panel.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && isOpen()) drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, live: false };
  });
  panel.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.live) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // scrolling
      if (dx > 12 && dx > Math.abs(dy)) drag.live = true; else return;
    }
    drag.dx = Math.max(0, dx);
    panel.style.transition = 'none';
    panel.style.transform = 'translateX(' + drag.dx + 'px)';
  });
  function endDrag(event, allowClose) {
    if (!drag || event.pointerId !== drag.id) return;
    const { dx, live } = drag;
    drag = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (allowClose && live && dx > Math.min(120, (panel.offsetWidth || 400) * 0.3)) dismiss();
  }
  panel.addEventListener('pointerup', event => endDrag(event, true));
  panel.addEventListener('pointercancel', event => endDrag(event, false));

  globalThis.AppDialogs = { drawer: { open, close: dismiss, isOpen } };

  // The notice is hard-wrapped at ~70 columns. Join the lines inside each paragraph for
  // display so it wraps to the drawer width; the stored text itself is untouched.
  const reflow = text => text.trim().split(/\n\s*\n/).map(para => para.replace(/\s*\n\s*/g, ' ')).join('\n\n');
  document.getElementById('advancedLicense').textContent = reflow(CMU_LICENSE);

  // The accordions sit at the bottom of the drawer and open downward: bring them into view.
  for (const id of ['aboutAcc', 'displayAcc', 'exportAcc', 'advancedAcc']) {
    const acc = document.getElementById(id);
    acc.addEventListener('toggle', () => {
      if (!acc.open || typeof acc.scrollIntoView !== 'function') return;
      const calm = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
      acc.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    });
  }
})();
