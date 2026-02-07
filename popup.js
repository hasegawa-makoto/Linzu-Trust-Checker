document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const resultDiv = document.getElementById('result');
  const errorContainer = document.getElementById('errorContainer');

  const imageCountElement = document.getElementById('imageCount');
  const aiProbContainer = document.getElementById('aiProbabilityContainer');
  const aiProbElement = document.getElementById('aiProbability');
  const warningMark = document.getElementById('warningMark');

  const showDetailsButton = document.getElementById('showDetailsButton');
  const detailsContainer = document.getElementById('detailsContainer');
  const detailsList = document.getElementById('detailsList');

  // Helper to show error
  function showError(msg) {
      if (resultDiv) resultDiv.style.display = 'none';
      if (errorContainer) {
          errorContainer.textContent = msg;
          errorContainer.style.display = 'block';
      }
  }

  // Helper to clear error
  function clearError() {
      if (errorContainer) {
          errorContainer.style.display = 'none';
          errorContainer.textContent = '';
      }
  }

  // Helper function to prepare image for analysis
  async function prepareImage(imageUrl) {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to fetch image.');
      const blob = await response.blob();

      const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
      return { base64, mimeType: blob.type };
  }

  // Main Analysis Handler using the GeminiClient
  async function handleVisualAnalysis(imageUrl, apiKey, resultElement) {
      try {
          resultElement.innerHTML = '<span class="ai-analysis-loading">分析中... (数秒かかります)</span>';

          const { base64, mimeType } = await prepareImage(imageUrl);
          const analysisResult = await GeminiClient.analyzeImage(apiKey, base64, mimeType);

          resultElement.innerHTML = `<div class="ai-analysis-result"><strong>AI視覚分析結果:</strong><br>${analysisResult.replace(/\n/g, '<br>')}</div>`;

      } catch (error) {
          console.error('Visual Analysis Error:', error);

          let userMessage = '現在、AI分析サービスが利用できないか、設定の確認が必要です。';

          if (error.message.includes('API key')) {
              userMessage = 'APIキーが無効です。設定をご確認ください。';
          } else if (error.message.includes('429')) {
              userMessage = 'APIのリクエスト制限に達しました。しばらく待ってから再試行してください。';
          } else if (error.message.includes('500') || error.message.includes('503')) {
              userMessage = 'Googleのサービスが一時的に混雑しています。後ほどお試しください。';
          }

          resultElement.innerHTML = `<span style="color: #d32f2f; font-size: 11px;">エラー: ${userMessage}</span>`;
      }
  }

  if (showDetailsButton) {
    showDetailsButton.addEventListener('click', () => {
        if (detailsContainer) {
            const isHidden = detailsContainer.style.display === 'none';
            detailsContainer.style.display = isHidden ? 'block' : 'none';
            showDetailsButton.textContent = isHidden ? '詳細を隠す' : '詳細を表示';
        }
    });
  }

  if (scanButton) {
    scanButton.addEventListener('click', () => {
      clearError();
      if (resultDiv) resultDiv.style.display = 'none';
      if (detailsList) detailsList.innerHTML = '';
      if (detailsContainer) detailsContainer.style.display = 'none';
      if (showDetailsButton) {
          showDetailsButton.style.display = 'none';
          showDetailsButton.textContent = '詳細を表示';
      }

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab) {
            showError('アクティブなタブが見つかりません。');
            return;
        }

        chrome.tabs.sendMessage(activeTab.id, {action: 'scanImages'}, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError.message);
            showError(`エラー: ${chrome.runtime.lastError.message}`);
            return;
          }

          if (response) {
            // Show Result
            if (resultDiv) resultDiv.style.display = 'block';

            // Update Counts
            if (imageCountElement) imageCountElement.textContent = response.count;

            // Determine Overall Status
            let overallStatus = 'low';
            let suspiciousCount = response.suspiciousCount || 0;
            let missingDataCount = 0;

            if (response.details) {
                missingDataCount = response.details.filter(d => d.dataMissing).length;
            }

            if (suspiciousCount > 0) {
                overallStatus = 'high';
            } else if (missingDataCount > 0) {
                overallStatus = 'undetermined';
            }

            // Update Risk UI
            if (aiProbContainer && aiProbElement) {
                aiProbContainer.style.display = 'block';

                const existingExpl = document.getElementById('statusExplanation');
                if (existingExpl) existingExpl.remove();

                if (overallStatus === 'high') {
                    aiProbElement.textContent = '高';
                    aiProbElement.className = 'high-risk';
                    if (warningMark) {
                        warningMark.style.display = 'block';
                        warningMark.classList.add('show-warning');
                    }
                } else if (overallStatus === 'undetermined') {
                    aiProbElement.textContent = '判定保留 (データ不足)';
                    aiProbElement.className = 'status-unknown';
                    if (warningMark) warningMark.style.display = 'none';

                    const expl = document.createElement('p');
                    expl.id = 'statusExplanation';
                    expl.className = 'detail-reason';
                    expl.style.fontSize = '12px';
                    expl.style.marginTop = '8px';
                    expl.style.textAlign = 'center';
                    expl.style.color = '#555';
                    expl.innerHTML = 'SNS等ではメタデータが削除されるため、判定できません。<br><strong>AI視覚分析</strong>をお試しください。';
                    aiProbContainer.appendChild(expl);
                } else {
                    aiProbElement.textContent = '低';
                    aiProbElement.className = 'low-risk';
                    if (warningMark) warningMark.style.display = 'none';
                }
            }

            // Populate Details
            if (response.details && response.details.length > 0 && detailsList) {
                if (showDetailsButton) showDetailsButton.style.display = 'inline-block';

                response.details.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'detail-item';

                    // Thumbnail
                    const thumbImg = document.createElement('img');
                    thumbImg.src = item.url;
                    thumbImg.style.width = '40px';
                    thumbImg.style.height = '40px';
                    thumbImg.style.objectFit = 'cover';
                    thumbImg.style.borderRadius = '4px';
                    thumbImg.style.border = '1px solid #ddd';
                    thumbImg.style.marginRight = '8px';

                    // Flex container for Thumbnail + Content
                    const contentContainer = document.createElement('div');
                    contentContainer.style.display = 'flex';
                    contentContainer.style.alignItems = 'flex-start';
                    contentContainer.appendChild(thumbImg);

                    const textContent = document.createElement('div');
                    textContent.style.flex = '1';

                    // URL
                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'detail-url';
                    urlDiv.textContent = item.url;
                    urlDiv.title = item.url;
                    textContent.appendChild(urlDiv);

                    // Status
                    const statusDiv = document.createElement('div');
                    statusDiv.className = 'detail-status';
                    if (item.error) {
                        statusDiv.textContent = 'エラー';
                        statusDiv.classList.add('status-error');
                    } else if (item.isSuspicious) {
                        statusDiv.textContent = '判定: 疑わしい';
                        statusDiv.classList.add('status-suspicious');
                    } else if (item.dataMissing) {
                        statusDiv.textContent = '判定不可 (データ削除済み)';
                        statusDiv.classList.add('status-unknown');
                    } else {
                        statusDiv.textContent = '判定: 安全/不明';
                        statusDiv.classList.add('status-safe');
                    }
                    textContent.appendChild(statusDiv);

                    contentContainer.appendChild(textContent);
                    li.appendChild(contentContainer);

                    // Explanation / Reason
                    if (item.dataMissing && !item.isSuspicious) {
                        const warnDiv = document.createElement('div');
                        warnDiv.className = 'detail-reason';
                        warnDiv.textContent = 'SNS等によりメタデータが削除された可能性があります。';
                        warnDiv.style.color = '#f57c00';
                        li.appendChild(warnDiv);
                    }
                    if (item.error || item.reason) {
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'detail-reason';
                        msgDiv.textContent = item.error ? `Error: ${item.error}` : item.reason;
                        li.appendChild(msgDiv);
                    }

                    // Metadata
                    if (item.metadata && Object.keys(item.metadata).length > 0) {
                        const metaPre = document.createElement('pre');
                        metaPre.className = 'detail-meta';
                        metaPre.textContent = JSON.stringify(item.metadata, null, 2);
                        li.appendChild(metaPre);
                    }

                    // Action Buttons Container
                    const actionsDiv = document.createElement('div');
                    actionsDiv.style.marginTop = '8px';
                    actionsDiv.style.display = 'flex';
                    actionsDiv.style.gap = '8px';
                    actionsDiv.style.flexWrap = 'wrap';
                    actionsDiv.style.alignItems = 'center';

                    // Google Lens Button
                    if (item.url && !item.url.startsWith('data:')) {
                        const lensLink = document.createElement('a');
                        lensLink.href = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.url)}`;
                        lensLink.target = '_blank';
                        lensLink.className = 'lens-button';
                        lensLink.textContent = 'Googleレンズ';
                        actionsDiv.appendChild(lensLink);
                    }

                    // AI Analysis Button
                    if (!item.error) {
                        const analyzeBtn = document.createElement('button');
                        analyzeBtn.className = 'ai-analysis-button';
                        analyzeBtn.textContent = 'AI視覚分析';

                        const analysisResultDiv = document.createElement('div');

                        analyzeBtn.addEventListener('click', () => {
                            chrome.storage.sync.get('geminiApiKey', (data) => {
                                if (!data.geminiApiKey) {
                                    if (confirm('AI視覚分析にはGemini APIキーが必要です。\n設定画面を開きますか？')) {
                                        if (chrome.runtime.openOptionsPage) {
                                            chrome.runtime.openOptionsPage();
                                        } else {
                                            window.open(chrome.runtime.getURL('options.html'));
                                        }
                                    }
                                } else {
                                    handleVisualAnalysis(item.url, data.geminiApiKey, analysisResultDiv);
                                }
                            });
                        });
                        actionsDiv.appendChild(analyzeBtn);
                        li.appendChild(actionsDiv);
                        li.appendChild(analysisResultDiv);
                    } else {
                        li.appendChild(actionsDiv);
                    }

                    detailsList.appendChild(li);
                });
            }
          } else {
              showError('応答がありません。');
          }
        });
      });
    });
  }
});
