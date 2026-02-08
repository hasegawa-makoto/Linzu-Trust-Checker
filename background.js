importScripts('libs/api_client.js');

// Linzu Trust Checker - Background Script
// Handles context menu interactions and centralized analysis state

// Simple in-memory state for the last analysis result
let lastResult = {
    status: 'idle', // 'idle', 'analyzing', 'success', 'error'
    data: null,     // Analysis result object
    error: null,    // Error message or object
    imageUrl: null, // Thumbnail URL
    timestamp: null
};

function updateState(newState) {
    lastResult = { ...lastResult, ...newState, timestamp: Date.now() };
    // Optionally broadcast to popup if open
    chrome.runtime.sendMessage({ action: 'STATE_UPDATED', state: lastResult }).catch(() => {});
}

// Helper to send message to active tab content script
function notifyContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message).catch(err => {
        console.warn('Failed to send message to content script:', err);
    });
}

// Helper to map errors to user-friendly messages
function mapError(error) {
    let code = error.code || 'UNKNOWN';
    let status = error.status || 0;
    let message = error.message || '';

    // Determine type/code based on message/status if not already set
    if (status === 429 || message.includes('429')) code = 'RATE_LIMIT_EXCEEDED';
    else if (status === 401 || status === 403 || message.includes('API key')) code = 'API_KEY_INVALID';
    else if (status === 404 || message.includes('MODEL_NOT_FOUND')) code = 'MODEL_NOT_FOUND';
    else if (code === 'IMAGE_FETCH_FAILED') code = 'IMAGE_FETCH_FAILED';
    else if (code === 'API_KEY_MISSING') code = 'API_KEY_MISSING';

    let userTitle = '解析エラー';
    let userMessage = `エラーが発生しました (${code})。時間をおいて再度お試しください。`;

    switch (code) {
        case 'RATE_LIMIT_EXCEEDED':
            userTitle = '利用制限 (429)';
            userMessage = 'APIの利用制限に達しました。無料枠をお使いの場合は、1〜2分待ってから再度お試しください。';
            break;
        case 'API_KEY_INVALID':
        case 'API_KEY_MISSING':
            userTitle = '設定エラー';
            userMessage = 'APIキーが無効、または設定されていません。設定画面で正しいキーを入力してください。';
            break;
        case 'MODEL_NOT_FOUND':
            userTitle = 'システム更新中';
            userMessage = '指定されたAIモデルが見つかりません。しばらくしてから再度お試しください。';
            break;
        case 'IMAGE_FETCH_FAILED':
            userTitle = '画像取得エラー';
            userMessage = '画像のデータが大きすぎるか、取得できない形式です。別の画像でお試しください。';
            break;
        case 'NETWORK_ERROR':
            userTitle = '通信エラー';
            userMessage = '通信エラーが発生しました。インターネット接続を確認してください。';
            break;
        case 'AI_PARSE_ERROR':
            userTitle = '解析エラー';
            userMessage = 'AIからの応答を正常に読み取れませんでした。もう一度お試しください。';
            break;
    }

    return {
        type: 'ANALYSIS_ERROR',
        code: code,
        status: status,
        title: userTitle,
        message: userMessage
    };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Linzuでこの画像を解析",
    contexts: ["image"]
  });
});

async function performAnalysis(url, apiKey) {
    let blob;
    let mimeType;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            const err = new Error('Image Fetch Failed');
            err.code = 'IMAGE_FETCH_FAILED';
            throw err;
        }
        blob = await response.blob();
        mimeType = blob.type;
    } catch (e) {
        console.error('Fetch failed:', e);
        const err = new Error('Network Error during Fetch');
        err.code = e.code || 'IMAGE_FETCH_FAILED'; // Or NETWORK_ERROR
        throw err;
    }

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

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

        if (!apiKey) {
            const err = new Error('API Key Missing');
            err.code = 'API_KEY_MISSING';
            throw err;
        }

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

        const structuredError = mapError(error);

        updateState({ status: 'error', error: structuredError.message });

        // Send Structured Error to Content Script
        notifyContentScript(tab.id, {
            action: 'SHOW_ERROR',
            ...structuredError // Spread title, message, code, etc.
        });

        // Also Notification
        chrome.notifications.create('linzu-error', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: structuredError.title,
            message: structuredError.message,
            priority: 2
        });

        // Handle Key Missing Redirect
        if (structuredError.code === 'API_KEY_MISSING' || structuredError.code === 'API_KEY_INVALID') {
             // Only redirect if explicitly missing or invalid key action required
             if (structuredError.code === 'API_KEY_MISSING') {
                 chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=missing_key') });
             }
        }
    }
  }
});
