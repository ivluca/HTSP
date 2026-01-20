function initiate() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);

  chrome.runtime.onInstalled.addListener(async function () {
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
      },
      {
        id: 4,
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
          requestDomains: ["claude.ai"],
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
}

function sendMessageToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(err => {
    // Ignore errors, the side panel might not be open
  });
}

// Comprehensive listeners
chrome.tabs.onCreated.addListener((tab) => sendMessageToSidePanel({ type: 'TAB_CREATED', tabId: tab.id }));
chrome.tabs.onRemoved.addListener((tabId) => sendMessageToSidePanel({ type: 'TAB_REMOVED', tabId }));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.pinned || changeInfo.url) {
    sendMessageToSidePanel({ type: 'TAB_UPDATED', tabId, changeInfo });
  }
});
chrome.tabs.onMoved.addListener((tabId, moveInfo) => sendMessageToSidePanel({ type: 'TAB_MOVED', tabId, moveInfo }));
chrome.tabs.onAttached.addListener((tabId, attachInfo) => sendMessageToSidePanel({ type: 'TAB_ATTACHED', tabId, attachInfo }));
chrome.tabs.onDetached.addListener((tabId, detachInfo) => sendMessageToSidePanel({ type: 'TAB_DETACHED', tabId, detachInfo }));
chrome.tabs.onActivated.addListener((activeInfo) => sendMessageToSidePanel({ type: 'TAB_ACTIVATED', activeInfo }));

chrome.windows.onCreated.addListener((window) => sendMessageToSidePanel({ type: 'WINDOW_CREATED', windowId: window.id }));
chrome.windows.onRemoved.addListener((windowId) => sendMessageToSidePanel({ type: 'WINDOW_REMOVED', windowId }));

chrome.bookmarks.onCreated.addListener((id, bookmark) => sendMessageToSidePanel({ type: 'BOOKMARK_CREATED', id, bookmark }));
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => sendMessageToSidePanel({ type: 'BOOKMARK_REMOVED', id, removeInfo }));
chrome.bookmarks.onChanged.addListener((id, changeInfo) => sendMessageToSidePanel({ type: 'BOOKMARK_CHANGED', id, changeInfo }));

initiate();
