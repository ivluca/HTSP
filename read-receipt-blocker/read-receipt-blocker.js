// Read Receipt Blocker for Google Chat
// Stores blocked count and enabled state in chrome.storage.local

let blockedCount = 0;
let sessionBlocked = 0;
let isEnabled = false;

async function loadState() {
  const data = await chrome.storage.local.get(['rrbEnabled', 'rrbBlockedTotal']);
  isEnabled = data.rrbEnabled ?? false;
  blockedCount = data.rrbBlockedTotal ?? 0;
  renderPanel();
}

async function setEnabled(val) {
  isEnabled = val;
  await chrome.storage.local.set({ rrbEnabled: val });
  // Notify service worker to update declarativeNetRequest rules
  chrome.runtime.sendMessage({ type: 'RRB_SET_ENABLED', enabled: val }).catch(() => {});
  renderPanel();
}

async function resetStats() {
  blockedCount = 0;
  sessionBlocked = 0;
  await chrome.storage.local.set({ rrbBlockedTotal: 0 });
  renderPanel();
}

function renderPanel() {
  const container = document.getElementById('read-receipt-container');
  if (!container) return;

  container.innerHTML = `
    <div class="setting-list">
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
    </div>
  `;

  document.getElementById('rrb-toggle').addEventListener('change', (e) => {
    setEnabled(e.target.checked);
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

document.addEventListener('DOMContentLoaded', loadState);
