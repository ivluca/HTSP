// --- Caching and State Management ---

async function updateCache() {
  const queryOptions = { populate: true, windowTypes: ['normal'] };
  const allWindows = await chrome.windows.getAll(queryOptions);
  const allTabGroups = await chrome.tabGroups.query({});
  
  const cache = {
    windows: allWindows,
    tabGroups: allTabGroups,
    timestamp: Date.now()
  };
  
  await chrome.storage.session.set({ tabCache: cache });
  return cache;
}

async function getCachedState() {
  const result = await chrome.storage.session.get('tabCache');
  if (result.tabCache) {
    return result.tabCache;
  }
  // If cache is empty, build it for the first time.
  return await updateCache();
}

// --- Event Listeners for Cache Updates ---

// Update cache on startup
chrome.runtime.onStartup.addListener(updateCache);

// Update cache on install
chrome.runtime.onInstalled.addListener(async (details) => {
  await updateCache();
  
  // Also set up the declarativeNetRequest rules
  // All four AI sites need the same headers removed to allow iframe embedding.
  // Use a single rule with a combined domain list instead of four separate rules.
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "frame-options", operation: "remove" },
          { header: "frame-ancestors", operation: "remove" },
          { header: "content-security-policy", operation: "remove" }
        ]
      },
      condition: {
        requestDomains: [
          "chat.openai.com", "chatgpt.com", "openai.com",
          "gemini.google.com",
          "accounts.google.com"
        ],
        resourceTypes: ["main_frame", "sub_frame"]
      }
    }
  ];
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(rule => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingRuleIds,
    addRules: rules
  });
});


function sendMessageToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore errors, the side panel might not be open
  });
}

const debounce = (func, delay) => {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

// Track whether a side panel is actually open. The tab cache is only ever
// read by the panel, so there is no point rebuilding it (a full populated
// getAll + session write) when nothing is listening.
let panelConnections = 0;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'htsp-panel') return;
  panelConnections++;
  // Give the freshly-opened panel up-to-date data (it may be stale because we
  // skip rebuilds while closed).
  updateCache().then(() => sendMessageToSidePanel({ type: 'CACHE_UPDATED' }));
  port.onDisconnect.addListener(() => {
    panelConnections = Math.max(0, panelConnections - 1);
  });
});

const debouncedUpdateAndNotify = debounce(async () => {
  if (panelConnections === 0) return; // no panel open → skip the rebuild
  await updateCache();
  sendMessageToSidePanel({ type: 'CACHE_UPDATED' });
}, 150);

// --- Comprehensive Listeners ---
chrome.tabs.onCreated.addListener(() => debouncedUpdateAndNotify());
chrome.tabs.onRemoved.addListener(() => debouncedUpdateAndNotify());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Filter out minor updates to avoid excessive refreshes
  if (changeInfo.status || changeInfo.title || changeInfo.pinned || changeInfo.url || changeInfo.groupId) {
    debouncedUpdateAndNotify();
  }
});
chrome.tabs.onMoved.addListener(() => debouncedUpdateAndNotify());
chrome.tabs.onAttached.addListener(() => debouncedUpdateAndNotify());
chrome.tabs.onDetached.addListener(() => debouncedUpdateAndNotify());
chrome.tabs.onActivated.addListener(() => debouncedUpdateAndNotify());

chrome.windows.onCreated.addListener(() => debouncedUpdateAndNotify());
chrome.windows.onRemoved.addListener(() => debouncedUpdateAndNotify());

chrome.tabGroups.onCreated.addListener(() => debouncedUpdateAndNotify());
chrome.tabGroups.onRemoved.addListener(() => debouncedUpdateAndNotify());
chrome.tabGroups.onUpdated.addListener(() => debouncedUpdateAndNotify());
chrome.tabGroups.onMoved.addListener(() => debouncedUpdateAndNotify());



// --- Initial Setup ---
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

