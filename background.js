// APEX Purchaser Chrome Extension - Background Script
// Simple background service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('APEX Purchaser extension installed');
});

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  try {
    if (request && request.action === 'log') {
      const { message, type = 'info' } = request;
      const logsObj = await chrome.storage.local.get(['apexLogs']);
      const logs = Array.isArray(logsObj.apexLogs) ? logsObj.apexLogs : [];
      logs.push({ t: Date.now(), message, type });
      // Cap to last 200 entries
      const trimmed = logs.slice(-200);
      await chrome.storage.local.set({ apexLogs: trimmed });
      return true;
    }

    if (request && request.action === 'progressUpdate') {
      const { currentAccount = 0, totalAccounts = 0 } = request;
      await chrome.storage.local.set({ apexLastProgress: { current: currentAccount, total: totalAccounts, t: Date.now() } });
      return true;
    }

    if (request && request.action === 'paymentError') {
      const logsObj = await chrome.storage.local.get(['apexLogs']);
      const logs = Array.isArray(logsObj.apexLogs) ? logsObj.apexLogs : [];
      logs.push({ t: Date.now(), message: request.message || 'Payment error', type: 'error' });
      const trimmed = logs.slice(-200);
      await chrome.storage.local.set({ apexLogs: trimmed });
      return true;
    }
  } catch (e) {
    // Swallow background errors to avoid breaking message dispatch
    console.log('Background message handling error:', e);
  }
});
