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
    chrome.tabs.sendMessage(tab.id, {
      action: "ANALYZE_SINGLE_IMAGE",
      srcUrl: info.srcUrl
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("Could not send message to tab (content script might not be injected yet):", chrome.runtime.lastError.message);
            // Optionally inject content script if not present (requires activeTab permission on click, but context menu click grants it usually)
            // For now, assume content script is loaded if user is on a web page.
        }
    });
  }
});
