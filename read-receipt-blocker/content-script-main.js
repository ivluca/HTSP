// Read Receipt Blocker — MAIN world script
// Overrides window.fetch and XHR before Google Chat code runs
// Reads enabled state via CustomEvent bridge from the ISOLATED world script

(function () {
  'use strict';

  let isEnabled = false;
  let blockedCount = 0;

  // Listen for state updates from the ISOLATED world bridge
  window.addEventListener('__rrb_state__', (e) => {
    if (e.detail) {
      if (typeof e.detail.enabled === 'boolean') {
        document.documentElement.setAttribute('data-rrb-enabled', e.detail.enabled ? 'true' : 'false');
      }
      if (typeof e.detail.typingBlocked === 'boolean') {
        document.documentElement.setAttribute('data-typing-blocked', e.detail.typingBlocked ? 'true' : 'false');
      }
    }
  });

  function checkReadEnabled() {
    return document.documentElement.getAttribute('data-rrb-enabled') === 'true';
  }

  function checkTypingBlocked() {
    return document.documentElement.getAttribute('data-typing-blocked') === 'true';
  }

  // URL patterns based on actual Google Chat internal API (verified via DevTools)
  const BLOCK_PATTERNS = [
    // Primary: Google Chat's internal read-state marking endpoint
    /mark_group_readstate/i,
    /mark_readstate/i,
    /markReadState/i,
    // REST API (Google Chat API v1)
    /spaceReadState/i,
    /UpdateSpaceReadState/i,
    // gRPC-Web service calls
    /UpdateSpaceReadState/,
    /MarkAsRead/,
  ];

  function shouldBlockRead(url) {
    if (!checkReadEnabled()) return false;
    return BLOCK_PATTERNS.some(p => p.test(url));
  }

  function shouldBlockTyping(url) {
    if (!checkTypingBlocked()) return false;
    return url.includes('rpcids=uQwtvc') || url.includes('SetTypingState');
  }

  function reportBlocked() {
    blockedCount++;
    window.dispatchEvent(new CustomEvent('__rrb_blocked__', { detail: { count: blockedCount } }));
  }

  const _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input
      : (input instanceof Request ? input.url : String(input));
    
    if (shouldBlockRead(url)) {
      console.debug('[RRB] Blocked read receipt fetch:', url);
      reportBlocked();
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    
    if (shouldBlockTyping(url)) {
      console.debug('[RRB] Blocked typing indicator fetch:', url);
      // batchexecute expects a specific response format, but returning an empty array or basic text
      // with 200 OK is usually enough to fake success without crashing the client.
      return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    }

    return _fetch(input, init);
  };

  // ── Override XHR ───────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._rrbUrl = String(url ?? '');
    return _open.call(this, method, url, ...rest);
  };

  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    const url = this._rrbUrl ?? '';
    
    if (shouldBlockRead(url)) {
      console.debug('[RRB] Blocked read receipt XHR:', url);
      reportBlocked();
      setTimeout(() => {
        try {
          Object.defineProperty(this, 'readyState', { get: () => 4, configurable: true });
          Object.defineProperty(this, 'status', { get: () => 200, configurable: true });
          Object.defineProperty(this, 'responseText', { get: () => '{}', configurable: true });
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        } catch (_) {}
      }, 0);
      return;
    }
    
    if (shouldBlockTyping(url)) {
      console.debug('[RRB] Blocked typing indicator XHR:', url);
      setTimeout(() => {
        try {
          Object.defineProperty(this, 'readyState', { get: () => 4, configurable: true });
          Object.defineProperty(this, 'status', { get: () => 200, configurable: true });
          Object.defineProperty(this, 'responseText', { get: () => '[]', configurable: true });
          this.dispatchEvent(new Event('readystatechange'));
          this.dispatchEvent(new Event('load'));
          this.dispatchEvent(new Event('loadend'));
        } catch (_) {}
      }, 0);
      return;
    }

    return _send.call(this, body);
  };

})();
