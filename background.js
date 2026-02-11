importScripts('libs/api_client.js', 'libs/license_manager.js');

// Linzu Trust Checker - Background Script
let lastResult = {
    status: 'idle',
    data: null,
    error: null,
    imageUrl: null,
    timestamp: null
};

// Simple I18n Helper for Background
const getMessage = async (key, lang = 'en') => {
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        const messages = await response.json();
        return messages[key]?.message || key;
    } catch (e) {
        // Fallback to English or key
        if (lang !== 'en') return getMessage(key, 'en');
        return key;
    }
};

function updateState(newState) {
    lastResult = { ...lastResult, ...newState, timestamp: Date.now() };
    chrome.runtime.sendMessage({ action: 'STATE_UPDATED', state: lastResult }).catch(() => {});
}

function notifyContentScript(tabId, message) {
    chrome.tabs.sendMessage(tabId, message).catch(err => {
        console.warn('Failed to send message to content script:', err);
    });
}

function mapError(error) {
    let code = error.code || 'UNKNOWN';
    let status = error.status || 0;
    let message = error.message || '';

    if (status === 429 || message.includes('429')) code = 'RATE_LIMIT_EXCEEDED';
    else if (status === 401 || status === 403 || message.includes('API key')) code = 'API_KEY_INVALID';
    else if (status === 404 || message.includes('MODEL_NOT_FOUND')) code = 'MODEL_NOT_FOUND';
    else if (code === 'IMAGE_FETCH_FAILED') code = 'IMAGE_FETCH_FAILED';
    else if (code === 'API_KEY_MISSING') code = 'API_KEY_MISSING';
    else if (code === 'LICENSE_REQUIRED') code = 'LICENSE_REQUIRED';

    // We need localized error messages.
    // However, mapError is synchronous and usually called within async flow.
    // For now, let's return keys and let content script localize or async fetch here.
    // Or better, let's make mapError async or handle localization at the call site.
    // Given the constraints, let's keep it simple: return keys, but we need text for notification.
    // Chrome.i18n.getMessage works for browser locale.
    // If we want extension locale, we need the helper.
    // Let's rely on browser locale for notifications (standard behavior) but content script for custom overlay.

    let userTitle = chrome.i18n.getMessage('statusError');
    let userMessage = chrome.i18n.getMessage('errMsgNet');

    switch (code) {
        case 'RATE_LIMIT_EXCEEDED':
            userTitle = chrome.i18n.getMessage('errTitle429');
            userMessage = chrome.i18n.getMessage('errMsg429');
            break;
        case 'API_KEY_INVALID':
        case 'API_KEY_MISSING':
            userTitle = chrome.i18n.getMessage('errTitleKey');
            userMessage = chrome.i18n.getMessage('errMsgKey');
            break;
        case 'MODEL_NOT_FOUND':
            userTitle = chrome.i18n.getMessage('errTitleModel');
            userMessage = chrome.i18n.getMessage('errMsgModel');
            break;
        case 'IMAGE_FETCH_FAILED':
            userTitle = chrome.i18n.getMessage('errTitleImage');
            userMessage = chrome.i18n.getMessage('errMsgImage');
            break;
        case 'NETWORK_ERROR':
            userTitle = chrome.i18n.getMessage('errTitleNet');
            userMessage = chrome.i18n.getMessage('errMsgNet');
            break;
        case 'AI_PARSE_ERROR':
            userTitle = chrome.i18n.getMessage('errTitleParse');
            userMessage = chrome.i18n.getMessage('errMsgParse');
            break;
        case 'LICENSE_REQUIRED':
            userTitle = chrome.i18n.getMessage('errTitleLicense');
            userMessage = chrome.i18n.getMessage('errMsgLicense');
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

// Initial Context Menu Creation
chrome.runtime.onInstalled.addListener(() => {
    // Get stored lang or default 'en' (browser locale might be different but let's default safe)
    chrome.storage.sync.get('outputLanguage', async (data) => {
        const lang = data.outputLanguage || 'en'; // Default to EN if not set, or we could detect.
        const title = await getMessage('contextMenuAnalyze', lang);

        chrome.contextMenus.create({
            id: "analyze-image",
            title: title,
            contexts: ["image"]
        });
    });
});

async function performAnalysis(url, apiKey, lang) {
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
        err.code = e.code || 'IMAGE_FETCH_FAILED';
        throw err;
    }

    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    return await GeminiClient.analyzeImage(apiKey, base64, mimeType, lang);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_LAST_RESULT') {
        sendResponse(lastResult);
    }

    // Update Context Menu Language
    if (message.action === 'UPDATE_CONTEXT_MENU_LANG') {
        const lang = message.lang;
        (async () => {
             const title = await getMessage('contextMenuAnalyze', lang);
             chrome.contextMenus.update("analyze-image", { title: title });
        })();
    }

    if (message.action === 'ANALYZE_IMAGE_REQUEST') {
        // Manual Request from Popup (Check License Here Too)
        (async () => {
            const hasLicense = await LicenseManager.validate();
            if (!hasLicense) {
                sendResponse({ success: false, error: 'LICENSE_REQUIRED' });
                return;
            }
            // If license valid, proceed...
            // BUT popup.js flow currently calls background just to "proxy".
            // We need to implement proper manual flow if we want consistency.
            // For now, popup is mainly for status viewing, context menu is main entry.
            // If the user uses the "Analyze" button in popup list (if re-enabled or legacy),
            // we should perform license check.
            performAnalysis(message.url, message.apiKey, 'ja') // Default lang or pass it
                .then(res => sendResponse({ success: true, data: res }))
                .catch(err => sendResponse({ success: false, error: err.code || err.message }));
        })();
        return true;
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "analyze-image") {
    try {
        // 1. Get Settings & Lang first to show immediate UI
        const data = await chrome.storage.sync.get(['geminiApiKey', 'outputLanguage']);
        const apiKey = data.geminiApiKey;
        const lang = data.outputLanguage || 'ja'; // Default fallback

        // 2. IMMEDIATE UI FEEDBACK: Show "Analyzing..." Modal
        const analyzingTitle = await getMessage('extName', lang);
        const analyzingMsg = await getMessage('statusAnalyzing', lang);

        notifyContentScript(tab.id, {
            action: 'SHOW_ANALYZING',
            text: analyzingMsg,
            title: analyzingTitle
        });

        // 3. Validate License
        const hasLicense = await LicenseManager.validate();
        if (!hasLicense) {
            const err = new Error('License Required');
            err.code = 'LICENSE_REQUIRED';
            throw err;
        }

        if (!apiKey) {
            const err = new Error('API Key Missing');
            err.code = 'API_KEY_MISSING';
            throw err;
        }

        updateState({ status: 'analyzing', imageUrl: info.srcUrl, error: null, data: null });

        // Use browser locale for notification or custom?
        // Notifications are system level, keeping browser locale is often safer for system consistency,
        // but user asked for language consistency. Let's use custom lang for notification too if possible.
        // Chrome.i18n.getMessage is strictly browser locale.
        // We can fetch message manually.

        chrome.notifications.create('linzu-start', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: analyzingTitle,
            message: analyzingMsg,
            priority: 0
        });

        const analysis = await performAnalysis(info.srcUrl, apiKey, lang);

        updateState({ status: 'success', data: analysis });

        notifyContentScript(tab.id, {
            action: 'SHOW_RESULT',
            data: analysis,
            lang: lang // Pass lang so content script can localize static labels if needed (though passed data is already localized by API)
        });

        const prob = analysis.ai_probability;
        const successTitle = await getMessage('statusSuccess', lang);
        const noReasons = await getMessage('noReasons', lang);
        const resultTitle = `${successTitle}: ${prob}%`;
        const resultMessage = `${analysis.detected_type}\n${analysis.reasons?.[0] || noReasons}`;

        chrome.notifications.create('linzu-success', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: resultTitle,
            message: resultMessage,
            priority: 1
        });

    } catch (error) {
        console.error('Background Analysis Error:', error);

        const structuredError = mapError(error);

        updateState({ status: 'error', error: structuredError.message });

        // Fetch localized error strings for the custom lang if needed,
        // but mapError currently returns browser locale strings.
        // For strict consistency, mapError should also support async fetching or accept lang.
        // Let's settle for browser locale for errors for now as they are system/network level often.
        // Or better, let's try to get custom title/message for the overlay.

        notifyContentScript(tab.id, {
            action: 'SHOW_ERROR',
            ...structuredError
        });

        chrome.notifications.create('linzu-error', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: structuredError.title,
            message: structuredError.message,
            priority: 2
        });

        if (structuredError.code === 'API_KEY_MISSING') {
             chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=missing_key') });
        }

        if (structuredError.code === 'LICENSE_REQUIRED') {
            const redirectTitle = await getMessage('extName', 'en'); // Fallback or detect
            const redirectMsg = await getMessage('statusLicenseRedirect', 'en');

            chrome.notifications.create('linzu-redirect', {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: redirectTitle,
                message: redirectMsg,
                priority: 2
            });
            setTimeout(() => {
                chrome.tabs.create({ url: chrome.runtime.getURL('options.html?reason=license_required') });
            }, 1500);
        }
    }
  }
});
