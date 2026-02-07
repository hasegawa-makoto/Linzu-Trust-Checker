document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const resultDiv = document.getElementById('result');
  const warningMark = document.getElementById('warningMark');
  const imageCountElement = document.getElementById('imageCount');
  const aiProbContainer = document.getElementById('aiProbabilityContainer');
  const aiProbElement = document.getElementById('aiProbability');

  if (scanButton) {
    scanButton.addEventListener('click', () => {
      // Clear previous results
      if (resultDiv) resultDiv.style.display = 'none';
      if (warningMark) warningMark.style.display = 'none';
      if (aiProbContainer) aiProbContainer.style.display = 'none';

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab) {
          chrome.tabs.sendMessage(activeTab.id, {action: 'scanImages'}, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError.message);
              if (resultDiv) {
                resultDiv.style.display = 'block';
                resultDiv.textContent = 'エラー: ページを再読み込みしてください。';
              }
              return;
            }

            if (response && response.count !== undefined) {
              // Show Result Container with Animation
              if (resultDiv) {
                resultDiv.style.display = 'block';
                // Reset content if error was shown previously
                if (!document.getElementById('imageCount')) {
                    // Rebuild structure if it was overwritten by textContent
                    resultDiv.innerHTML = '<div id="warningMark" class="warning-icon"></div><p>画像数: <span id="imageCount">' + response.count + '</span></p><p id="aiProbabilityContainer" style="display: none;">AIの可能性: <span id="aiProbability"></span></p>';
                    // Re-fetch elements
                    // (Simplification: assuming no error state occurred in this session for now, or just reload popup)
                }
              }

              // Update Image Count
              const imgCountEl = document.getElementById('imageCount');
              if (imgCountEl) imgCountEl.textContent = response.count;

              // Update AI Probability
              const probContainer = document.getElementById('aiProbabilityContainer');
              const probEl = document.getElementById('aiProbability');
              const warnIcon = document.getElementById('warningMark');

              if (probContainer && probEl) {
                  probContainer.style.display = 'block';
                  if (response.suspiciousCount > 0) {
                      probEl.textContent = '高';
                      probEl.className = 'high-risk';
                      if (warnIcon) {
                        warnIcon.style.display = 'block';
                        warnIcon.classList.add('show-warning');
                      }
                  } else {
                      probEl.textContent = '低';
                      probEl.className = 'low-risk';
                      if (warnIcon) warnIcon.style.display = 'none';
                  }
              }
            }
          });
        }
      });
    });
  }
});
