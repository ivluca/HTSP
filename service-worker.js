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