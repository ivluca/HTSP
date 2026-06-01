// ── Extension Manager ───────────────────────────────────────────────────────
(function () {
  'use strict';

  let allExtensions = [];
  let searchTerm = '';

  function init() {
    const container = document.getElementById('ext-manager-container');
    if (!container) return;

    container.innerHTML = `
      <div class="ext-header">
        <h3>Extensions</h3>
        <span class="ext-count"></span>
      </div>
      <div class="ext-search">
        <input type="text" id="ext-search-input" placeholder="Search extensions…">
      </div>
      <div class="ext-list" id="ext-list"></div>
    `;

    document.getElementById('ext-search-input').addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase().trim();
      renderList();
    });

    loadExtensions();

    // Listen for enable/disable/install/uninstall events
    chrome.management.onEnabled.addListener(() => loadExtensions());
    chrome.management.onDisabled.addListener(() => loadExtensions());
    chrome.management.onInstalled.addListener(() => loadExtensions());
    chrome.management.onUninstalled.addListener(() => loadExtensions());
  }

  async function loadExtensions() {
    const exts = await chrome.management.getAll();
    // Filter out self, sort enabled first then alphabetical
    allExtensions = exts
      .sort((a, b) => a.name.localeCompare(b.name));
    renderList();
  }

  function renderList() {
    const listEl = document.getElementById('ext-list');
    const countEl = document.querySelector('.ext-count');
    if (!listEl) return;

    const filtered = searchTerm
      ? allExtensions.filter(e => e.name.toLowerCase().includes(searchTerm))
      : allExtensions;

    if (countEl) {
      const enabledCount = allExtensions.filter(e => e.enabled).length;
      countEl.textContent = `${enabledCount}/${allExtensions.length}`;
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="ext-empty"><p>No extensions found</p></div>`;
      return;
    }

    listEl.innerHTML = '';
    filtered.forEach(ext => {
      const item = document.createElement('div');
      item.className = `ext-item${ext.enabled ? '' : ' disabled'}`;

      // Icon
      const iconUrl = getIconUrl(ext);
      const iconHtml = iconUrl
        ? `<img class="ext-icon" src="${iconUrl}" alt="">`
        : `<div class="ext-icon-placeholder">${ext.name.charAt(0).toUpperCase()}</div>`;

      item.innerHTML = `
        ${iconHtml}
        <div class="ext-info">
          <div class="ext-name" title="${escapeHtml(ext.name)}">${escapeHtml(ext.name)}</div>
          <div class="ext-version">v${ext.version}</div>
        </div>
        <div class="ext-actions">
          <label class="ext-switch">
            <input type="checkbox" ${ext.enabled ? 'checked' : ''}>
            <span class="ext-slider"></span>
          </label>
          <button class="ext-delete-btn" title="Remove extension">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" />
              <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
              <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
            </svg>
          </button>
        </div>
      `;

      // Toggle handler
      const toggle = item.querySelector('input[type="checkbox"]');
      toggle.addEventListener('change', () => {
        chrome.management.setEnabled(ext.id, toggle.checked);
      });

      // Delete handler
      const deleteBtn = item.querySelector('.ext-delete-btn');
      deleteBtn.addEventListener('click', () => {
        showDeleteConfirm(ext);
      });

      listEl.appendChild(item);
    });
  }

  function showDeleteConfirm(ext) {
    const container = document.getElementById('ext-manager-container');

    // Remove existing modal if any
    const existing = container.querySelector('.ext-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ext-modal-overlay';
    overlay.innerHTML = `
      <div class="ext-modal">
        <h4>Remove Extension</h4>
        <p>Are you sure you want to remove <b>${escapeHtml(ext.name)}</b>? This action cannot be undone.</p>
        <div class="ext-modal-actions">
          <button class="ext-modal-btn cancel-btn">Cancel</button>
          <button class="ext-modal-btn danger confirm-btn">Remove</button>
        </div>
      </div>
    `;

    // Cancel
    overlay.querySelector('.cancel-btn').addEventListener('click', () => {
      overlay.remove();
    });

    // Click overlay to cancel
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Confirm removal
    overlay.querySelector('.confirm-btn').addEventListener('click', () => {
      overlay.remove();
      chrome.management.uninstall(ext.id, { showConfirmDialog: false }, () => {
        if (chrome.runtime.lastError) {
          // User cancelled native dialog or error
          console.log('Uninstall cancelled or failed:', chrome.runtime.lastError.message);
        }
      });
    });

    container.appendChild(overlay);
  }

  function getIconUrl(ext) {
    if (ext.icons && ext.icons.length > 0) {
      // Get largest icon
      const sorted = [...ext.icons].sort((a, b) => b.size - a.size);
      return sorted[0].url;
    }
    return null;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
