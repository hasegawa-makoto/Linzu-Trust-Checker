// Constants for Metadata Analysis
const METADATA_CONFIG = {
  EXIF_TAGS: ['Software', 'ImageDescription', 'Artist', 'UserComment', 'Make', 'Model'],
  AI_KEYWORDS: [
    'AI', 'Generated', 'Synthetic', 'Midjourney', 'DALL-E',
    'Stable Diffusion', 'Adobe Firefly', 'Bing Image Creator'
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
    error: null
  };

  try {
    const response = await fetch(imgUrl);
    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // 1. Check for C2PA/JUMBF signature in raw bytes
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, METADATA_CONFIG.HEADER_SCAN_SIZE));
    const headerString = new TextDecoder('utf-8').decode(headerBytes);

    for (const signature of METADATA_CONFIG.SIGNATURES) {
        if (headerString.includes(signature)) {
            result.isSuspicious = true;
            result.reason += `Signature '${signature}' found. `;
            result.metadata[signature] = 'Found in header';
            break;
        }
    }

    // 2. Check Exif using exif-js
    // EXIF.readFromBinaryFile returns an object with all tags
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (exifData) {
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
    } else {
        result.metadata['Exif'] = 'No Exif data found';
    }

    result.reason = result.reason.trim();
    return result;

  } catch (error) {
    // console.error('Error checking metadata for', imgUrl, error);
    result.error = error.message || 'Unknown Error (likely CORS)';
    return result;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanImages') {
    const images = Array.from(document.querySelectorAll('img'));
    const totalImages = images.length;
    // console.log(`Linzu found ${totalImages} images. Analyzing metadata...`);

    // Limit to first 10 images to avoid performance issues/rate limits
    const imagesToScan = images.slice(0, 10);
    const scanPromises = imagesToScan.map(img => {
        let src = img.src;
        if (!src) return Promise.resolve({ url: 'unknown', isSuspicious: false, error: 'No Source URL' });
        return checkMetadata(src);
    });

    Promise.all(scanPromises).then(results => {
        const suspiciousCount = results.filter(r => r.isSuspicious).length;
        // console.log(`Analysis complete. Suspicious: ${suspiciousCount}`);
        sendResponse({
            count: totalImages,
            suspiciousCount: suspiciousCount,
            details: results // Send full details back
        });
    });

    return true; // Keep channel open for async response
  }
});
