// Read Receipt Blocker for Google Chat
// ── GOOGLE CHAT state — tạm thời tắt (giữ khai báo để tránh lỗi template literal)
let blockedCount = 0, sessionBlocked = 0, isEnabled = false, isTypingBlocked = false;

// ── Feature Manager ─────────────────────────────────────────────────────────
const FEATURES = [
  { id: 'tab-manager-container', label: 'Tab Manager' },
  { id: 'chatgpt-frame',         label: 'ChatGPT' },
  { id: 'gemini-frame',          label: 'Gemini' },
  { id: 'json-viewer-container', label: 'JSON Viewer' },
];

async function loadFeatureStates() {
  const data = await chrome.storage.local.get('htspFeatures');
  const states = data.htspFeatures || {};
  FEATURES.forEach(f => {
    const enabled = states[f.id] !== false; // default ON
    const tab = document.querySelector(`.tab[data-target="${f.id}"]`);
    if (tab) tab.style.display = enabled ? '' : 'none';

    // Also update dropdown items
    const dropdownItem = document.querySelector(`.dropdown-item[data-target="${f.id}"]`);
    if (dropdownItem) dropdownItem.style.display = enabled ? '' : 'none';
  });

  // If the currently active tab was hidden, switch to first visible tab
  const activeTab = document.querySelector('.tab.active');
  if (activeTab && activeTab.style.display === 'none') {
    const firstVisible = document.querySelector('.tab:not([style*="display: none"])');
    if (firstVisible) switchTab(firstVisible.dataset.target);
  }
}

async function setFeatureEnabled(featureId, enabled) {
  const data = await chrome.storage.local.get('htspFeatures');
  const states = data.htspFeatures || {};
  states[featureId] = enabled;
  await chrome.storage.local.set({ htspFeatures: states });
  await loadFeatureStates();
}

/* ── GOOGLE CHAT functions — tạm thời tắt
async function loadState() {
  const data = await chrome.storage.local.get(['rrbEnabled', 'rrbBlockedTotal', 'typingBlocked']);
  isEnabled = data.rrbEnabled ?? false;
  isTypingBlocked = data.typingBlocked ?? false;
  blockedCount = data.rrbBlockedTotal ?? 0;
  renderPanel();
}

async function setEnabled(val) {
  isEnabled = val;
  await chrome.storage.local.set({ rrbEnabled: val });
  chrome.runtime.sendMessage({ type: 'RRB_SET_ENABLED', enabled: val }).catch(() => {});
  renderPanel();
}

async function setTypingBlocked(val) {
  isTypingBlocked = val;
  await chrome.storage.local.set({ typingBlocked: val });
  // The content script will dynamically read this state via storage changes
  renderPanel();
}


async function resetStats() {
  blockedCount = 0;
  sessionBlocked = 0;
  await chrome.storage.local.set({ rrbBlockedTotal: 0 });
  renderPanel();
}
*/

// ── Tab Manager Settings ────────────────────────────────────────────────────
let dedupePatterns = [];

async function loadDedupePatterns() {
  const data = await chrome.storage.local.get('dedupePatterns');
  dedupePatterns = data.dedupePatterns || [];
}

async function saveDedupePatterns() {
  await chrome.storage.local.set({ dedupePatterns });
}

