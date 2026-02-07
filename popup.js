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

  // Gemini Analysis Function
  async function analyzeImageWithGemini(imageUrl, apiKey, resultElement) {
      try {
          resultElement.innerHTML = '<span class="ai-analysis-loading">分析中... (数秒かかります)</span>';

          // 1. Fetch Image and Convert to Base64
          // Note: Fetching from popup context might hit CORS unless <all_urls> is active, which it is.
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error('Failed to fetch image for analysis.');
          const blob = await response.blob();

          const base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                  const base64 = reader.result.split(',')[1];
                  resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });

          // 2. Call Gemini API
          const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

          const requestBody = {
              contents: [{
                  parts: [
                      { text: "Analyze this image for visual evidence of AI generation (e.g., artifacts, unnatural lighting, anatomy issues). Be concise and respond in Japanese. output format: 【判定】(AI or Natural or Unknown) \n【理由】(Reason)" },
                      { inline_data: { mime_type: blob.type, data: base64Data } }
                  ]
              }]
          };

          const apiResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
          });

          if (!apiResponse.ok) {
              const errorData = await apiResponse.json();
              throw new Error(`Gemini API Error: ${errorData.error?.message || apiResponse.statusText}`);
          }

          const data = await apiResponse.json();
          const analysisText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';

          // Format the output
          resultElement.innerHTML = `<div class="ai-analysis-result"><strong>AI視覚分析結果:</strong><br>${analysisText.replace(/\n/g, '<br>')}</div>`;

      } catch (error) {
          console.error('Analysis Error:', error);
          resultElement.innerHTML = `<span style="color: #d32f2f; font-size: 11px;">エラー: ${error.message}</span>`;
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

                // Clear existing explanation
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

                    // URL
                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'detail-url';
                    urlDiv.textContent = item.url;
                    urlDiv.title = item.url;
                    li.appendChild(urlDiv);

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
                    li.appendChild(statusDiv);

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
                    // Only show for valid URLs (can't easily analyze data URIs if too large, but fetch handles it usually)
                    // Let's show it for all valid items
                    if (!item.error) {
                        const analyzeBtn = document.createElement('button');
                        analyzeBtn.className = 'ai-analysis-button';
                        analyzeBtn.textContent = 'AI視覚分析';

                        // Result Container (appended after buttons)
                        const analysisResultDiv = document.createElement('div');

                        analyzeBtn.addEventListener('click', () => {
                            // Check API Key
                            chrome.storage.sync.get('geminiApiKey', (data) => {
                                if (!data.geminiApiKey) {
                                    // Prompt to open settings
                                    if (confirm('AI視覚分析にはGemini APIキーが必要です。\n設定画面を開きますか？')) {
                                        if (chrome.runtime.openOptionsPage) {
                                            chrome.runtime.openOptionsPage();
                                        } else {
                                            window.open(chrome.runtime.getURL('options.html'));
                                        }
                                    }
                                } else {
                                    // Perform Analysis
                                    analyzeImageWithGemini(item.url, data.geminiApiKey, analysisResultDiv);
                                }
                            });
                        });
                        actionsDiv.appendChild(analyzeBtn);
                        li.appendChild(actionsDiv); // Buttons row
                        li.appendChild(analysisResultDiv); // Result area below buttons
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
