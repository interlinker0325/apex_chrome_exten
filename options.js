// APEX Purchaser Options Page JavaScript

// Load settings when page loads
document.addEventListener('DOMContentLoaded', loadSettings);

function loadSettings() {
  chrome.storage.sync.get(['apexSettings'], (result) => {
    if (result.apexSettings) {
      const settings = result.apexSettings;
      document.getElementById('cardNumber').value = settings.cardNumber || '';
      document.getElementById('expiryMonth').value = settings.expiryMonth || '09';
      document.getElementById('expiryYear').value = settings.expiryYear || '2025';
      document.getElementById('cvv').value = settings.cvv || '';
      document.getElementById('accountType').value = settings.accountType || '25k-Tradovate';
      document.getElementById('numberOfAccounts').value = settings.numberOfAccounts || 1;
    }
  });
}

function saveSettings() {
  const settings = {
    cardNumber: document.getElementById('cardNumber').value,
    expiryMonth: document.getElementById('expiryMonth').value,
    expiryYear: document.getElementById('expiryYear').value,
    cvv: document.getElementById('cvv').value,
    accountType: document.getElementById('accountType').value,
    numberOfAccounts: parseInt(document.getElementById('numberOfAccounts').value)
  };

  chrome.storage.sync.set({ apexSettings: settings }, () => {
    showStatus('Settings saved successfully!', 'success');
  });
}

function resetSettings() {
  document.getElementById('cardNumber').value = '';
  document.getElementById('expiryMonth').value = '09';
  document.getElementById('expiryYear').value = '2025';
  document.getElementById('cvv').value = '';
  document.getElementById('accountType').value = '25k-Tradovate';
  document.getElementById('numberOfAccounts').value = 1;

  showStatus('Settings reset to defaults', 'success');
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';

  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}
