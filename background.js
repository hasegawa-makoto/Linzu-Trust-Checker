// Linzu Trust Checker - Background Script
// Handles context menu interactions

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Linzuでこの画像を解析",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyze-image" && tab && tab.id) {
    // 1. Check for API Key first
    chrome.storage.sync.get('geminiApiKey', (data) => {
        const apiKey = data.geminiApiKey;

        if (!apiKey) {
            // No API Key - Open Options with reason
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=missing_key') });
            return;
        }

        // 2. Proceed with Analysis if Key exists
        chrome.tabs.sendMessage(tab.id, {
            action: "ANALYZE_SINGLE_IMAGE",
            srcUrl: info.srcUrl,
            apiKey: apiKey
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Could not send message to tab:", chrome.runtime.lastError.message);
                // Optionally inject content script if not present
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['libs/api_client.js', 'content.js']
                }, () => {
                     // Retry message
                     chrome.tabs.sendMessage(tab.id, {
                        action: "ANALYZE_SINGLE_IMAGE",
                        srcUrl: info.srcUrl,
                        apiKey: apiKey
                    });
                });
            }
        });
    });
  }
});
