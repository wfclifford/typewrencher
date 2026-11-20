// Typewrencher. Dedicated to the public domain under CC0 1.0 (see LICENSE).
(() => {
  'use strict';
  const defaults = Object.freeze({
    'syl-tone': 'terminal', 'syl-theme': 'dark', 'syl-font': 'mono',
    'syl-textsize': '2', 'syl-wrap': 'on', 'syl-counts': 'off',
    'syl-totals': 'off', 'syl-cmudict-enabled': 'on', 'syl-supplement': 'on', 'syl-rhymes': 'off',
    'syl-rhymes-open': 'on', 'syl-rhymes-type': 'perfect', 'syl-rhymes-include-rich': 'off'
  });
  const options = {
    'syl-tone': ['grey', 'cool', 'warm', 'terminal', 'amber', 'hc-bw', 'hc-yellow', 'eink'],
    'syl-theme': ['system', 'light', 'dark'],
    'syl-font': ['serif', 'sans', 'mono'],
    'syl-rhymes-type': ['perfect', 'near'],
    'syl-textsize': ['0', '1', '2', '3', '4', '5', '6']
  };
  for (const key of ['syl-wrap', 'syl-counts', 'syl-totals', 'syl-cmudict-enabled', 'syl-supplement', 'syl-rhymes', 'syl-rhymes-open', 'syl-rhymes-include-rich']) {
    options[key] = ['on', 'off'];
  }
  globalThis.AppPreferences = {
    defaults,
    create(storage) {
      // 'syl-size' held a position in the earlier six-size list. A smaller size was added at the
      // front, so each saved position moves up one; 'syl-textsize' holds positions in the seven-size list.
      try {
        const old = storage?.getItem('syl-size');
        if (storage && storage.getItem('syl-textsize') === null && /^[0-5]$/.test(old ?? '')) storage.setItem('syl-textsize', String(Number(old) + 1));
      } catch (_) {}
      return {
        get(key) {
          let value = null;
          try { value = storage?.getItem(key); } catch (_) {}
          return options[key]?.includes(value) ? value : defaults[key] ?? null;
        },
        set(key, value) { try { storage?.setItem(key, value); } catch (_) {} }
      };
    }
  };
})();
