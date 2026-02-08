document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const apiKeyWarning = document.getElementById('apiKeyWarning');
    const openSettingsLink = document.getElementById('openSettingsLink');
    const settingsBtn = document.getElementById('settingsBtn');

    const stateIdle = document.getElementById('stateIdle');
    const stateAnalyzing = document.getElementById('stateAnalyzing');
    const stateSuccess = document.getElementById('stateSuccess');
    const stateError = document.getElementById('stateError');

    const resultThumb = document.getElementById('resultThumb');
    const resultProb = document.getElementById('resultProb');
    const resultType = document.getElementById('resultType');
    const resultReasons = document.getElementById('resultReasons');

    const errorMsg = document.getElementById('errorMsg');
    const errorDetail = document.getElementById('errorDetail');

    function showState(state) {
        stateIdle.classList.remove('visible');
        stateAnalyzing.classList.remove('visible');
        stateSuccess.classList.remove('visible');
        stateError.classList.remove('visible');

        if (state === 'idle') stateIdle.classList.add('visible');
        else if (state === 'analyzing') stateAnalyzing.classList.add('visible');
        else if (state === 'success') stateSuccess.classList.add('visible');
        else if (state === 'error') stateError.classList.add('visible');
    }

    function openOptions() {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    }

    // 1. Check API Key
    chrome.storage.sync.get('geminiApiKey', (data) => {
        if (!data.geminiApiKey) {
            apiKeyWarning.style.display = 'block';
        }
    });

    // 2. Poll Status from Background
    function checkStatus() {
        chrome.runtime.sendMessage({ action: 'GET_LAST_RESULT' }, (response) => {
            if (!response) return;

            if (response.status === 'idle') {
                showState('idle');
            } else if (response.status === 'analyzing') {
                showState('analyzing');
            } else if (response.status === 'success' && response.data) {
                showState('success');
                renderResult(response.data, response.imageUrl);
            } else if (response.status === 'error') {
                showState('error');
                errorDetail.textContent = response.error || '不明なエラー';
            }
        });
    }

    // Initial check
    checkStatus();

    // Listen for updates (broadcast from background)
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'STATE_UPDATED') {
            checkStatus();
        }
    });

    // Event Listeners
    if (openSettingsLink) openSettingsLink.addEventListener('click', openOptions);
    if (settingsBtn) settingsBtn.addEventListener('click', openOptions);

    function renderResult(analysis, imageUrl) {
        if (imageUrl) resultThumb.src = imageUrl;
        else resultThumb.style.display = 'none';

        resultProb.textContent = `${analysis.ai_probability}%`;

        if (analysis.ai_probability >= 80) resultProb.style.color = '#d32f2f';
        else if (analysis.ai_probability >= 50) resultProb.style.color = '#f57c00';
        else resultProb.style.color = '#2e7d32';

        resultType.textContent = analysis.detected_type || 'Unknown';

        resultReasons.innerHTML = '';
        if (analysis.reasons && analysis.reasons.length > 0) {
            analysis.reasons.forEach(r => {
                const li = document.createElement('li');
                li.textContent = r;
                resultReasons.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = '特筆すべき理由はありません';
            resultReasons.appendChild(li);
        }
    }
});
