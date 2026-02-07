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

  function showError(msg) {
      if (resultDiv) resultDiv.style.display = 'none';
      if (errorContainer) {
          errorContainer.textContent = msg;
          errorContainer.style.display = 'block';
      }
  }

  function clearError() {
      if (errorContainer) {
          errorContainer.style.display = 'none';
          errorContainer.textContent = '';
      }
  }

  async function prepareImage(imageUrl) {
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
  }

  async function handleVisualAnalysis(imageUrl, apiKey, resultElement) {
      try {
          resultElement.innerHTML = '<span class="ai-analysis-loading">分析中... (数秒かかります)</span>';
          const { base64, mimeType } = await prepareImage(imageUrl);
          const analysisResult = await GeminiClient.analyzeImage(apiKey, base64, mimeType);
          resultElement.innerHTML = `<div class="ai-analysis-result"><strong>AI視覚分析結果:</strong><br>${analysisResult.replace(/\n/g, '<br>')}</div>`;
      } catch (error) {
          console.error('Visual Analysis Error:', error);
          let userMessage = '現在、AI分析サービスが利用できないか、設定の確認が必要です。';
          if (error.message.includes('API key')) userMessage = 'APIキーが無効です。設定をご確認ください。';
          else if (error.message.includes('429')) userMessage = 'APIのリクエスト制限に達しました。';
          else if (error.message.includes('500') || error.message.includes('503')) userMessage = 'Googleのサービスが一時的に混雑しています。';
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
      if (showDetailsButton) showDetailsButton.style.display = 'none';

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab) return showError('アクティブなタブが見つかりません。');

        chrome.tabs.sendMessage(activeTab.id, {action: 'scanImages'}, (response) => {
          if (chrome.runtime.lastError) return showError(`エラー: ${chrome.runtime.lastError.message}`);

          if (response) {
            if (resultDiv) resultDiv.style.display = 'block';
            if (imageCountElement) imageCountElement.textContent = response.count;

            // Overall Status Logic
            // If any image is >= 80% (High Risk), show Warning
            // Else if many are undetermined (21-79%), show "Undetermined"
            const highRiskItems = response.details.filter(d => d.aiScore >= 80);
            const undeterminedItems = response.details.filter(d => d.aiScore > 20 && d.aiScore < 80);

            let overallStatus = 'low';
            if (highRiskItems.length > 0) overallStatus = 'high';
            else if (undeterminedItems.length > 0) overallStatus = 'undetermined';

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
                    aiProbElement.textContent = '判定保留 (詳細分析を推奨)';
                    aiProbElement.className = 'status-unknown';
                    if (warningMark) warningMark.style.display = 'none';
                    const expl = document.createElement('p');
                    expl.id = 'statusExplanation';
                    expl.className = 'detail-reason';
                    expl.style.fontSize = '12px';
                    expl.style.marginTop = '8px';
                    expl.style.textAlign = 'center';
                    expl.style.color = '#555';
                    expl.innerHTML = 'メタデータが不足しています。<br><strong>AI視覚分析</strong>で詳しく調査できます。';
                    aiProbContainer.appendChild(expl);
                } else {
                    aiProbElement.textContent = '低';
                    aiProbElement.className = 'low-risk';
                    if (warningMark) warningMark.style.display = 'none';
                }
            }

            // Populate Details with Confidence Meter
            if (response.details && response.details.length > 0 && detailsList) {
                if (showDetailsButton) showDetailsButton.style.display = 'inline-block';

                response.details.forEach(item => {
                    const li = document.createElement('li');
                    li.className = 'detail-item';

                    const liContent = document.createElement('div');

                    // Thumbnail & URL Row
                    const topRow = document.createElement('div');
                    topRow.style.display = 'flex';
                    topRow.style.gap = '10px';
                    topRow.style.marginBottom = '10px';

                    const thumb = document.createElement('img');
                    thumb.src = item.url;
                    thumb.style.width = '50px';
                    thumb.style.height = '50px';
                    thumb.style.objectFit = 'cover';
                    thumb.style.borderRadius = '4px';
                    thumb.style.border = '1px solid #ddd';
                    topRow.appendChild(thumb);

                    const urlDiv = document.createElement('div');
                    urlDiv.className = 'detail-url';
                    urlDiv.textContent = item.url;
                    urlDiv.title = item.url;
                    urlDiv.style.flex = '1';
                    topRow.appendChild(urlDiv);
                    liContent.appendChild(topRow);

                    // Confidence Meter
                    // Score determines Color & Text
                    let scoreColor = '#f57c00';
                    let scoreText = '判定保留 (データ不足)';
                    if (item.aiScore >= 80) { scoreColor = '#d32f2f'; scoreText = 'AI生成の可能性が高い'; }
                    else if (item.aiScore <= 20) { scoreColor = '#2e7d32'; scoreText = '写真/手描きの可能性が高い'; }

                    const meterContainer = document.createElement('div');
                    meterContainer.className = 'confidence-meter';

                    const bar = document.createElement('div');
                    bar.className = 'confidence-bar';
                    bar.style.width = `${item.aiScore}%`;
                    bar.style.backgroundColor = scoreColor;
                    meterContainer.appendChild(bar);
                    liContent.appendChild(meterContainer);

                    const scoreLabel = document.createElement('div');
                    scoreLabel.style.display = 'flex';
                    scoreLabel.style.justifyContent = 'space-between';
                    scoreLabel.style.fontSize = '11px';
                    scoreLabel.style.fontWeight = 'bold';
                    scoreLabel.style.color = scoreColor;
                    scoreLabel.style.marginBottom = '8px';
                    scoreLabel.innerHTML = `<span>${scoreText}</span><span>${item.aiScore}%</span>`;
                    liContent.appendChild(scoreLabel);

                    // Recommendation (If Mid-Range)
                    if (item.aiScore > 20 && item.aiScore < 80) {
                        const rec = document.createElement('div');
                        rec.className = 'recommendation-text';
                        rec.textContent = '判定精度を上げるために、AI視覚分析を推奨します。';
                        liContent.appendChild(rec);
                    }

                    // Metadata / Reasons
                    if (item.reason) {
                        const reasonDiv = document.createElement('div');
                        reasonDiv.className = 'detail-reason';
                        reasonDiv.textContent = item.reason;
                        liContent.appendChild(reasonDiv);
                    }

                    // Buttons
                    const btnRow = document.createElement('div');
                    btnRow.style.display = 'flex';
                    btnRow.style.gap = '8px';
                    btnRow.style.marginTop = '8px';

                    if (!item.url.startsWith('data:')) {
                        const lensLink = document.createElement('a');
                        lensLink.href = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.url)}`;
                        lensLink.target = '_blank';
                        lensLink.className = 'lens-button';
                        lensLink.textContent = 'Googleレンズ';
                        btnRow.appendChild(lensLink);
                    }

                    if (!item.error) {
                        const aiBtn = document.createElement('button');
                        aiBtn.className = 'ai-analysis-button';
                        aiBtn.textContent = 'AI視覚分析';
                        const resDiv = document.createElement('div');
                        aiBtn.addEventListener('click', () => {
                            chrome.storage.sync.get('geminiApiKey', (data) => {
                                if (!data.geminiApiKey) {
                                    if (confirm('AI視覚分析にはGemini APIキーが必要です。\n設定画面を開きますか？')) chrome.runtime.openOptionsPage();
                                } else {
                                    handleVisualAnalysis(item.url, data.geminiApiKey, resDiv);
                                }
                            });
                        });
                        btnRow.appendChild(aiBtn);
                        liContent.appendChild(btnRow);
                        liContent.appendChild(resDiv);
                    } else {
                        liContent.appendChild(btnRow);
                    }

                    li.appendChild(liContent);
                    detailsList.appendChild(li);
                });
            }
          } else showError('応答がありません。');
        });
      });
    });
  }
});
