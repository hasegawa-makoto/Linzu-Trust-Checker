// Constants for Metadata Analysis
const METADATA_CONFIG = {
  EXIF_TAGS: ['Software', 'ImageDescription', 'Artist', 'UserComment', 'Make', 'Model'],
  AI_KEYWORDS: [
    'AI', 'Generated', 'Synthetic', 'Midjourney', 'DALL-E',
    'Stable Diffusion', 'Adobe Firefly', 'Bing Image Creator'
  ],
  URL_KEYWORDS: [
    'midjourney', 'dall-e', 'dreamstudio', 'stable-diffusion',
    'generated', 'synthetic', 'ai-generated'
  ],
  SIGNATURES: ['c2pa', 'jumbf'],
  HEADER_SCAN_SIZE: 50000 // 50KB
};

// Function to check metadata of an image
async function checkMetadata(imgUrl) {
  const result = {
    url: imgUrl,
    isSuspicious: false,
    reason: '',
    metadata: {},
    error: null,
    dataMissing: false
  };

  try {
    // 0. Check URL/Filename for AI Keywords (Auxiliary Logic)
    const lowerUrl = imgUrl.toLowerCase();
    for (const keyword of METADATA_CONFIG.URL_KEYWORDS) {
        if (lowerUrl.includes(keyword)) {
            result.isSuspicious = true;
            result.reason += `URL/Filename contains '${keyword}'. `;
            break;
        }
    }

    const response = await fetch(imgUrl);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    let hasMetadata = false;

    // 1. Check for C2PA/JUMBF signature in raw bytes
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, METADATA_CONFIG.HEADER_SCAN_SIZE));
    const headerString = new TextDecoder('utf-8').decode(headerBytes);

    for (const signature of METADATA_CONFIG.SIGNATURES) {
        if (headerString.includes(signature)) {
            result.isSuspicious = true;
            result.reason += `Signature '${signature}' found. `;
            result.metadata[signature] = 'Found in header';
            hasMetadata = true;
            break;
        }
    }

    // 2. Check Exif using exif-js
    // EXIF.readFromBinaryFile returns an object with all tags
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (exifData && Object.keys(exifData).length > 0) {
      hasMetadata = true;
      // Capture all relevant tags for debugging/details view
      METADATA_CONFIG.EXIF_TAGS.forEach(tag => {
        if (exifData[tag]) {
            const val = String(exifData[tag]);
            result.metadata[tag] = val; // Store the value

            const lowerVal = val.toLowerCase();
            for (const keyword of METADATA_CONFIG.AI_KEYWORDS) {
                if (lowerVal.includes(keyword.toLowerCase())) {
                    result.isSuspicious = true;
                    result.reason += `Keyword '${keyword}' found in ${tag}. `;
                    break;
                }
            }
        }
      });
    }

    if (!hasMetadata) {
        result.dataMissing = true;
        result.metadata['Status'] = 'No Exif/C2PA data found';
        if (!result.isSuspicious) {
            result.reason += 'No metadata found (common in SNS uploads). ';
        }
    }

    result.reason = result.reason.trim();
    return result;

  } catch (error) {
    // console.error('Error checking metadata for', imgUrl, error);
    result.error = error.message || 'Unknown Error (likely CORS)';
    return result;
  }
}

