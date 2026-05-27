// Read Receipt Blocker — ISOLATED world bridge script
// Has access to chrome.storage and chrome.runtime
// Bridges state to the MAIN world via CustomEvent

(function () {
  'use strict';

  function pushState(enabled, typingBlocked) {
    document.documentElement.setAttribute('data-rrb-enabled', enabled ? 'true' : 'false');
    document.documentElement.setAttribute('data-typing-blocked', typingBlocked ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('__rrb_state__', { detail: { enabled, typingBlocked } }));
  }

  // Push initial state as soon as possible
  chrome.storage.local.get(['rrbEnabled', 'typingBlocked'], (data) => {
    pushState(data.rrbEnabled ?? false, data.typingBlocked ?? false);
  });

  // React to toggle changes from the side panel in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if ('rrbEnabled' in changes || 'typingBlocked' in changes) {
      chrome.storage.local.get(['rrbEnabled', 'typingBlocked'], (data) => {
        pushState(data.rrbEnabled ?? false, data.typingBlocked ?? false);
      });
    }
  });

  // Listen for block events from the MAIN world and relay to service worker
  window.addEventListener('__rrb_blocked__', () => {
    try {
      if (!chrome.runtime?.id) return;
      chrome.storage.local.get('rrbBlockedTotal', (data) => {
        if (!chrome.runtime?.id) return;
        const total = (data.rrbBlockedTotal ?? 0) + 1;
        chrome.storage.local.set({ rrbBlockedTotal: total });
        chrome.runtime.sendMessage({ type: 'RRB_BLOCKED', total, session: 0 }).catch(() => {});
      });
    } catch (err) {
      // Ignore extension context invalidated errors after reload
    }
  });

})();
