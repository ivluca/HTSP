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

initiate();
