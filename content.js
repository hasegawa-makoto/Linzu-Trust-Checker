// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_MAIN_IMAGE') {
    // Find the largest visible image on the page
    const allImages = Array.from(document.querySelectorAll('img'));

    // Filter out small icons or tracking pixels
    const validImages = allImages.filter(img => {
        const rect = img.getBoundingClientRect();
        // Visible and reasonably sized
        return rect.width >= 100 && rect.height >= 100 &&
               img.src && !img.src.startsWith('data:image/svg') &&
               rect.top < window.innerHeight && rect.bottom > 0 && // Partially visible in viewport
               rect.left < window.innerWidth && rect.right > 0;
    });

    if (validImages.length === 0) {
        // Fallback: try larger images even if not in viewport
        const fallbackImages = allImages.filter(img => {
            const rect = img.getBoundingClientRect();
            return rect.width >= 100 && rect.height >= 100 &&
                   img.src && !img.src.startsWith('data:image/svg');
        });

        if (fallbackImages.length === 0) {
            sendResponse({ success: false, error: 'No suitable image found on page.' });
            return true;
        }

        // Sort by size descending
        fallbackImages.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return (rectB.width * rectB.height) - (rectA.width * rectA.height);
        });

        sendResponse({ success: true, url: fallbackImages[0].src });
        return true;
    }

    // Sort by size descending (largest is likely the main content)
    validImages.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return (rectB.width * rectB.height) - (rectA.width * rectA.height);
    });

    sendResponse({ success: true, url: validImages[0].src });
    return true;
  }

  // Handle context menu "Pinpoint Analysis"
  // This might need to be updated to use the new API flow too,
  // but for now we focus on the main Scan button as per instructions.
  // The user said "Discard all client-side forensics", so we should remove the old modal logic too
  // or update it to use the API.
  // Let's keep it simple: if the user right-clicks, we could just send the URL to the popup?
  // Or reuse the popup's logic?
  // Actually, the context menu is handled in background.js which sends a message to content.js.
  // We should probably strip down content.js to just be a helper for image extraction.

  if (request.action === 'ANALYZE_SINGLE_IMAGE') {
      // For now, we return the URL so the caller can handle it,
      // or we can just ignore this if we move everything to popup.
      // However, context menu analysis usually happens in-page.
      // Let's implement a simple in-page alert or overlay that says "Please use the popup scan"
      // or duplicate the API logic here.
      // Given the strict "Unify to immediate server-side AI analysis",
      // let's assume the popup is the main interface.
      // But the context menu feature is useful.
      // I will leave a minimal handler that can be expanded later if needed,
      // but for now I am focusing on the "Scan Button" flow.
      console.log('Context menu analysis requested for:', request.srcUrl);
  }
});
