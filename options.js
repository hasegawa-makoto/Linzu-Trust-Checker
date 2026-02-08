const i18n = new I18nManager();

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize I18n
    await i18n.init();
    i18n.localizePage();

    const apiKeyInput = document.getElementById('apiKey');
    const languageSelect = document.getElementById('languageSelect');
    const saveButton = document.getElementById('saveButton');
    const statusMessage = document.getElementById('status');
    const introText = document.querySelector('.explanation');

    // 1. Check for Query Params (e.g., ?reason=missing_key)
    const urlParams = new URLSearchParams(window.location.search);
    const reason = urlParams.get('reason');
    if (reason === 'missing_key') {
        const warning = document.createElement('div');
        warning.className = 'status-message error';
        warning.style.marginBottom = '16px';
        warning.textContent = i18n.getMessage('optionsGuidance');
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
            const lang = i18n.getBrowserLang();
            languageSelect.value = lang;
        }
        // Force re-localize if the loaded lang differs from what I18nManager guessed initially (rare but possible)
        if (data.outputLanguage && data.outputLanguage !== i18n.currentLang) {
             i18n.init(data.outputLanguage).then(() => i18n.localizePage());
        }
    });

    // Handle Language Change Immediately
    languageSelect.addEventListener('change', async () => {
        const newLang = languageSelect.value;
        await i18n.init(newLang);
        i18n.localizePage();
    });

    // 3. Save Settings
    saveButton.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const lang = languageSelect.value;

        if (!key) {
            statusMessage.textContent = i18n.getMessage('optionsEnterKey');
            statusMessage.className = 'status-message error';
            return;
        }

        chrome.storage.sync.set({
            geminiApiKey: key,
            outputLanguage: lang
        }, () => {
            statusMessage.textContent = i18n.getMessage('optionsSaved');
            statusMessage.className = 'status-message success';
            setTimeout(() => {
                statusMessage.textContent = '';
            }, 2000);
        });
    });
});
