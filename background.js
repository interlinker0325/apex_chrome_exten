// APEX Purchaser Chrome Extension - Background Script
// Simple background service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('APEX Purchaser extension installed');
});
