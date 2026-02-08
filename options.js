document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const languageSelect = document.getElementById('languageSelect');
    const saveButton = document.getElementById('saveButton');
    const statusMessage = document.getElementById('status');
    const introText = document.querySelector('.explanation');

    // Localize HTML
    document.querySelectorAll('[data-i18n]').forEach(elem => {
        const msg = chrome.i18n.getMessage(elem.getAttribute('data-i18n'));
        if(msg) elem.textContent = msg;
    });

    // 1. Check for Query Params (e.g., ?reason=missing_key)
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');
    if (reason === 'missing_key') {
        const warning = document.createElement('div');
        warning.className = 'status-message error';
        warning.style.marginBottom = '16px';
        warning.textContent = chrome.i18n.getMessage('optionsGuidance');
        introText.prepend(warning);
        apiKeyInput.focus();
    }

    // 2. Load API Key and Language
    chrome.storage.sync.get(['geminiApiKey', 'outputLanguage'], (data) => {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
        }
        if (data.outputLanguage) {
            languageSelect.value = data.outputLanguage;
        } else {
            // Default to browser language if starts with ja, else en
            const lang = navigator.language || navigator.userLanguage;
            if (lang && lang.startsWith('ja')) languageSelect.value = 'ja';
            else languageSelect.value = 'en';
        }
    });

    // 3. Save Settings
    saveButton.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const lang = languageSelect.value;

        if (!key) {
            statusMessage.textContent = chrome.i18n.getMessage('optionsEnterKey');
            statusMessage.className = 'status-message error';
            return;
        }

        chrome.storage.sync.set({
            geminiApiKey: key,
            outputLanguage: lang
        }, () => {
            statusMessage.textContent = chrome.i18n.getMessage('optionsSaved');
            statusMessage.className = 'status-message success';
            setTimeout(() => {
                statusMessage.textContent = '';
            }, 2000);
        });
    });
});
