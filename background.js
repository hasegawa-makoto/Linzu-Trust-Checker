importScripts('libs/api_client.js');

// Linzu Trust Checker - Background Script
// Handles context menu interactions

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "analyze-image",
    title: "Linzuでこの画像を解析",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyze-image" && tab && tab.id) {
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

        // 1. Fetch Image
        let blob;
        let mimeType;
        try {
            const response = await fetch(info.srcUrl);
            if (!response.ok) throw new Error('IMAGE_FETCH_FAILED');
            blob = await response.blob();
            mimeType = blob.type;
        } catch (e) {
            console.error('Fetch failed:', e);
            throw new Error('IMAGE_FETCH_FAILED');
        }

        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        // 2. Call API
        const analysis = await GeminiClient.analyzeImage(apiKey, base64, mimeType);

        // 3. Show Result via Notification
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
             userMessage = '画像の取得に失敗しました。';
        } else if (msg.includes('INVALID_JSON_PAYLOAD') || msg.includes('400')) {
             userMessage = 'APIリクエスト形式が無効です (システム更新待ち)。';
        } else if (msg.includes('AI_PARSE_ERROR')) {
             userMessage = 'AIからの応答を解析できませんでした。';
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