/* ── GOOGLE CHAT (Read Receipt Blocker) — tạm thời tắt ──────────────────────

const RRB_RULE_ID = 100;
let rrbSessionBlocked = 0;

async function setRrbRule(enabled) {
  if (enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RRB_RULE_ID],
      addRules: [{
        id: RRB_RULE_ID,
        priority: 10,
        action: { type: 'block' },
        condition: {
          urlFilter: '*chat.googleapis.com/v1/users/* /spaces/* /spaceReadState*',
          requestMethods: ['patch'],
          resourceTypes: ['xmlhttprequest']
        }
      }]
    });
  } else {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RRB_RULE_ID]
    });
  }
}

chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get('rrbEnabled');
  if (data.rrbEnabled) await setRrbRule(true);
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('rrbEnabled');
  if (data.rrbEnabled) await setRrbRule(true);
});

chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async (info) => {
  if (info.rule.ruleId !== RRB_RULE_ID) return;
  rrbSessionBlocked++;
  const stored = await chrome.storage.local.get('rrbBlockedTotal');
  const total = (stored.rrbBlockedTotal ?? 0) + 1;
  await chrome.storage.local.set({ rrbBlockedTotal: total });
  sendMessageToSidePanel({ type: 'RRB_BLOCKED', total, session: rrbSessionBlocked });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'RRB_SET_ENABLED') {
    setRrbRule(msg.enabled).then(() => sendResponse({ ok: true }));
    return true;
  }
});

*/

// ── Save Image As (with format conversion) ───────────────────────
// Adds a right-click "Save image as" menu on images, letting the user
// re-encode to PNG / JPEG / WebP before downloading.

const IMAGE_FORMATS = [
  { id: 'png',  label: 'PNG',  mime: 'image/png',  ext: 'png' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' }
];

function createImageContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'htsp-save-image-as',
      title: 'Save image as',
      contexts: ['image']
    });
    IMAGE_FORMATS.forEach(fmt => {
      chrome.contextMenus.create({
        id: `htsp-save-image-${fmt.id}`,
        parentId: 'htsp-save-image-as',
        title: fmt.label,
        contexts: ['image']
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(createImageContextMenus);
chrome.runtime.onStartup.addListener(createImageContextMenus);

function buildImageFilename(srcUrl, ext) {
  let base = 'image';
  try {
    const name = new URL(srcUrl).pathname.split('/').pop() || '';
    base = name.replace(/\.[^.]+$/, '') || 'image';
  } catch (_) { /* keep default */ }
  base = decodeURIComponent(base).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 100) || 'image';
  return `${base}.${ext}`;
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function saveImageAs(srcUrl, fmt) {
  const resp = await fetch(srcUrl);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const srcBlob = await resp.blob();

  const bitmap = await createImageBitmap(srcBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha channel — flatten transparency onto white.
  if (fmt.mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const outBlob = await canvas.convertToBlob({ type: fmt.mime, quality: 0.92 });
  const dataUrl = await blobToDataUrl(outBlob);

  await chrome.downloads.download({
    url: dataUrl,
    filename: buildImageFilename(srcUrl, fmt.ext),
    saveAs: false
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  const fmt = IMAGE_FORMATS.find(f => info.menuItemId === `htsp-save-image-${f.id}`);
  if (!fmt || !info.srcUrl) return;
  try {
    await saveImageAs(info.srcUrl, fmt);
  } catch (e) {
    console.error('Save image as failed:', e);
  }
});

// ── Force cache rebuild (requested by tab-manager after bulk mutations) ───────
// The normal path relies on the debounced tab-event listeners which can be
// too slow or miss events when many tabs change at once (merge / dedupe).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FORCE_CACHE_REBUILD') {
    updateCache()
      .then(() => sendMessageToSidePanel({ type: 'CACHE_UPDATED' }))
      .catch(console.error);
    sendResponse({ ok: true });
    return false;
  }
});
