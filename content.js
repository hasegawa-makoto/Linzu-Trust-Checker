// Constants for Metadata Analysis
const METADATA_CONFIG = {
  EXIF_TAGS: ['Software', 'ImageDescription', 'Artist', 'UserComment', 'Make', 'Model', 'ExposureTime', 'FNumber', 'ISOSpeedRatings'],
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

// Calculate AI Score (0-100)
// 0: Human/Safe, 100: AI/Suspicious, 50: Unknown
function calculateAIScore(metadata, width, height, hasC2PA, hasAIKeywords, hasURLKeywords) {
    let score = 50; // Base: Unknown

    // 1. Strong Evidence (90-100 range)
    if (hasC2PA || hasAIKeywords) {
        score = 95;
        return score;
    }

    // 2. URL Evidence (70-90 range)
    if (hasURLKeywords) {
        score = 85;
    }

    // 3. Human Evidence (Camera Data) -> Reduces Score
    if (metadata['Make'] || metadata['Model'] || metadata['ExposureTime'] || metadata['ISOSpeedRatings']) {
        // If camera data is present AND no AI keywords found, it's likely human
        // (Though AI *can* fake Exif, it's less common than stripping it or adding AI tags)
        score -= 40;
    }

    // 4. Heuristic: Common AI Dimensions (Weak Signal)
    // 1024x1024, 512x512 are very common defaults
    if ((width === 1024 && height === 1024) || (width === 512 && height === 512)) {
        if (score === 50) score += 15; // Only bump if unknown
    }

    // 5. Missing Data Case (SNS)
    // If score hasn't moved from 50 (no strong evidence either way), and no metadata:
    // It remains 50 (Undetermined).

    // Clamp score
    return Math.max(0, Math.min(100, score));
}

// Function to check metadata of an image
async function checkMetadata(imgUrl) {
  const result = {
    url: imgUrl,
    isSuspicious: false,
    reason: '',
    metadata: {},
    error: null,
    dataMissing: false,
    aiScore: 50 // Default
  };

  // Helper variables for scoring
  let hasC2PA = false;
  let hasAIKeywords = false;
  let hasURLKeywords = false;
  let imgWidth = 0;
  let imgHeight = 0;

  try {
    // 0. Check URL/Filename for AI Keywords (Auxiliary Logic)
    const lowerUrl = imgUrl.toLowerCase();
    for (const keyword of METADATA_CONFIG.URL_KEYWORDS) {
        if (lowerUrl.includes(keyword)) {
            result.isSuspicious = true;
            result.reason += `URL/Filename contains '${keyword}'. `;
            hasURLKeywords = true;
            break;
        }
    }

    const response = await fetch(imgUrl);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Get dimensions (heuristic)
    // We can't easily get dimensions from Blob without decoding,
    // but the `checkMetadata` is often called from a context where `img` element exists.
    // However, here we only have URL. We can try to create an ImageBitmap or just skip strict dimension check if too costly.
    // For "Professional" feel, let's try to get it if cheap.
    // Since we are inside content script (mostly) or popup (background), creating ImageBitmap is fine.
    try {
        const bmp = await createImageBitmap(blob);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
    } catch (e) { /* ignore */ }

    let hasMetadata = false;

    // 1. Check for C2PA/JUMBF signature in raw bytes
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, METADATA_CONFIG.HEADER_SCAN_SIZE));
    const headerString = new TextDecoder('utf-8').decode(headerBytes);

    for (const signature of METADATA_CONFIG.SIGNATURES) {
        if (headerString.includes(signature)) {
            result.isSuspicious = true;
            result.reason += `Signature '${signature}' found. `;
            result.metadata[signature] = 'Found in header';
            hasC2PA = true;
            hasMetadata = true;
            break;
        }
    }

    // 2. Check Exif using exif-js
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (exifData && Object.keys(exifData).length > 0) {
      hasMetadata = true;
      METADATA_CONFIG.EXIF_TAGS.forEach(tag => {
        if (exifData[tag]) {
            const val = String(exifData[tag]);
            result.metadata[tag] = val;

            const lowerVal = val.toLowerCase();
            for (const keyword of METADATA_CONFIG.AI_KEYWORDS) {
                if (lowerVal.includes(keyword.toLowerCase())) {
                    result.isSuspicious = true;
                    result.reason += `Keyword '${keyword}' found in ${tag}. `;
                    hasAIKeywords = true;
                    break;
                }
            }
        }
      });
    }

    if (!hasMetadata) {
        result.dataMissing = true;
        result.metadata['Status'] = 'No Exif/C2PA data found';
        if (!result.isSuspicious && !hasURLKeywords) {
            result.reason += 'No metadata found (common in SNS uploads). ';
        }
    }

    // Calculate Final Score
    result.aiScore = calculateAIScore(result.metadata, imgWidth, imgHeight, hasC2PA, hasAIKeywords, hasURLKeywords);
    result.reason = result.reason.trim();

    return result;

  } catch (error) {
    result.error = error.message || 'Unknown Error (likely CORS)';
    return result;
  }
}

