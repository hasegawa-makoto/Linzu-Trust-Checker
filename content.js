// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SHOW_RESULT') {
      createOverlay(request.data, false);
  } else if (request.action === 'SHOW_ERROR') {
      createOverlay(request, true);
  }
});

function createOverlay(data, isError) {
    // Remove existing modal if any
    const existing = document.getElementById('linzu-modal-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'linzu-modal-container';

    // Base Styles
    Object.assign(container.style, {
        position: 'fixed', top: '20px', right: '20px', width: '300px',
        backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px',
        zIndex: '2147483647', fontFamily: 'sans-serif', border: '1px solid #e0e0e0',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'linzuSlideIn 0.3s ease-out'
    });

    // Add Keyframes
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes linzuSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(styleSheet);

    // Header
    const header = document.createElement('div');
    const headerColor = isError ? '#d32f2f' : '#0056b3';
    Object.assign(header.style, {
        padding: '12px 16px', borderBottom: '1px solid #eee',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: isError ? '#ffebee' : '#f8f9fa'
    });

    const title = document.createElement('strong');
    title.textContent = isError ? (data.title || 'エラー') : 'Linzu 解析結果';
    title.style.color = headerColor;
    title.style.fontSize = '14px';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    Object.assign(closeBtn.style, {
        background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#999', padding: '0'
    });
    closeBtn.addEventListener('click', () => container.remove());
    header.appendChild(closeBtn);
    container.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.style.padding = '16px';

    if (isError) {
        const msg = document.createElement('div');
        msg.textContent = data.message;
        msg.style.fontSize = '13px';
        msg.style.color = '#333';
        msg.style.lineHeight = '1.5';
        content.appendChild(msg);

        // Optional Action Button (e.g., Open Settings)
        if (data.message.includes('設定画面')) {
            const btn = document.createElement('button');
            btn.textContent = '設定画面を開く';
            Object.assign(btn.style, {
                marginTop: '12px', padding: '8px 12px', background: headerColor, color: '#fff',
                border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%', fontSize: '12px'
            });
            btn.addEventListener('click', () => {
                // We can't open extension pages from content script directly usually,
                // but we can tell background to do it?
                // Actually `window.open` might work for extension URL if web accessible resource,
                // but easier to just tell user to click icon or handle via message if needed.
                // For now, simple message is enough as per requirement "Show popup on screen".
                alert('ブラウザ右上のLinzuアイコン > ⚙️設定 から開いてください。');
            });
            // content.appendChild(btn);
        }

    } else {
        // Success Content
        const prob = document.createElement('div');
        prob.style.fontSize = '24px';
        prob.style.fontWeight = 'bold';
        prob.style.marginBottom = '8px';
        prob.textContent = `${data.ai_probability}%`;

        if (data.ai_probability >= 80) prob.style.color = '#d32f2f';
        else if (data.ai_probability >= 50) prob.style.color = '#f57c00';
        else prob.style.color = '#2e7d32';

        const label = document.createElement('div');
        label.textContent = 'AI生成確率';
        label.style.fontSize = '10px';
        label.style.color = '#666';
        label.style.marginBottom = '2px';

        const typeBadge = document.createElement('div');
        typeBadge.textContent = data.detected_type;
        Object.assign(typeBadge.style, {
            display: 'inline-block', background: '#f1f3f5', padding: '4px 8px',
            borderRadius: '4px', fontSize: '11px', color: '#555', marginBottom: '12px'
        });

        content.appendChild(label);
        content.appendChild(prob);
        content.appendChild(typeBadge);

        const reasonList = document.createElement('ul');
        Object.assign(reasonList.style, {
            paddingLeft: '16px', margin: '0', fontSize: '12px', color: '#444', lineHeight: '1.4'
        });

        const reasons = data.reasons || ['特筆すべき理由はありません'];
        reasons.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            li.style.marginBottom = '4px';
            reasonList.appendChild(li);
        });
        content.appendChild(reasonList);
    }

    container.appendChild(content);
    document.body.appendChild(container);

    // Auto-remove after 10 seconds if success, keep if error?
    // Requirement says "Make sure user understands reason", so keep until closed is better.
}
