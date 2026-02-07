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
  try {
    const response = await fetch(imgUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    let isSuspicious = false;
    let reason = '';

    // 1. Check for C2PA/JUMBF signature in raw bytes
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, METADATA_CONFIG.HEADER_SCAN_SIZE));
    const headerString = new TextDecoder('utf-8').decode(headerBytes);

    for (const signature of METADATA_CONFIG.SIGNATURES) {
        if (headerString.includes(signature)) {
            isSuspicious = true;
            reason += `Signature '${signature}' found. `;
            break;
        }
    }

    // 2. Check Exif using exif-js
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (exifData) {
      METADATA_CONFIG.EXIF_TAGS.forEach(tag => {
        if (exifData[tag]) {
            const val = String(exifData[tag]).toLowerCase();
            for (const keyword of METADATA_CONFIG.AI_KEYWORDS) {
                if (val.includes(keyword.toLowerCase())) {
                    isSuspicious = true;
                    reason += `Keyword '${keyword}' found in ${tag}. `;
                    break;
                }
            }
        }
      });
    }

    return { isSuspicious, reason: reason.trim() };

  } catch (error) {
    // console.error('Error checking metadata for', imgUrl, error);
    // Silent fail for CORS or network issues
    return { isSuspicious: false, reason: 'Error or CORS issue' };
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
        if (!src) return Promise.resolve({ isSuspicious: false });
        return checkMetadata(src);
    });

    Promise.all(scanPromises).then(results => {
        const suspiciousCount = results.filter(r => r.isSuspicious).length;
        // console.log(`Analysis complete. Suspicious: ${suspiciousCount}`);
        sendResponse({ count: totalImages, suspiciousCount: suspiciousCount });
    });

    return true; // Keep channel open for async response
  }
});