// Function to Create In-Page Result Modal (Updated for Score)
function createResultModal(result) {
    const existing = document.getElementById('linzu-modal-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'linzu-modal-container';
    Object.assign(container.style, {
        position: 'fixed', top: '20px', right: '20px', width: '320px', maxHeight: '80vh',
        backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderRadius: '8px',
        zIndex: '999999', fontFamily: 'sans-serif', overflowY: 'auto', border: '1px solid #e0e0e0',
        display: 'flex', flexDirection: 'column'
    });

    // 1. Header
    const header = document.createElement('div');
    Object.assign(header.style, { padding: '16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
    const title = document.createElement('strong');
    title.textContent = 'Linzu Analysis';
    title.style.color = '#0056b3';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    Object.assign(closeBtn.style, { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' });
    closeBtn.addEventListener('click', () => container.remove());
    header.appendChild(closeBtn);
    container.appendChild(header);

    // 2. Content
    const content = document.createElement('div');
    content.style.padding = '16px';

    // Image Row
    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.gap = '12px';
    infoRow.style.marginBottom = '16px';
    const img = document.createElement('img');
    img.src = result.url;
    Object.assign(img.style, { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' });
    infoRow.appendChild(img);
    content.appendChild(infoRow);

    // Score Visualization
    const scoreDiv = document.createElement('div');
    scoreDiv.style.marginBottom = '12px';

    let scoreColor = '#f57c00'; // Orange
    let scoreText = '判定保留 (データ不足)';

    if (result.aiScore >= 80) {
        scoreColor = '#d32f2f'; // Red
        scoreText = 'AI生成の可能性が高い';
    } else if (result.aiScore <= 20) {
        scoreColor = '#2e7d32'; // Green
        scoreText = '写真/手描きの可能性が高い';
    }

    const scoreBarContainer = document.createElement('div');
    Object.assign(scoreBarContainer.style, { height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' });
    const scoreBar = document.createElement('div');
    Object.assign(scoreBar.style, { height: '100%', width: `${result.aiScore}%`, background: scoreColor, transition: 'width 0.5s' });
    scoreBarContainer.appendChild(scoreBar);
    scoreDiv.appendChild(scoreBarContainer);

    const scoreLabel = document.createElement('div');
    scoreLabel.style.display = 'flex';
    scoreLabel.style.justifyContent = 'space-between';
    scoreLabel.style.fontSize = '12px';
    scoreLabel.style.fontWeight = 'bold';
    scoreLabel.style.color = scoreColor;

    const labelText = document.createElement('span');
    labelText.textContent = scoreText;
    const labelPercent = document.createElement('span');
    labelPercent.textContent = `${result.aiScore}%`;

    scoreLabel.appendChild(labelText);
    scoreLabel.appendChild(labelPercent);
    scoreDiv.appendChild(scoreLabel);
    content.appendChild(scoreDiv);

    // Recommendation (Deep Analysis)
    if (result.aiScore > 20 && result.aiScore < 80) {
        const rec = document.createElement('div');
        rec.textContent = '判定精度を上げるために、AI視覚分析を推奨します。';
        Object.assign(rec.style, { fontSize: '11px', color: '#555', marginBottom: '12px', background: '#fff3e0', padding: '8px', borderRadius: '4px' });
        content.appendChild(rec);
    }

    // Reason
    if (result.reason) {
        const r = document.createElement('div');
        r.style.fontSize = '11px';
        r.style.color = '#666';
        r.style.marginBottom = '12px';
        r.textContent = result.reason;
        content.appendChild(r);
    }

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const aiBtn = document.createElement('button');
    aiBtn.textContent = 'AI視覚分析';
    Object.assign(aiBtn.style, { flex: '1', padding: '8px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' });
    btnRow.appendChild(aiBtn);
    content.appendChild(btnRow);

    // AI Result Area
    const aiResultDiv = document.createElement('div');
    Object.assign(aiResultDiv.style, { marginTop: '12px', fontSize: '12px', display: 'none' });
    content.appendChild(aiResultDiv);

    container.appendChild(content);
    document.body.appendChild(container);

    // AI Logic (Same as before)
    aiBtn.addEventListener('click', () => {
        aiResultDiv.style.display = 'block';
        aiResultDiv.innerHTML = '<i>分析中...</i>';
        chrome.storage.sync.get('geminiApiKey', async (data) => {
            if (!data.geminiApiKey) {
                aiResultDiv.innerHTML = '<span style="color: #d32f2f;">APIキーが設定されていません。</span>';
                return;
            }
            try {
                const response = await fetch(result.url);
                const blob = await response.blob();
                const base64 = await new Promise((res) => {
                    const r = new FileReader();
                    r.onloadend = () => res(r.result.split(',')[1]);
                    r.readAsDataURL(blob);
                });
                if (typeof GeminiClient === 'undefined') {
                    aiResultDiv.textContent = 'Error: API Client not loaded.';
                    return;
                }
                const analysis = await GeminiClient.analyzeImage(data.geminiApiKey, base64, blob.type);
                aiResultDiv.innerHTML = `<div style="background: #e8f5e9; padding: 8px; border-radius: 4px; border-left: 3px solid #4caf50; white-space: pre-wrap;">${analysis}</div>`;
            } catch (e) {
                aiResultDiv.textContent = `Error: ${e.message}`;
            }
        });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanImages') {
    const allImages = Array.from(document.querySelectorAll('img'));
    const validImages = allImages.filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width >= 50 && rect.height >= 50 && img.src && !img.src.startsWith('data:image/svg');
    });
    validImages.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    });

    const imagesToScan = validImages.slice(0, 10);
    const reportedCount = imagesToScan.length;

    const scanPromises = imagesToScan.map(img => {
        let src = img.src;
        return checkMetadata(src);
    });

    Promise.all(scanPromises).then(results => {
        // Suspicious logic now depends on Score >= 80
        const suspiciousCount = results.filter(r => r.aiScore >= 80).length;
        sendResponse({
            count: reportedCount,
            suspiciousCount: suspiciousCount,
            details: results
        });
    });

    return true;
  }

  if (request.action === 'ANALYZE_SINGLE_IMAGE') {
      checkMetadata(request.srcUrl).then(result => {
          createResultModal(result);
      });
  }
});
