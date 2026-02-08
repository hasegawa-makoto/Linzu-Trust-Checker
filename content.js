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

// Calculate Combined AI Score (0-100)
function calculateAIScore(metadata, width, height, hasC2PA, hasAIKeywords, hasURLKeywords, forensics) {
    // Base score derived from Forensics (replacing 50 default)
    let score = forensics ? forensics.forensicScore : 55; // Default bias 55 if forensics fail

    // Metadata Modifiers (Apply on top of forensic base)

    // 1. Strong Evidence (Overrides almost everything)
    if (hasC2PA || hasAIKeywords) {
        return 95; // Confirmed AI by metadata
    }

    // 2. URL Evidence
    if (hasURLKeywords) {
        score = Math.max(score, 85);
    }

    // 3. Human Evidence (Camera Data) -> Reduces Score significantly
    if (metadata['Make'] || metadata['Model'] || metadata['ExposureTime']) {
        // Only reduce if no contradictory AI evidence
        if (!hasAIKeywords) {
            score -= 40;
        }
    }

    // 4. Dimensions (Heuristic)
    if ((width === 1024 && height === 1024) || (width === 512 && height === 512)) {
        score += 15;
    }

    return Math.max(0, Math.min(100, score));
}

// Function to check metadata and forensics of an image
async function checkMetadata(imgUrl) {
  const result = {
    url: imgUrl,
    isSuspicious: false,
    reason: '',
    metadata: {},
    error: null,
    dataMissing: false,
    aiScore: 55, // Default bias
    imageType: 'Unknown'
  };

  let hasC2PA = false;
  let hasAIKeywords = false;
  let hasURLKeywords = false;
  let imgWidth = 0;
  let imgHeight = 0;
  let forensicsData = null;

  try {
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
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // 1. Image Forensics (Canvas Analysis)
    try {
        const forensicResult = await ImageForensics.analyze(blob);
        if (forensicResult.success) {
            forensicsData = forensicResult;
            result.imageType = forensicResult.type;
            result.reason += forensicResult.reasons.join(' ');
        }
    } catch (e) {
        console.warn('Forensics skipped:', e);
    }

    if (!imgWidth) {
        try {
            const bmp = await createImageBitmap(blob);
            imgWidth = bmp.width;
            imgHeight = bmp.height;
            bmp.close();
        } catch(e){}
    }

    // 2. Metadata Analysis
    let hasMetadata = false;
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
    }

    // Final Scoring
    result.aiScore = calculateAIScore(result.metadata, imgWidth, imgHeight, hasC2PA, hasAIKeywords, hasURLKeywords, forensicsData);

    // Formatting Reason
    if (forensicsData) {
        result.reason = `[Type: ${forensicsData.type}] ${result.reason}`;
    }
    result.reason = result.reason.trim();

    return result;

  } catch (error) {
    result.error = error.message || 'Unknown Error';
    return result;
  }
}

// ... createResultModal and listeners remain the same ...
// Including them to ensure file integrity
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

    const content = document.createElement('div');
    content.style.padding = '16px';

    const infoRow = document.createElement('div');
    infoRow.style.display = 'flex';
    infoRow.style.gap = '12px';
    infoRow.style.marginBottom = '16px';
    const img = document.createElement('img');
    img.src = result.url;
    Object.assign(img.style, { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' });
    infoRow.appendChild(img);
    content.appendChild(infoRow);

    const scoreDiv = document.createElement('div');
    scoreDiv.style.marginBottom = '12px';

    let scoreColor = '#f57c00';
    let scoreText = '判定保留 (詳細分析推奨)';

    if (result.aiScore >= 80) {
        scoreColor = '#d32f2f'; scoreText = 'AI生成の可能性が高い';
    } else if (result.aiScore <= 30) {
        scoreColor = '#2e7d32';
        scoreText = result.imageType === 'Photo' ? '写真の可能性が高い' : '手描きの可能性が高い';
    } else {
        scoreText = '判定不明瞭 (特徴混在)';
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
    scoreLabel.innerHTML = `<span>${scoreText}</span><span>${result.aiScore}%</span>`;
    scoreDiv.appendChild(scoreLabel);
    content.appendChild(scoreDiv);

    if (result.imageType && result.imageType !== 'Unknown') {
        const typeBadge = document.createElement('div');
        typeBadge.textContent = `分類: ${result.imageType === 'Photo' ? '実写/写真' : 'イラスト/絵'}`;
        Object.assign(typeBadge.style, { fontSize: '11px', color: '#666', marginBottom: '8px', background: '#f5f5f5', padding: '4px', borderRadius: '4px', display: 'inline-block' });
        content.appendChild(typeBadge);
    }

    if (result.aiScore > 30 && result.aiScore < 80) {
        const rec = document.createElement('div');
        rec.textContent = '特徴が混在しています。AI視覚分析で詳細を確認してください。';
        Object.assign(rec.style, { fontSize: '11px', color: '#555', marginBottom: '12px', background: '#fff3e0', padding: '8px', borderRadius: '4px' });
        content.appendChild(rec);
    }

    if (result.reason) {
        const r = document.createElement('div');
        r.style.fontSize = '11px';
        r.style.color = '#666';
        r.style.marginBottom = '12px';
        r.textContent = result.reason;
        content.appendChild(r);
    }

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const aiBtn = document.createElement('button');
    aiBtn.textContent = 'AI視覚分析';
    Object.assign(aiBtn.style, { flex: '1', padding: '8px', background: '#0056b3', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' });

    btnRow.appendChild(aiBtn);
    content.appendChild(btnRow);

    const aiResultDiv = document.createElement('div');
    Object.assign(aiResultDiv.style, { marginTop: '12px', fontSize: '12px', display: 'none' });
    content.appendChild(aiResultDiv);

    container.appendChild(content);
    document.body.appendChild(container);

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
