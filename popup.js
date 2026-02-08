document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const resultDiv = document.getElementById('result');
  const errorContainer = document.getElementById('errorContainer');

  // UI Elements
  const aiProbElement = document.getElementById('aiProbability');
  const aiProbContainer = document.getElementById('aiProbabilityContainer');
  const detailsContainer = document.getElementById('detailsContainer');
  const detailsList = document.getElementById('detailsList');
  const imageCountElement = document.getElementById('imageCount');
  const warningMark = document.getElementById('warningMark');

  // Helper to show errors
  function showError(msg, isHtml = false) {
      if (resultDiv) resultDiv.style.display = 'none';
      if (errorContainer) {
          if (isHtml) errorContainer.innerHTML = msg;
          else errorContainer.textContent = msg;
          errorContainer.style.display = 'block';
      }
  }

  // Helper to clear errors
  function clearError() {
      if (errorContainer) {
          errorContainer.style.display = 'none';
          errorContainer.textContent = '';
      }
  }

  // Helper to fetch and convert image to base64
  async function prepareImage(imageUrl) {
      try {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error('Failed to fetch image.');
          const blob = await response.blob();
          const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
          return { base64, mimeType: blob.type };
      } catch (e) {
          throw new Error('画像の取得に失敗しました。');
      }
  }

  if (scanButton) {
    scanButton.addEventListener('click', () => {
      clearError();
      if (resultDiv) resultDiv.style.display = 'none';

      // 1. API Key Check
      chrome.storage.sync.get('geminiApiKey', (data) => {
        const apiKey = data.geminiApiKey;
        if (!apiKey) {
            showError('Gemini APIキーが設定されていません。<br><a href="#" id="openOptions">設定画面でAPIキーを入力してください</a>', true);
            document.getElementById('openOptions').addEventListener('click', (e) => {
                e.preventDefault();
                if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
                else window.open(chrome.runtime.getURL('options.html'));
            });
            return;
        }

        // 2. Scan for Main Image
        if (imageCountElement) imageCountElement.textContent = 'スキャン中...';
        if (resultDiv) resultDiv.style.display = 'block';

        // Hide previous results
        if (aiProbContainer) aiProbContainer.style.display = 'none';
        if (detailsContainer) detailsContainer.style.display = 'none';
        if (warningMark) warningMark.style.display = 'none';

        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab) return showError('アクティブなタブが見つかりません。');

            chrome.tabs.sendMessage(activeTab.id, {action: 'GET_MAIN_IMAGE'}, async (response) => {
                if (chrome.runtime.lastError) {
                    return showError('ページとの通信に失敗しました。再読み込みしてください。');
                }

                if (!response || !response.success) {
                    return showError(response?.error || '画像が見つかりませんでした。');
                }

                const imageUrl = response.url;

                // 3. Prepare and Send to API
                try {
                    if (imageCountElement) imageCountElement.textContent = 'AI解析中... (Gemini)';

                    const { base64, mimeType } = await prepareImage(imageUrl);
                    const analysis = await GeminiClient.analyzeImage(apiKey, base64, mimeType);

                    // 4. Update UI with Results
                    if (imageCountElement) imageCountElement.textContent = '分析完了';

                    if (aiProbContainer) {
                        aiProbContainer.style.display = 'block';
                        const prob = analysis.ai_probability;
                        aiProbElement.textContent = `${prob}%`;

                        // Color coding
                        if (prob >= 80) aiProbElement.style.color = '#d32f2f'; // Red
                        else if (prob >= 50) aiProbElement.style.color = '#f57c00'; // Orange
                        else aiProbElement.style.color = '#2e7d32'; // Green
                    }

                    if (detailsContainer && detailsList) {
                        detailsContainer.style.display = 'block';
                        detailsList.innerHTML = '';

                        // Detected Type Item
                        const typeItem = document.createElement('li');
                        const typeLabel = document.createElement('strong');
                        typeLabel.textContent = '検出タイプ: ';
                        const typeValue = document.createTextNode(analysis.detected_type);
                        typeItem.appendChild(typeLabel);
                        typeItem.appendChild(typeValue);
                        detailsList.appendChild(typeItem);

                        // Reasons
                        if (analysis.reasons && analysis.reasons.length > 0) {
                            analysis.reasons.forEach(reason => {
                                const li = document.createElement('li');
                                li.textContent = reason;
                                detailsList.appendChild(li);
                            });
                        } else {
                            const li = document.createElement('li');
                            li.textContent = '特筆すべき理由はありません。';
                            detailsList.appendChild(li);
                        }
                    }

                    if (warningMark && analysis.is_ai_likely) {
                        warningMark.style.display = 'block';
                    } else if (warningMark) {
                        warningMark.style.display = 'none';
                    }

                } catch (err) {
                    // Specific Error Handling for User Friendliness
                    if (err.message.includes('MODEL_NOT_FOUND') || err.message.includes('404')) {
                         showError('現在システムを更新中です。しばらくしてから再度お試しください。');
                    } else if (err.message.includes('API Key')) {
                         showError('APIキーが無効のようです。設定画面で再確認してください。');
                    } else {
                         showError(`分析エラー: ${err.message}`);
                    }
                }
            });
        });
      });
    });
  }
});
