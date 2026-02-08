importScripts('libs/api_client.js');

// Linzu Trust Checker - Background Script
// Handles context menu interactions and centralized analysis requests

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Linzuでこの画像を解析",
    contexts: ["image"]
  });
});

async function performAnalysis(url, apiKey) {
    if (!apiKey) {
        throw new Error('API_KEY_MISSING');
    }

    // 1. Fetch Image (Privileged Service Worker Fetch)
    let blob;
    let mimeType;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('IMAGE_FETCH_FAILED');
        blob = await response.blob();
        mimeType = blob.type;
    } catch (e) {
        console.error('Fetch failed:', e);
        throw new Error('IMAGE_FETCH_FAILED');
    }

    // Convert to Base64
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    // 2. Call API
    return await GeminiClient.analyzeImage(apiKey, base64, mimeType);
}

// Handle Requests from Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ANALYZE_IMAGE_REQUEST') {
        performAnalysis(message.url, message.apiKey)
            .then(result => sendResponse({ success: true, data: result }))
            .catch(error => {
                console.error('Background analysis failed:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep message channel open for async response
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyze-image") {
    try {
        const data = await chrome.storage.sync.get('geminiApiKey');
        const apiKey = data.geminiApiKey;

        if (!apiKey) {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=missing_key') });
            return;
        }

        chrome.notifications.create('linzu-analyze-start', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Linzu',
            message: '画像を解析中...',
            priority: 0
        });

        const analysis = await performAnalysis(info.srcUrl, apiKey);

        // Show Result via Notification
        const prob = analysis.ai_probability;
        const resultTitle = `AI生成確率: ${prob}%`;
        const resultMessage = `${analysis.detected_type}\n理由: ${analysis.reasons?.[0] || '特筆すべき理由なし'}`;

        chrome.notifications.create('linzu-analyze-success', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: resultTitle,
            message: resultMessage,
            priority: 1
        });

    } catch (error) {
        console.error('Background Analysis Error:', error);

        let userMessage = '不明なエラーが発生しました。';
        const msg = error.message || '';

        if (msg.includes('API_KEY_INVALID') || msg.includes('403')) {
            userMessage = 'APIキーが無効です。設定を確認してください。';
        } else if (msg.includes('MODEL_NOT_FOUND') || msg.includes('404')) {
            userMessage = '指定されたAIモデルが見つかりません (システム更新待ち)。';
        } else if (msg.includes('IMAGE_FETCH_FAILED')) {
             userMessage = '解析データの準備に失敗しました。';
        } else if (msg.includes('INVALID_JSON_PAYLOAD') || msg.includes('400')) {
             userMessage = 'APIリクエスト形式が無効です (システム更新待ち)。';
        } else if (msg.includes('AI_PARSE_ERROR')) {
             userMessage = 'AIからの応答を解析できませんでした。';
        } else if (msg.includes('API_KEY_MISSING')) {
             userMessage = 'APIキーが設定されていません。';
        }

        chrome.notifications.create('linzu-analyze-error', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Linzu 解析エラー',
            message: userMessage,
            priority: 2
        });
    }
  }
});
