from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        cwd = os.getcwd()
        popup_path = f"file://{cwd}/popup.html"

        print(f"Navigating to Popup: {popup_path}")
        page.goto(popup_path)

        # Simulate Improved Forensics Results
        page.evaluate("""
            const resultDiv = document.getElementById('result');
            const detailsList = document.getElementById('detailsList');
            const detailsContainer = document.getElementById('detailsContainer');
            const showDetailsButton = document.getElementById('showDetailsButton');

            if (resultDiv && detailsList) {
                resultDiv.style.display = 'block';
                showDetailsButton.style.display = 'inline-block';
                detailsContainer.style.display = 'block';

                function createForensicItem(url, score, type, reason) {
                    const li = document.createElement('li');
                    li.className = 'detail-item';

                    let scoreColor = '#f57c00';
                    let scoreText = '判定不明瞭 (特徴混在)';
                    if (score >= 80) { scoreColor = '#d32f2f'; scoreText = 'AI生成の可能性が高い'; }
                    else if (score <= 30) { scoreColor = '#2e7d32'; scoreText = type === 'Photo' ? '写真の可能性が高い' : '手描きの可能性が高い'; }

                    const typeBadge = `<div style="font-size: 11px; color: #666; margin-bottom: 4px; background: #f5f5f5; padding: 2px 6px; border-radius: 4px; display: inline-block;">分類: ${type === 'Photo' ? '実写/写真' : 'イラスト/絵'}</div>`;

                    li.innerHTML = `
                        <div class="detail-url">${url}</div>
                        ${typeBadge}
                        <div class="confidence-meter">
                            <div class="confidence-bar" style="width: ${score}%; background-color: ${scoreColor};"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; color: ${scoreColor}; margin-bottom: 8px;">
                            <span>${scoreText}</span><span>${score}%</span>
                        </div>
                        ${(score > 30 && score < 80) ? '<div class="recommendation-text">特徴が混在しています。AI視覚分析で詳細を確認してください。</div>' : ''}
                        <div class="detail-reason">${reason}</div>
                    `;
                    detailsList.appendChild(li);
                }

                // AI Photo (Smooth)
                createForensicItem('http://example.com/ai-smooth.jpg', 75, 'Photo', 'Unnaturally smooth texture for a photo (Variance: 4.5).');

                // Real Photo (Noisy) - Score should be low, not 50
                createForensicItem('http://example.com/real-noisy.jpg', 25, 'Photo', 'Detected sensor noise (Variance: 14.2).');

                // Ambiguous Illustration
                createForensicItem('http://example.com/art.png', 35, 'Illustration', 'Texture consistent with digital illustration.');
            }
        """)

        page.screenshot(path=f"{cwd}/verification/ui_improved_forensics.png")
        print("Improved Forensics UI screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
