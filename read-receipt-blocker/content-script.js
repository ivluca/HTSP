// Read Receipt Blocker — Content Script
// Injected into chat.google.com and mail.google.com
// Overrides fetch() to block read-state update requests

(function () {
  'use strict';

  // URL/path patterns that trigger read receipts in Google Chat
  // Covers both REST and gRPC-Web style endpoints
  const BLOCK_PATTERNS = [
    /spaceReadState/i,
    /UpdateSpaceReadState/i,
    /markAsRead/i,
    /MarkAsRead/i,
    /updateReadState/i,
    /UpdateReadState/i,
    /readState/i,
    /ReadReceipt/i,
    /readreceipt/i,
    // gRPC-Web service paths used by Chat web app
    /ChatService.*[Rr]ead/,
    /DynamiteService.*[Rr]ead/,
    /\/read\b/i,
  ];

  let isEnabled = false;
  let blockedCount = 0;

  // Read initial state from storage via background
  chrome.storage.local.get('rrbEnabled', (data) => {
    isEnabled = data.rrbEnabled ?? false;
  });

  // Listen for toggle changes in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.rrbEnabled) {
      isEnabled = changes.rrbEnabled.newValue;
    }
  });

  function shouldBlock(url) {
    if (!isEnabled) return false;
    return BLOCK_PATTERNS.some(p => p.test(url));
  }

  function reportBlocked() {
    blockedCount++;
    chrome.storage.local.get('rrbBlockedTotal', (data) => {
      const total = (data.rrbBlockedTotal ?? 0) + 1;
      chrome.storage.local.set({ rrbBlockedTotal: total });
      chrome.runtime.sendMessage({ type: 'RRB_BLOCKED', total, session: blockedCount })
        .catch(() => {});
    });
  }

  // ── Override fetch ────────────────────────────────────────────
  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (shouldBlock(url)) {
      console.debug('[RRB] Blocked fetch:', url);
      reportBlocked();
      // Return empty 200 so the app doesn't crash
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    return _fetch(input, init);
  };

  // ── Override XHR ─────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._rrbUrl = url;
    return _open.call(this, method, url, ...rest);
  };

  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (shouldBlock(this._rrbUrl || '')) {
      console.debug('[RRB] Blocked XHR:', this._rrbUrl);
      reportBlocked();
      // Simulate successful response without sending
      Object.defineProperty(this, 'readyState', { get: () => 4 });
      Object.defineProperty(this, 'status', { get: () => 200 });
      Object.defineProperty(this, 'responseText', { get: () => '{}' });
      setTimeout(() => {
        this.dispatchEvent(new Event('load'));
        this.dispatchEvent(new Event('loadend'));
      }, 0);
      return;
    }
    return _send.call(this, body);
  };

})();
