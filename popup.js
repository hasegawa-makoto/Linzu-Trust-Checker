document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('scanButton');
    const imageListContainer = document.getElementById('imageListContainer');
    const errorContainer = document.getElementById('errorContainer');

    function showError(msg, isHtml = false) {
        if (errorContainer) {
            if (isHtml) errorContainer.innerHTML = msg;
            else errorContainer.textContent = msg;
            errorContainer.style.display = 'block';
        }
    }

    function clearError() {
        if (errorContainer) {
            errorContainer.style.display = 'none';
            errorContainer.textContent = '';
        }
    }

    if (scanButton) {
        scanButton.addEventListener('click', () => {
            clearError();
            if (imageListContainer) imageListContainer.innerHTML = '';

            // 1. Scan Page for Images (List Up)
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const activeTab = tabs[0];
                if (!activeTab) return showError('アクティブなタブが見つかりません。');

                chrome.tabs.sendMessage(activeTab.id, {action: 'SCAN_IMAGES'}, (response) => {
                    if (chrome.runtime.lastError) {
                        return showError('ページとの通信に失敗しました。再読み込みしてください。');
                    }

                    if (!response || !response.success) {
                        return showError(response?.error || '画像が見つかりませんでした。');
                    }

                    const images = response.images;
                    if (!images || images.length === 0) {
                        return showError('スキャン可能な画像が見つかりませんでした。');
                    }

                    // Render List
                    images.forEach(img => {
                        console.log('Rendering image:', img.url);
                        const li = document.createElement('li');
                        li.className = 'image-item';

                        const topRow = document.createElement('div');
                        topRow.className = 'item-top';

                        const thumb = document.createElement('img');
                        thumb.className = 'thumbnail';
                        thumb.src = img.url;
                        topRow.appendChild(thumb);

                        const info = document.createElement('div');
                        info.className = 'item-info';

                        const urlDiv = document.createElement('div');
                        urlDiv.className = 'item-url';
                        urlDiv.textContent = img.url;
                        info.appendChild(urlDiv);

                        const analyzeBtn = document.createElement('button');
                        analyzeBtn.className = 'analyze-btn';
                        analyzeBtn.textContent = 'AI分析を実行';

                        // Result Area (Hidden initially)
                        const resultArea = document.createElement('div');
                        resultArea.className = 'result-area';

                        // Handle Analyze Click
                        analyzeBtn.addEventListener('click', () => {
                            analyzeImage(img.url, li, analyzeBtn, resultArea);
                        });

                        info.appendChild(analyzeBtn);
                        topRow.appendChild(info);

                        // Explicitly append both
                        li.appendChild(topRow);
                        li.appendChild(resultArea);

                        console.log('LI HTML:', li.outerHTML);

                        imageListContainer.appendChild(li);
                    });
                });
            });
        });
    }

    function analyzeImage(url, liElement, buttonElement, resultArea) {
        // 1. Loading State
        buttonElement.disabled = true;
        buttonElement.textContent = '分析中...';
        resultArea.style.display = 'none';

        // 2. Get API Key
        chrome.storage.sync.get('geminiApiKey', (data) => {
            const apiKey = data.geminiApiKey;
            if (!apiKey) {
                buttonElement.disabled = false;
                buttonElement.textContent = 'AI分析を実行';
                showError('Gemini APIキーが設定されていません。<br><a href="#" id="openOptions">設定画面でAPIキーを入力してください</a>', true);

                const link = document.getElementById('openOptions');
                if(link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
                        else window.open(chrome.runtime.getURL('options.html'));
                    });
                }
                return;
            }

            // 3. Request Analysis from Background
            chrome.runtime.sendMessage({
                action: 'ANALYZE_IMAGE_REQUEST',
                url: url,
                apiKey: apiKey
            }, (result) => {
                buttonElement.disabled = false;
                buttonElement.textContent = '再分析';

                if (chrome.runtime.lastError) {
                    showError(`通信エラー: ${chrome.runtime.lastError.message}`);
                    return;
                }

                if (result && result.success) {
                    const analysis = result.data;
                    renderResult(resultArea, analysis);
                } else {
                    // Handle Errors (e.g., 429)
                    let userMessage = `エラー: ${result.error || '不明なエラー'}`;
                    const err = result.error || '';

                    if (err.includes('429')) {
                        userMessage = 'APIの利用制限に達しました。1〜2分待ってから再度お試しください。';
                    } else if (err.includes('MODEL_NOT_FOUND')) {
                        userMessage = 'システム更新中です。後ほどお試しください。';
                    } else if (err.includes('INVALID_JSON')) {
                        userMessage = '解析データの準備に失敗しました。';
                    }

                    resultArea.style.display = 'block';
                    resultArea.innerHTML = `<div style="color: #d32f2f; font-size: 11px;">${userMessage}</div>`;
                }
            });
        });
    }

    function renderResult(container, analysis) {
        container.style.display = 'block';
        container.innerHTML = ''; // Clear previous

        const probDisplay = document.createElement('div');
        probDisplay.className = 'prob-display';

        const label = document.createElement('span');
        label.className = 'prob-label';
        label.textContent = 'AI生成確率';
        probDisplay.appendChild(label);

        const value = document.createElement('span');
        value.className = 'prob-value';
        value.textContent = `${analysis.ai_probability}%`;

        if (analysis.ai_probability >= 80) value.style.color = '#d32f2f'; // Red
        else if (analysis.ai_probability >= 50) value.style.color = '#f57c00'; // Orange
        else value.style.color = '#2e7d32'; // Green

        probDisplay.appendChild(value);
        container.appendChild(probDisplay);

        // Add type info
        const typeInfo = document.createElement('div');
        typeInfo.style.fontSize = '11px';
        typeInfo.style.marginBottom = '4px';
        typeInfo.innerHTML = `<strong>タイプ:</strong> ${analysis.detected_type}`;
        container.appendChild(typeInfo);

        if (analysis.reasons && analysis.reasons.length > 0) {
            const list = document.createElement('ul');
            list.className = 'reasons-list';
            analysis.reasons.forEach(r => {
                const item = document.createElement('li');
                item.textContent = r;
                list.appendChild(item);
            });
            container.appendChild(list);
        } else {
            const noReason = document.createElement('div');
            noReason.style.fontSize = '11px';
            noReason.style.color = '#666';
            noReason.textContent = '特筆すべき理由はありません。';
            container.appendChild(noReason);
        }
    }
});
