document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const resultDiv = document.getElementById('result');

  if (scanButton) {
    scanButton.addEventListener('click', () => {
      console.log('Scan started by Linzu...');

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab) {
          chrome.tabs.sendMessage(activeTab.id, {action: 'scanImages'}, (response) => {
            if (resultDiv) {
              resultDiv.style.display = 'block';

              if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
                resultDiv.textContent = 'エラー: ページを再読み込みしてください。';
                return;
              }

              if (response && response.count !== undefined) {
                console.log(`Images found: ${response.count}, Suspicious: ${response.suspiciousCount}`);

                // Update Image Count
                const imageCountElement = document.getElementById('imageCount');
                if (imageCountElement) {
                    imageCountElement.textContent = response.count;
                }

                // Update AI Probability
                const aiProbContainer = document.getElementById('aiProbabilityContainer');
                const aiProbElement = document.getElementById('aiProbability');

                if (aiProbContainer && aiProbElement) {
                    aiProbContainer.style.display = 'block';
                    if (response.suspiciousCount > 0) {
                        aiProbElement.textContent = '高';
                        aiProbElement.className = 'high-risk';
                    } else {
                        aiProbElement.textContent = '低';
                        aiProbElement.className = 'low-risk';
                    }
                }
              }
            }
          });
        }
      });
    });
  }
});
