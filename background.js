// APEX Purchaser Chrome Extension - Background Script
// Simple background service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('APEX Purchaser extension installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'log') {
    // Forward log messages to popup if it's open
    chrome.runtime.sendMessage(request).catch(() => {
      // Popup might not be open, ignore error
    });
  }
  return true;
});
