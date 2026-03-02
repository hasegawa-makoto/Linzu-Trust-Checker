const i18n = new I18nManager();

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    i18n.localizePage();

    // UI Elements
    const languageSelect = document.getElementById('languageSelect');

    const licenseKeyInput = document.getElementById('licenseKey');
    const licenseStatus = document.getElementById('licenseStatus');
    const activateBtn = document.getElementById('activateBtn');
    const licenseMsg = document.getElementById('licenseMsg');

    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    const apiKeyMsg = document.getElementById('apiKeyMsg');
    const apiGuideText = document.getElementById('apiGuideText');

    const introText = document.querySelector('.explanation');

    // Setup Custom Dynamic HTML Translations
    function updateDynamicText() {
        apiGuideText.innerHTML = i18n.getMessage('apiKeyGuideText');
        // i18nManager handles placeholder automatically if we have data-i18n on the input,
        // but just in case, we can ensure it here.
        licenseKeyInput.placeholder = i18n.getMessage('licensePlaceholder');
    }

    // Initial call
    updateDynamicText();

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
    } else if (reason === 'license_required') {
        const warning = document.createElement('div');
        warning.className = 'status-message error';
        warning.style.marginBottom = '16px';
        warning.textContent = i18n.getMessage('statusLicenseRedirect');
        // Prepend to license section or top
        const container = document.querySelector('.container');
        container.insertBefore(warning, container.firstChild.nextSibling.nextSibling); // After H1 and Language
        licenseKeyInput.focus();
    }

    // 2. Load API Key, Language, and License
    chrome.storage.sync.get(['geminiApiKey', 'outputLanguage'], (data) => {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
        }
        if (data.outputLanguage) {
            languageSelect.value = data.outputLanguage;
        } else {
            const lang = i18n.getBrowserLang();
            languageSelect.value = lang;
        }

        // Ensure UI matches stored language immediately
        if (data.outputLanguage && data.outputLanguage !== i18n.currentLang) {
             i18n.init(data.outputLanguage).then(() => i18n.localizePage());
        }
    });

    // Check License Status
    updateLicenseStatus();

    async function updateLicenseStatus() {
        const license = await LicenseManager.getLicense();
        if (license && license.key) {
            licenseStatus.textContent = i18n.getMessage('licenseActive');
            licenseStatus.className = 'license-status status-active';
            licenseKeyInput.value = license.key;
            licenseKeyInput.disabled = true;
            activateBtn.disabled = true;
            activateBtn.textContent = i18n.getMessage('licenseActive');
        } else {
            licenseStatus.textContent = i18n.getMessage('licenseInactive');
            licenseStatus.className = 'license-status status-inactive';
            activateBtn.disabled = false;
            activateBtn.textContent = i18n.getMessage('btnActivate');
        }
    }

    // 3. Handle Language Change (Immediate Save & Update)
    languageSelect.addEventListener('change', async () => {
        const newLang = languageSelect.value;

        // Save Language
        chrome.storage.sync.set({ outputLanguage: newLang }, async () => {
            // Update UI immediately
            await i18n.init(newLang);
            i18n.localizePage();
            updateLicenseStatus(); // Re-localize status text
            updateDynamicText();   // Update innerHTML guide text & placeholder

            // Trigger Background Update for Context Menu via message
            chrome.runtime.sendMessage({ action: 'UPDATE_CONTEXT_MENU_LANG', lang: newLang });
        });
    });

    // 4. Save API Key Independently
    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();

        if (!key) {
            apiKeyMsg.textContent = i18n.getMessage('optionsEnterKey');
            apiKeyMsg.className = 'status-message error';
            return;
        }

        chrome.storage.sync.set({ geminiApiKey: key }, () => {
            apiKeyMsg.textContent = i18n.getMessage('optionsSaved');
            apiKeyMsg.className = 'status-message success';
            setTimeout(() => {
                apiKeyMsg.textContent = '';
            }, 2000);
        });
    });

    // 5. Activate License Independently
    activateBtn.addEventListener('click', async () => {
        const key = licenseKeyInput.value.trim();
        if (!key) return;

        activateBtn.disabled = true;
        activateBtn.textContent = i18n.getMessage('statusLicenseCheck');
        licenseMsg.textContent = '';
        licenseMsg.className = 'status-message';

        const result = await LicenseManager.activate(key);

        if (result.success) {
            licenseMsg.textContent = i18n.getMessage('licenseSuccess');
            licenseMsg.className = 'status-message success';
            updateLicenseStatus();
        } else {
            activateBtn.disabled = false;
            activateBtn.textContent = i18n.getMessage('btnActivate');
            licenseMsg.textContent = `${i18n.getMessage('licenseInvalid')}: ${result.error}`;
            licenseMsg.className = 'status-message error';
        }
    });
});
