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
      if (detailsList) detailsList.innerHTML = ''; // Clear previous details
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

            // Update Risk UI
            if (aiProbContainer && aiProbElement) {
                aiProbContainer.style.display = 'block';
                if (response.suspiciousCount > 0) {
                    aiProbElement.textContent = '高';
                    aiProbElement.className = 'high-risk';
                    if (warningMark) {
                        warningMark.style.display = 'block';
                        warningMark.classList.add('show-warning');
                    }
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
                    urlDiv.title = item.url; // Tooltip for full URL
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

                    // Data Missing Explanation
                    if (item.dataMissing && !item.isSuspicious) {
                        const warnDiv = document.createElement('div');
                        warnDiv.className = 'detail-reason';
                        warnDiv.textContent = 'SNS等によりメタデータが削除された可能性があります。';
                        warnDiv.style.color = '#f57c00'; // Orange
                        li.appendChild(warnDiv);
                    }

                    // Reason / Error Message
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

                    // Google Lens Button
                    if (item.url && !item.url.startsWith('data:')) {
                        const lensLink = document.createElement('a');
                        lensLink.href = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.url)}`;
                        lensLink.target = '_blank';
                        lensLink.className = 'lens-button';
                        lensLink.textContent = 'Googleレンズで確認';
                        li.appendChild(lensLink);
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
