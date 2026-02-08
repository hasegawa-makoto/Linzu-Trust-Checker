document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
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
        warning.textContent = '解析を始めるには、まずこちらにAPIキーを入力して保存してください。';
        introText.prepend(warning);
        apiKeyInput.focus();
    }

    // 2. Load API Key
    chrome.storage.sync.get('geminiApiKey', (data) => {
        if (data.geminiApiKey) {
            apiKeyInput.value = data.geminiApiKey;
        }
    });

    // 3. Save API Key
    saveButton.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            statusMessage.textContent = 'APIキーを入力してください。';
            statusMessage.className = 'status-message error';
            return;
        }

        chrome.storage.sync.set({ geminiApiKey: key }, () => {
            statusMessage.textContent = '保存しました！';
            statusMessage.className = 'status-message success';
            setTimeout(() => {
                statusMessage.textContent = '';
                // Optional: close if opened from popup
            }, 2000);
        });
    });
});
