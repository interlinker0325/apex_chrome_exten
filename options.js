// Options page script for APEX Purchaser Chrome Extension

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize form
    initializeForm();
    
    // Load saved settings
    await loadSettings();
    
    // Set up event listeners
    setupEventListeners();
    
    // Populate year options
    populateYearOptions();
});

// Initialize form elements
function initializeForm() {
    // Set default values
    document.getElementById('expiryMonth').value = '03';
    document.getElementById('numberOfAccounts').value = '1';
    
    // Set default selected account
    const defaultAccount = document.querySelector('input[name="selectedAccount"][value="300k-Tradovate"]');
    if (defaultAccount) {
        defaultAccount.checked = true;
    }
}

// Populate year options
function populateYearOptions() {
    const yearSelect = document.getElementById('expiryYear');
    const currentYear = new Date().getFullYear();
    
    // Clear existing options
    yearSelect.innerHTML = '';
    
    // Add years from current year to 20 years ahead
    for (let i = 0; i < 20; i++) {
        const year = currentYear + i;
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        
        // Set current year + 5 as default
        if (year === currentYear + 5) {
            option.selected = true;
        }
        
        yearSelect.appendChild(option);
    }
}

// Set up event listeners
function setupEventListeners() {
    const form = document.getElementById('settingsForm');
    const defaultSettingsBtn = document.getElementById('defaultSettings');
    const accountRadios = document.querySelectorAll('input[name="selectedAccount"]');
    
    // Form submission
    form.addEventListener('submit', handleSaveSettings);
    
    // Default settings button
    defaultSettingsBtn.addEventListener('click', resetToDefaults);
    
    // Account type selection
    accountRadios.forEach(radio => {
        radio.addEventListener('change', updateSelectedAccountDisplay);
    });
    
    // Card number formatting
    const cardNumberInput = document.getElementById('cardNumber');
    cardNumberInput.addEventListener('input', formatCardNumber);
}

// Load settings from storage
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['settings']);
        if (result.settings) {
            const settings = result.settings;
            
            // Populate form fields
            if (settings.cardNumber) {
                document.getElementById('cardNumber').value = settings.cardNumber;
            }
            if (settings.expiryMonth) {
                document.getElementById('expiryMonth').value = settings.expiryMonth;
            }
            if (settings.expiryYear) {
                document.getElementById('expiryYear').value = settings.expiryYear;
            }
            if (settings.cvv) {
                document.getElementById('cvv').value = settings.cvv;
            }
            if (settings.numberOfAccounts) {
                document.getElementById('numberOfAccounts').value = settings.numberOfAccounts;
            }
            if (settings.selectedAccount) {
                const accountRadio = document.querySelector(`input[name="selectedAccount"][value="${settings.selectedAccount}"]`);
                if (accountRadio) {
                    accountRadio.checked = true;
                    updateSelectedAccountDisplay();
                }
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showStatusMessage('Error loading settings', 'error');
    }
}

// Handle form submission
async function handleSaveSettings(event) {
    event.preventDefault();
    
    try {
        // Get form data
        const formData = new FormData(event.target);
        const settings = {
            cardNumber: formData.get('cardNumber'),
            expiryMonth: formData.get('expiryMonth'),
            expiryYear: formData.get('expiryYear'),
            cvv: formData.get('cvv'),
            numberOfAccounts: parseInt(formData.get('numberOfAccounts')),
            selectedAccount: formData.get('selectedAccount')
        };
        
        // Validate required fields
        if (!settings.cardNumber || !settings.expiryMonth || !settings.expiryYear || !settings.cvv) {
            showStatusMessage('Please fill in all payment details', 'error');
            return;
        }
        
        if (!settings.selectedAccount) {
            showStatusMessage('Please select an account type', 'error');
            return;
        }
        
        // Save to storage
        await chrome.storage.sync.set({ settings: settings });
        
        showStatusMessage('Settings saved successfully!', 'success');
        
        // Clear message after 3 seconds
        setTimeout(() => {
            clearStatusMessage();
        }, 3000);
        
    } catch (error) {
        console.error('Error saving settings:', error);
        showStatusMessage('Error saving settings', 'error');
    }
}

// Reset to default settings
function resetToDefaults() {
    // Clear all form fields
    document.getElementById('cardNumber').value = '';
    document.getElementById('expiryMonth').value = '03';
    document.getElementById('expiryYear').value = new Date().getFullYear() + 5;
    document.getElementById('cvv').value = '';
    document.getElementById('numberOfAccounts').value = '1';
    
    // Set default account type
    const defaultAccount = document.querySelector('input[name="selectedAccount"][value="300k-Tradovate"]');
    if (defaultAccount) {
        defaultAccount.checked = true;
        updateSelectedAccountDisplay();
    }
    
    // Clear other radio buttons
    document.querySelectorAll('input[name="selectedAccount"]').forEach(radio => {
        if (radio.value !== '300k-Tradovate') {
            radio.checked = false;
        }
    });
    
    showStatusMessage('Settings reset to defaults', 'info');
    
    // Clear message after 2 seconds
    setTimeout(() => {
        clearStatusMessage();
    }, 2000);
}

// Update selected account display
function updateSelectedAccountDisplay() {
    const selectedRadio = document.querySelector('input[name="selectedAccount"]:checked');
    const displayElement = document.getElementById('selectedAccountDisplay');
    
    if (selectedRadio && displayElement) {
        displayElement.textContent = selectedRadio.value;
    }
}

// Format card number with spaces
function formatCardNumber(event) {
    let value = event.target.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
    let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
    
    if (formattedValue.length <= 19) { // 16 digits + 3 spaces
        event.target.value = formattedValue;
    }
}

// Show status message
function showStatusMessage(message, type) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    statusElement.style.display = 'block';
}

// Clear status message
function clearStatusMessage() {
    const statusElement = document.getElementById('statusMessage');
    statusElement.style.display = 'none';
    statusElement.textContent = '';
}
