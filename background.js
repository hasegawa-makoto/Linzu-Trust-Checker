importScripts('libs/api_client.js');

// Linzu Trust Checker - Background Script
// Handles context menu interactions and centralized analysis state

// Simple in-memory state for the last analysis result
let lastResult = {
    status: 'idle', // 'idle', 'analyzing', 'success', 'error'
    data: null,     // Analysis result object
    error: null,    // Error message
    imageUrl: null, // Thumbnail URL
    timestamp: null
};

function updateState(newState) {
    lastResult = { ...lastResult, ...newState, timestamp: Date.now() };
    // Optionally broadcast to popup if open (optimization)
    chrome.runtime.sendMessage({ action: 'STATE_UPDATED', state: lastResult }).catch(() => {});
}

// Helper to send message to active tab content script
function notifyContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message).catch(err => {
        console.warn('Failed to send message to content script:', err);
        // Fallback to notification if content script is unreachable (e.g. chrome:// pages)
        // But we prioritize the modal as requested.
        // We already sent a notification in the main flow, so this is just for the overlay.
    });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Linzuでこの画像を解析",
    contexts: ["image"]
  });
});

async function performAnalysis(url, apiKey) {
    // 1. Fetch Image
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

// Handle Requests from Popup (Get Status)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_LAST_RESULT') {
        sendResponse(lastResult);
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyze-image") {
    try {
        const data = await chrome.storage.sync.get('geminiApiKey');
        const apiKey = data.geminiApiKey;

        // Handle Missing Key - Immediate Error Modal
        if (!apiKey) {
            const msg = 'APIキーが設定されていません。設定画面から入力してください。';

            // Send Error to Content Script
            notifyContentScript(tab.id, {
                action: 'SHOW_ERROR',
                title: '設定が必要です',
                message: msg
            });

            // Fallback Notification
            chrome.notifications.create('linzu-error', {
                type: 'basic',
                iconUrl: 'icon.png',
                title: '設定が必要です',
                message: msg,
                priority: 2
            });

            // Open Options
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=missing_key') });
            return;
        }

        // Start Analysis
        updateState({ status: 'analyzing', imageUrl: info.srcUrl, error: null, data: null });

        chrome.notifications.create('linzu-start', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Linzu',
            message: '画像を解析中...',
            priority: 0
        });

        const analysis = await performAnalysis(info.srcUrl, apiKey);

        // Success
        updateState({ status: 'success', data: analysis });

        // Send Result to Content Script (Modal)
        notifyContentScript(tab.id, {
            action: 'SHOW_RESULT',
            data: analysis
        });

        const prob = analysis.ai_probability;
        const resultTitle = `AI生成確率: ${prob}%`;
        const resultMessage = `${analysis.detected_type}\n理由: ${analysis.reasons?.[0] || '詳細をポップアップで確認'}`;

        chrome.notifications.create('linzu-success', {
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
        let errTitle = '解析エラー';

        if (msg.includes('API_KEY_INVALID') || msg.includes('403')) {
            userMessage = 'APIキーが無効です。設定を確認してください。';
        } else if (msg.includes('MODEL_NOT_FOUND') || msg.includes('404')) {
            userMessage = '指定されたAIモデルが見つかりません (システム更新待ち)。';
        } else if (msg.includes('IMAGE_FETCH_FAILED')) {
             userMessage = '画像のデータ取得に失敗しました。';
        } else if (msg.includes('INVALID_JSON_PAYLOAD') || msg.includes('400')) {
             userMessage = 'APIリクエスト形式が無効です (システム更新待ち)。';
        } else if (msg.includes('AI_PARSE_ERROR')) {
             userMessage = 'AIからの応答を解析できませんでした。';
        } else if (msg.includes('429')) {
             userMessage = 'APIの利用制限に達しました。1〜2分待ってから再度お試しください。';
             errTitle = '利用制限 (429)';
        }

        updateState({ status: 'error', error: userMessage });

        // Send Error to Content Script (Modal) - CRITICAL REQUIREMENT
        notifyContentScript(tab.id, {
            action: 'SHOW_ERROR',
            title: errTitle,
            message: userMessage
        });

        chrome.notifications.create('linzu-error', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: errTitle,
            message: userMessage,
            priority: 2
        });
    }
  }
});
