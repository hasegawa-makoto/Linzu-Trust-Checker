document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveButton');
    const apiKeyInput = document.getElementById('apiKey');
    const statusDiv = document.getElementById('status');

    // Load existing settings
    chrome.storage.sync.get('geminiApiKey', (items) => {
        if (items.geminiApiKey) {
            apiKeyInput.value = items.geminiApiKey;
        }
    });

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            statusDiv.textContent = 'APIキーを入力してください。';
            statusDiv.className = 'status-message error';
            return;
        }

        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
            statusDiv.textContent = '設定を保存しました。';
            statusDiv.className = 'status-message success';
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.className = 'status-message';
            }, 3000);
        });
    });
});
