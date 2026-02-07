// Function to check metadata of an image
async function checkMetadata(imgUrl) {
  try {
    const response = await fetch(imgUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    let isSuspicious = false;
    let reason = '';

    // 1. Check for C2PA/JUMBF signature in raw bytes
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 50000));
    const headerString = new TextDecoder('utf-8').decode(headerBytes);

    // "jumbf" is the container format for C2PA. "c2pa" might appear in manifests.
    // Finding these means there is provenance data. Often used by Generative AI tools (Adobe Firefly, etc.)
    // but also by cameras (Leica M11-P). The prompt asks to treat "AI/Generated/Synthetic" keywords OR "C2PA signature" as signals.
    if (headerString.includes('c2pa') || headerString.includes('jumbf')) {
      isSuspicious = true;
      reason += 'C2PA/JUMBF signature found. ';
    }

    // 2. Check Exif using exif-js
    // EXIF.readFromBinaryFile reads directly from ArrayBuffer
    const exifData = EXIF.readFromBinaryFile(arrayBuffer);

    if (exifData) {
      const tagsToCheck = ['Software', 'ImageDescription', 'Artist', 'UserComment', 'Make', 'Model'];
      const keywords = ['AI', 'Generated', 'Synthetic', 'Midjourney', 'DALL-E', 'Stable Diffusion', 'Adobe Firefly', 'Bing Image Creator'];

      tagsToCheck.forEach(tag => {
        if (exifData[tag]) {
            const val = String(exifData[tag]).toLowerCase();
            for (const keyword of keywords) {
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
    console.error('Error checking metadata for', imgUrl, error);
    return { isSuspicious: false, reason: 'Error or CORS issue' };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanImages') {
    const images = Array.from(document.querySelectorAll('img'));
    const totalImages = images.length;
    console.log(`Linzu found ${totalImages} images. Analyzing metadata...`);

    // Limit to first 10 images to avoid performance issues/rate limits
    const imagesToScan = images.slice(0, 10);
    const scanPromises = imagesToScan.map(img => {
        let src = img.src;
        if (!src) return Promise.resolve({ isSuspicious: false });
        return checkMetadata(src);
    });

    Promise.all(scanPromises).then(results => {
        const suspiciousCount = results.filter(r => r.isSuspicious).length;
        console.log(`Analysis complete. Suspicious: ${suspiciousCount}`);
        sendResponse({ count: totalImages, suspiciousCount: suspiciousCount });
    });

    return true; // Keep channel open for async response
  }
});
