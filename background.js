// Background script for APEX Purchaser Chrome Extension
// This script now only handles message forwarding since all automation is done in content.js

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'addLog':
            // Forward log message to popup
            chrome.runtime.sendMessage({
                action: 'addLog',
                message: message.message
            }).catch(error => {
                console.log('Error forwarding log:', error);
            });
            sendResponse({ success: true });
            return true;
            
        case 'updateStatus':
            // Forward status update to popup
            chrome.runtime.sendMessage({
                action: 'updateStatus',
                status: message.status,
                message: message.message
            }).catch(error => {
                console.log('Error forwarding status:', error);
            });
            sendResponse({ success: true });
            return true;
            
        case 'pageChanged':
            // Handle page change notifications
            console.log('Page changed:', message.url);
            sendResponse({ success: true });
            return true;
            
        default:
            sendResponse({ success: false, error: 'Unknown action' });
    }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('APEX Purchaser extension installed');
        
        // Set default settings
        chrome.storage.sync.set({
            settings: {
                cardNumber: '',
                expiryMonth: (new Date().getMonth() + 1).toString().padStart(2, '0'),
                expiryYear: new Date().getFullYear(),
                cvv: '',
                numberOfAccounts: 1,
                selectedAccount: '300k-Tradovate'
            }
        });
    }
});

// Handle tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // You can add logic here to inject content script on specific websites
        // For now, we'll let the manifest handle content script injection
    }
});