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
        requestDomains: ["chat.openai.com", "chatgpt.com", "openai.com"],
        resourceTypes: ["main_frame", "sub_frame"]
      }
    },
    {
      id: 2,
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
        requestDomains: ["gemini.google.com"],
        resourceTypes: ["main_frame", "sub_frame"]
      }
    },
    {
      id: 3,
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
        requestDomains: ["accounts.google.com"],
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

const debouncedUpdateAndNotify = debounce(async () => {
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

// ── Read Receipt Blocker ─────────────────────────────────────────

const RRB_RULE_ID = 100; // unique ID, separate from header-mod rules (1-3)
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
          urlFilter: '*chat.googleapis.com/v1/users/*/spaces/*/spaceReadState*',
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

// Restore RRB rule on startup based on saved state
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get('rrbEnabled');
  if (data.rrbEnabled) await setRrbRule(true);
});

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get('rrbEnabled');
  if (data.rrbEnabled) await setRrbRule(true);
});

// Track blocked requests and notify side panel
chrome.declarativeNetRequest.onRuleMatchedDebug?.addListener(async (info) => {
  if (info.rule.ruleId !== RRB_RULE_ID) return;
  rrbSessionBlocked++;
  const stored = await chrome.storage.local.get('rrbBlockedTotal');
  const total = (stored.rrbBlockedTotal ?? 0) + 1;
  await chrome.storage.local.set({ rrbBlockedTotal: total });
  sendMessageToSidePanel({ type: 'RRB_BLOCKED', total, session: rrbSessionBlocked });
});

// ── Unlock Right-Click & Copy ────────────────────────────────────
// Re-enables right-click, selection, copy and shortcuts on pages that block them.

const UNLOCK_SCRIPT_ID = 'htsp-unlock-right-click';
const UNLOCK_FILES = ['unlock-right-click/unlock-content.js'];

async function setUnlockEnabled(enabled) {
  // Always clear any existing registration first to avoid duplicate-id errors.
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [UNLOCK_SCRIPT_ID] });
    if (existing.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [UNLOCK_SCRIPT_ID] });
    }
  } catch (e) { /* nothing registered yet */ }

  if (!enabled) return;

  await chrome.scripting.registerContentScripts([{
    id: UNLOCK_SCRIPT_ID,
    matches: ['<all_urls>'],
    js: UNLOCK_FILES,
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true
  }]);

  // Also inject into already-open tabs so the toggle takes effect immediately.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: UNLOCK_FILES,
        world: 'MAIN'
      });
    } catch (e) { /* restricted page, ignore */ }
  }
}

async function restoreUnlockState() {
  const data = await chrome.storage.local.get('unlockRightClick');
  await setUnlockEnabled(!!data.unlockRightClick);
}

chrome.runtime.onStartup.addListener(restoreUnlockState);
chrome.runtime.onInstalled.addListener(restoreUnlockState);

// Handle toggle from side panel
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'RRB_SET_ENABLED') {
    setRrbRule(msg.enabled).then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
  if (msg.type === 'UNLOCK_SET_ENABLED') {
    setUnlockEnabled(msg.enabled).then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
});