function renderDedupePatterns() {
  const listEl = document.getElementById('dedupe-pattern-list');
  if (!listEl) return;

  if (dedupePatterns.length === 0) {
    listEl.innerHTML = '<div class="dedupe-empty">No patterns added</div>';
    return;
  }

  listEl.innerHTML = dedupePatterns.map((p, i) => `
    <div class="dedupe-pattern-item" data-index="${i}">
      <span class="dedupe-pattern-text">${escapeSettingHtml(p)}</span>
      <div class="dedupe-pattern-edit-container hidden">
        <textarea class="dedupe-edit-input" rows="2">${escapeSettingHtml(p)}</textarea>
        <button class="dedupe-save-btn" data-index="${i}" title="Save">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </button>
      </div>
      <div class="dedupe-item-actions">
        <button class="dedupe-edit-btn" data-index="${i}" title="Edit">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="dedupe-remove-btn" data-index="${i}" title="Remove">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('.dedupe-remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      dedupePatterns.splice(idx, 1);
      await saveDedupePatterns();
      renderDedupePatterns();
    });
  });

  listEl.querySelectorAll('.dedupe-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Hide all other open edits
      listEl.querySelectorAll('.dedupe-pattern-edit-container:not(.hidden)').forEach(el => el.classList.add('hidden'));
      listEl.querySelectorAll('.dedupe-pattern-text.hidden').forEach(el => el.classList.remove('hidden'));
      listEl.querySelectorAll('.dedupe-item-actions.hidden').forEach(el => el.classList.remove('hidden'));

      const idx = parseInt(btn.dataset.index);
      const itemEl = listEl.querySelector(`.dedupe-pattern-item[data-index="${idx}"]`);
      itemEl.querySelector('.dedupe-pattern-text').classList.add('hidden');
      itemEl.querySelector('.dedupe-item-actions').classList.add('hidden');
      const editContainer = itemEl.querySelector('.dedupe-pattern-edit-container');
      editContainer.classList.remove('hidden');
      const input = editContainer.querySelector('.dedupe-edit-input');
      input.focus();
      input.selectionStart = input.selectionEnd = input.value.length;
    });
  });

  listEl.querySelectorAll('.dedupe-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.index);
      const itemEl = listEl.querySelector(`.dedupe-pattern-item[data-index="${idx}"]`);
      const newVal = itemEl.querySelector('.dedupe-edit-input').value.trim();
      
      if (newVal) {
        dedupePatterns[idx] = newVal;
        await saveDedupePatterns();
      }
      renderDedupePatterns();
    });
  });

  listEl.querySelectorAll('.dedupe-edit-input').forEach(input => {
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const btn = input.nextElementSibling;
        btn.click();
      } else if (e.key === 'Escape') {
        renderDedupePatterns();
      }
    });
  });
}

function escapeSettingHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function renderPanel() {
  const container = document.getElementById('read-receipt-container');
  if (!container) return;

  // Load feature states for toggles
  const featureData = await chrome.storage.local.get('htspFeatures');
  const featureStates = featureData.htspFeatures || {};

  const featureTogglesHtml = FEATURES.map(f => {
    const checked = featureStates[f.id] !== false ? 'checked' : '';
    return `
      <div class="setting-item">
        <div class="setting-text">
          <div class="setting-title">${f.label}</div>
        </div>
        <label class="rrb-switch">
          <input type="checkbox" class="feature-toggle" data-feature="${f.id}" ${checked}>
          <span class="rrb-slider"></span>
        </label>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="setting-list">
      <!-- GOOGLE CHAT section tạm thời tắt
      <div class="setting-section-header">Google Chat</div>
      <div class="setting-section-card">
        <div class="setting-item">
          <div class="setting-text">
            <div class="setting-title">Block Seen in Chat</div>
            <div class="setting-desc">Hide your seen status in Google Chat</div>
          </div>
          <label class="rrb-switch">
            <input type="checkbox" id="rrb-toggle" ${isEnabled ? 'checked' : ''}>
            <span class="rrb-slider"></span>
          </label>
        </div>
        <div class="setting-item">
          <div class="setting-text">
            <div class="setting-title">Block Typing in Chat</div>
            <div class="setting-desc">Hide your typing indicator in Google Chat</div>
          </div>
          <label class="rrb-switch">
            <input type="checkbox" id="typing-toggle" ${isTypingBlocked ? 'checked' : ''}>
            <span class="rrb-slider"></span>
          </label>
        </div>
      </div>
      -->

      <div class="setting-section-header">Tab Manager</div>
      <div class="setting-section-card">
        <div class="setting-item dedupe-setting">
          <div class="setting-text">
            <div class="setting-title">Dedupe URL Patterns</div>
            <div class="setting-desc">URLs containing these keywords will be grouped as duplicates regardless of query parameters</div>
          </div>
          <div class="dedupe-input-row">
            <input type="text" id="dedupe-pattern-input" placeholder="e.g. chat.google.com">
            <button id="dedupe-add-btn" class="dedupe-add-btn">Add</button>
          </div>
          <div id="dedupe-pattern-list" class="dedupe-pattern-list"></div>
        </div>
      </div>

      <div class="setting-section-header">Features</div>
      <div class="setting-section-card">
        ${featureTogglesHtml}
      </div>

      <button id="reset-all-settings" class="reset-settings-btn">Reset All Settings</button>
    </div>
  `;

  /* ── GOOGLE CHAT event listeners — tạm thời tắt
  document.getElementById('rrb-toggle').addEventListener('change', (e) => {
    setEnabled(e.target.checked);
  });
  document.getElementById('typing-toggle').addEventListener('change', (e) => {
    setTypingBlocked(e.target.checked);
  });
  */

  // Dedupe pattern handlers
  const dedupeInput = document.getElementById('dedupe-pattern-input');
  const dedupeAddBtn = document.getElementById('dedupe-add-btn');

  async function addPattern() {
    const val = dedupeInput.value.trim();
    if (val && !dedupePatterns.includes(val)) {
      dedupePatterns.push(val);
      await saveDedupePatterns();
      dedupeInput.value = '';
      renderDedupePatterns();
    }
  }

  dedupeAddBtn.addEventListener('click', addPattern);
  dedupeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPattern();
    }
  });

   renderDedupePatterns();

  // Feature toggles
  container.querySelectorAll('.feature-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      setFeatureEnabled(e.target.dataset.feature, e.target.checked);
    });
  });

  // Reset all settings
  document.getElementById('reset-all-settings').addEventListener('click', async () => {
    const btn = document.getElementById('reset-all-settings');
    if (btn.dataset.confirm !== 'true') {
      btn.textContent = 'Confirm Reset?';
      btn.classList.add('confirm');
      btn.dataset.confirm = 'true';
      setTimeout(() => {
        btn.textContent = 'Reset All Settings';
        btn.classList.remove('confirm');
        btn.dataset.confirm = '';
      }, 3000);
      return;
    }

    await chrome.storage.local.remove([
      /* 'rrbEnabled', 'rrbBlockedTotal', 'typingBlocked', */ // GOOGLE CHAT — tạm thời tắt
      'dedupePatterns', 'htspFeatures'
    ]);
    dedupePatterns = [];
    /* isEnabled = false; isTypingBlocked = false; blockedCount = 0; sessionBlocked = 0;
    chrome.runtime.sendMessage({ type: 'RRB_SET_ENABLED', enabled: false }).catch(() => {}); */ // GOOGLE CHAT — tạm thời tắt
    await loadFeatureStates();
    renderPanel();
  });
}

/* ── GOOGLE CHAT message listener — tạm thời tắt
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'RRB_BLOCKED') {
    blockedCount = msg.total;
    sessionBlocked = msg.session;
    const totalEl = document.getElementById('rrb-total');
    const sessionEl = document.getElementById('rrb-session');
    if (totalEl) totalEl.textContent = blockedCount;
    if (sessionEl) sessionEl.textContent = sessionBlocked;
  }
});
*/

document.addEventListener('DOMContentLoaded', async () => {
  await loadDedupePatterns();
  // await loadState(); // GOOGLE CHAT — tạm thời tắt
  await loadFeatureStates();
  await renderPanel(); // gọi trực tiếp vì loadState đã tắt
});

