chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanImages') {
    const images = document.querySelectorAll('img');
    const imageCount = images.length;
    console.log(`Linzu found ${imageCount} images.`);
    sendResponse({ count: imageCount });
  }
  // Keep the message channel open for sendResponse
  return true;
});
