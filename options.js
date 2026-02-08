const i18n = new I18nManager();

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    i18n.localizePage();

    const apiKeyInput = document.getElementById('apiKey');
    const licenseKeyInput = document.getElementById('licenseKey');
    const languageSelect = document.getElementById('languageSelect');
    const saveButton = document.getElementById('saveButton');
    const activateBtn = document.getElementById('activateBtn');
    const statusMessage = document.getElementById('status');
    const licenseStatus = document.getElementById('licenseStatus');
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
        // Check for mismatch
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
        }
    }

    // Handle Language Change
    languageSelect.addEventListener('change', async () => {
        const newLang = languageSelect.value;
        await i18n.init(newLang);
        i18n.localizePage();
        updateLicenseStatus(); // Re-localize status text
    });

    // 3. Save Settings (API Key & Lang)
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

    // 4. Activate License
    activateBtn.addEventListener('click', async () => {
        const key = licenseKeyInput.value.trim();
        if (!key) return;

        activateBtn.disabled = true;
        activateBtn.textContent = i18n.getMessage('statusLicenseCheck');
        statusMessage.textContent = '';

        const result = await LicenseManager.activate(key);

        if (result.success) {
            statusMessage.textContent = i18n.getMessage('licenseSuccess');
            statusMessage.className = 'status-message success';
            updateLicenseStatus();
        } else {
            activateBtn.disabled = false;
            activateBtn.textContent = i18n.getMessage('btnActivate');
            statusMessage.textContent = `${i18n.getMessage('licenseInvalid')}: ${result.error}`;
            statusMessage.className = 'status-message error';
        }
    });
});
