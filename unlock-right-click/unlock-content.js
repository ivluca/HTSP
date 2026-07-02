// HTSP — Unlock Right-Click & Copy
// Runs in the MAIN world at document_start so its listeners are registered
// before the page's own scripts can install blockers. Re-enables right-click,
// text selection, copy/cut/paste and Ctrl/Cmd keyboard shortcuts on pages that
// try to disable them.
(function () {
  if (window.__htspUnlockApplied) return;
  window.__htspUnlockApplied = true;

  // Stop the page's own handlers from firing (and thus from calling
  // preventDefault) without suppressing the browser's default behaviour.
  const stopHard = (e) => e.stopImmediatePropagation();
  // For keyboard events only interfere with shortcut combos so normal typing
  // on the page keeps working.
  const stopKey = (e) => { if (e.ctrlKey || e.metaKey) e.stopImmediatePropagation(); };

  const hardEvents = [
    'contextmenu', 'selectstart', 'select', 'copy', 'cut', 'paste',
    'beforecopy', 'beforecut', 'beforepaste', 'dragstart', 'drag'
  ];
  const keyEvents = ['keydown', 'keyup', 'keypress'];

  hardEvents.forEach((evt) => {
    window.addEventListener(evt, stopHard, true);
    document.addEventListener(evt, stopHard, true);
  });
  keyEvents.forEach((evt) => {
    window.addEventListener(evt, stopKey, true);
    document.addEventListener(evt, stopKey, true);
  });

  // Neutralise inline on* handlers such as `document.oncontextmenu = ...`.
  const clearProps = [
    'oncontextmenu', 'onselectstart', 'onselect', 'oncopy', 'oncut',
    'onpaste', 'ondragstart', 'onmousedown'
  ];
  const clearHandlers = (el) => {
    if (!el) return;
    clearProps.forEach((p) => { try { el[p] = null; } catch (_) {} });
  };

  // Force user-select back on via injected CSS (overrides `user-select: none`).
  const applyStyle = () => {
    if (document.getElementById('htsp-unlock-style')) return;
    const style = document.createElement('style');
    style.id = 'htsp-unlock-style';
    style.textContent = '*, *::before, *::after {'
      + ' -webkit-user-select: text !important;'
      + ' -moz-user-select: text !important;'
      + ' -ms-user-select: text !important;'
      + ' user-select: text !important; }';
    (document.head || document.documentElement).appendChild(style);
  };

  const applyAll = () => {
    clearHandlers(document);
    clearHandlers(document.documentElement);
    clearHandlers(document.body);
    applyStyle();
  };

  applyStyle();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll, { once: true });
  } else {
    applyAll();
  }
})();
