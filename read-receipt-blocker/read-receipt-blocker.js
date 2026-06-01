// Read Receipt Blocker for Google Chat
// Stores blocked count and enabled state in chrome.storage.local

let blockedCount = 0;
let sessionBlocked = 0;
let isEnabled = false;
let isTypingBlocked = false;

// ── Feature Manager ─────────────────────────────────────────────────────────
const FEATURES = [
  { id: 'tab-manager-container', label: 'Tab Manager' },
  { id: 'chatgpt-frame',         label: 'ChatGPT' },
  { id: 'gemini-frame',          label: 'Gemini' },
  { id: 'media-downloader-container', label: 'Media Downloader' },
  { id: 'json-viewer-container', label: 'JSON Viewer' },
  { id: 'ext-manager-container', label: 'Extensions' },
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
      <div class="setting-section-header">Google Chat</div>
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

      <div class="setting-section-header">Features</div>
      ${featureTogglesHtml}
    </div>
  `;

  document.getElementById('rrb-toggle').addEventListener('change', (e) => {
    setEnabled(e.target.checked);
  });
  document.getElementById('typing-toggle').addEventListener('change', (e) => {
    setTypingBlocked(e.target.checked);
  });

  // Feature toggles
  container.querySelectorAll('.feature-toggle').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      setFeatureEnabled(e.target.dataset.feature, e.target.checked);
    });
  });
}

// Listen for blocked-count updates from service worker
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

document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  await loadFeatureStates();
});