// Function to Create In-Page Result Modal
function createResultModal(result) {
    // Remove existing modal if any
    const existing = document.getElementById('linzu-modal-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'linzu-modal-container';
    Object.assign(container.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        width: '320px',
        maxHeight: '80vh',
        backgroundColor: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: '8px',
        zIndex: '999999',
        fontFamily: 'sans-serif',
        overflowY: 'auto',
        border: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column'
    });

    // 1. Header
    const header = document.createElement('div');
    Object.assign(header.style, {
        padding: '16px',
        borderBottom: '1px solid #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    });

    const title = document.createElement('strong');
    title.textContent = 'Linzu Analysis';
    title.style.color = '#0056b3';
    title.style.fontSize = '16px';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;'; // Safe entity
    Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '20px',
        cursor: 'pointer',
        color: '#999'
    });
    closeBtn.addEventListener('click', () => container.remove());
    header.appendChild(closeBtn);
    container.appendChild(header);

    // 2. Content
    const content = document.createElement('div');
    content.style.padding = '16px';

    // Status Determination
    let statusText = '判定: 安全/不明';
    let statusColor = '#2e7d32'; // Green
    let statusBg = '#e8f5e9';

    if (result.error) {
        statusText = 'エラー';
        statusColor = '#d32f2f'; // Red
        statusBg = '#ffebee';
    } else if (result.isSuspicious) {
        statusText = '判定: 疑わしい (AIの可能性: 高)';
        statusColor = '#d32f2f';
        statusBg = '#ffebee';
    } else if (result.dataMissing) {
        statusText = '判定保留 (データ不足)';
        statusColor = '#f57c00'; // Orange
        statusBg = '#fff3e0';
    }

    // Info Row (Image + Status)
    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.gap = '12px';
    infoRow.style.marginBottom = '16px';

    const img = document.createElement('img');
    img.src = result.url; // Safe assignment
    Object.assign(img.style, {
        width: '60px',
        height: '60px',
        objectFit: 'cover',
        borderRadius: '4px',
        border: '1px solid #ddd'
    });
    infoRow.appendChild(img);

    const textCol = document.createElement('div');
    textCol.style.flex = '1';

    const statusBadge = document.createElement('div');
    statusBadge.textContent = statusText;
    Object.assign(statusBadge.style, {
        fontWeight: 'bold',
        color: statusColor,
        background: statusBg,
        padding: '4px 8px',
        borderRadius: '4px',
        display: 'inline-block',
        fontSize: '12px',
        marginBottom: '4px'
    });
    textCol.appendChild(statusBadge);

    const urlText = document.createElement('div');
    urlText.textContent = result.url.substring(0, 30) + '...';
    Object.assign(urlText.style, {
        fontSize: '11px',
        color: '#666',
        wordBreak: 'break-all'
    });
    textCol.appendChild(urlText);

    infoRow.appendChild(textCol);
    content.appendChild(infoRow);

    // Messages
    if (result.dataMissing && !result.isSuspicious) {
        const msg = document.createElement('div');
        msg.textContent = 'SNS等によりメタデータが削除された可能性があります。\nAI視覚分析をお試しください。';
        Object.assign(msg.style, {
            fontSize: '12px',
            color: '#f57c00',
            marginBottom: '12px',
            whiteSpace: 'pre-line'
        });
        content.appendChild(msg);
    }

    if (result.reason) {
        const reasonDiv = document.createElement('div');
        reasonDiv.style.fontSize = '12px';
        reasonDiv.style.color = '#333';
        reasonDiv.style.marginBottom = '12px';

        const label = document.createElement('strong');
        label.textContent = '理由: ';
        reasonDiv.appendChild(label);
        reasonDiv.appendChild(document.createTextNode(result.reason));
        content.appendChild(reasonDiv);
    }

    // Buttons
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
        display: 'flex',
        gap: '8px',
        marginTop: '12px'
    });

    if (!result.url.startsWith('data:')) {
        const lensBtn = document.createElement('a');
        lensBtn.href = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(result.url)}`;
        lensBtn.target = '_blank';
        lensBtn.textContent = 'Googleレンズ';
        Object.assign(lensBtn.style, {
            flex: '1',
            textAlign: 'center',
            padding: '8px',
            background: '#f1f3f4',
            color: '#333',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold'
        });
        btnRow.appendChild(lensBtn);
    }

    const aiBtn = document.createElement('button');
    aiBtn.textContent = 'AI視覚分析';
    Object.assign(aiBtn.style, {
        flex: '1',
        padding: '8px',
        background: '#0056b3',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        cursor: 'pointer'
    });
    btnRow.appendChild(aiBtn);
    content.appendChild(btnRow);

    // AI Result Area
    const aiResultDiv = document.createElement('div');
    Object.assign(aiResultDiv.style, {
        marginTop: '12px',
        fontSize: '12px',
        display: 'none'
    });
    content.appendChild(aiResultDiv);

    container.appendChild(content);
    document.body.appendChild(container);

    // AI Analysis Logic
    aiBtn.addEventListener('click', () => {
        aiResultDiv.style.display = 'block';
        aiResultDiv.innerHTML = '<i>分析中...</i>'; // Safe usage

        chrome.storage.sync.get('geminiApiKey', async (data) => {
            if (!data.geminiApiKey) {
                aiResultDiv.innerHTML = '<span style="color: #d32f2f;">APIキーが設定されていません。拡張機能の設定画面から保存してください。</span>';
                return;
            }

            try {
                const response = await fetch(result.url);
                const blob = await response.blob();
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });

                if (typeof GeminiClient === 'undefined') {
                    aiResultDiv.textContent = 'Error: API Client not loaded. Please refresh the page.';
                    return;
                }

                const analysis = await GeminiClient.analyzeImage(data.geminiApiKey, base64, blob.type);

                // Display result nicely
                aiResultDiv.innerHTML = '';
                const resultBox = document.createElement('div');
                Object.assign(resultBox.style, {
                    background: '#e8f5e9',
                    padding: '8px',
                    borderRadius: '4px',
                    borderLeft: '3px solid #4caf50',
                    whiteSpace: 'pre-wrap' // Handle newlines safely
                });
                resultBox.textContent = analysis;
                aiResultDiv.appendChild(resultBox);

            } catch (e) {
                aiResultDiv.textContent = `Error: ${e.message}`;
                aiResultDiv.style.color = '#d32f2f';
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanImages') {
    const allImages = Array.from(document.querySelectorAll('img'));

    // Filter and Sort Images
    // 1. Filter out small icons (e.g. < 50x50)
    const validImages = allImages.filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width >= 50 && rect.height >= 50 && img.src && !img.src.startsWith('data:image/svg'); // Basic SVG icon filter
    });

    // 2. Sort by visible area (descending)
    validImages.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    });

    // Limit to first 10 images
    const imagesToScan = validImages.slice(0, 10);

    // Update count to match what is returned (Consistency Requirement)
    const reportedCount = imagesToScan.length;

    const scanPromises = imagesToScan.map(img => {
        let src = img.src;
        return checkMetadata(src);
    });

    Promise.all(scanPromises).then(results => {
        const suspiciousCount = results.filter(r => r.isSuspicious).length;
        sendResponse({
            count: reportedCount, // Fixed: Sync count with list size
            suspiciousCount: suspiciousCount,
            details: results
        });
    });

    return true; // Keep channel open
  }

  if (request.action === 'ANALYZE_SINGLE_IMAGE') {
      checkMetadata(request.srcUrl).then(result => {
          createResultModal(result);
      });
  }
});
