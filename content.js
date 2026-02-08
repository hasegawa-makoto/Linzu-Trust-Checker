// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SCAN_IMAGES') {
    // Find all images on the page
    const allImages = Array.from(document.querySelectorAll('img'));

    // Filter out small icons or tracking pixels
    const validImages = allImages.filter(img => {
        const rect = img.getBoundingClientRect();
        // Visible and reasonably sized
        return rect.width >= 100 && rect.height >= 100 &&
               img.src && !img.src.startsWith('data:image/svg') &&
               !img.src.includes('data:image/gif'); // Skip small gifs/loaders often
    });

    if (validImages.length === 0) {
        sendResponse({ success: false, error: 'No suitable images found on page.' });
        return true;
    }

    // Sort by size descending (largest is likely the main content)
    validImages.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    });

    // Return Top 10
    const topImages = validImages.slice(0, 10).map(img => ({
        url: img.src,
        width: img.naturalWidth,
        height: img.naturalHeight
    }));

    sendResponse({ success: true, images: topImages });
    return true;
  }
});
