const i18n = new I18nManager();

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    i18n.localizePage();

    // UI Elements
    const masterSwitch = document.getElementById('masterSwitch');
    const filterDuplicate = document.getElementById('filterDuplicate');
    const filterConsecutive = document.getElementById('filterConsecutive');
    const filterMedia = document.getElementById('filterMedia');
    const filterLang = document.getElementById('filterLang');
    const licenseBadge = document.getElementById('licenseBadge');

    const analysisStatus = document.getElementById('analysisStatus');
    const analysisResult = document.getElementById('analysisResult');
    const openOptionsLink = document.getElementById('openOptions');

    // 1. Load Settings
    chrome.storage.sync.get([
        'linzu_masterSwitch',
        'linzu_filterDuplicate',
        'linzu_filterConsecutive',
        'linzu_filterMedia',
        'linzu_filterLang'
    ], (data) => {
        masterSwitch.checked = data.linzu_masterSwitch !== false; // Default ON
        filterDuplicate.checked = data.linzu_filterDuplicate || false;
        filterConsecutive.checked = data.linzu_filterConsecutive || false;
        filterMedia.checked = data.linzu_filterMedia || false;
        filterLang.value = data.linzu_filterLang || 'all';
    });

    // 2. License Status
    const license = await LicenseManager.getLicense();
    if (license && license.key) {
        licenseBadge.textContent = i18n.getMessage('licenseActive');
        licenseBadge.className = 'license-badge active';
        licenseBadge.style.backgroundColor = '#28a745';
    } else {
        licenseBadge.textContent = i18n.getMessage('licenseInactive');
        licenseBadge.className = 'license-badge inactive';
        licenseBadge.style.backgroundColor = '#d32f2f';
    }

    // 3. Image Analysis Status (Mini View)
    chrome.runtime.sendMessage({ action: 'GET_LAST_RESULT' }, (response) => {
        if (!response) return;
        if (response.status === 'success' && response.data) {
            analysisStatus.style.display = 'block';
            analysisResult.textContent = `${response.data.ai_probability}% (${response.data.detected_type})`;
        } else if (response.status === 'analyzing') {
            analysisStatus.style.display = 'block';
            analysisResult.textContent = i18n.getMessage('statusAnalyzing');
        }
    });

    // 4. Save Logic
    function saveSetting(key, value) {
        chrome.storage.sync.set({ [key]: value });
    }

    masterSwitch.addEventListener('change', () => saveSetting('linzu_masterSwitch', masterSwitch.checked));
    filterDuplicate.addEventListener('change', () => saveSetting('linzu_filterDuplicate', filterDuplicate.checked));
    filterConsecutive.addEventListener('change', () => saveSetting('linzu_filterConsecutive', filterConsecutive.checked));
    filterMedia.addEventListener('change', () => saveSetting('linzu_filterMedia', filterMedia.checked));
    filterLang.addEventListener('change', () => saveSetting('linzu_filterLang', filterLang.value));

    // 5. Open Options
    openOptionsLink.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    });
});
