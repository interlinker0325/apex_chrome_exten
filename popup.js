// APEX Purchaser Chrome Extension - Popup Script
// Simple, clean implementation

// Prevent duplicate loading
if (window.apexPurchaserLoaded) {
    console.log('APEX Purchaser popup already loaded, skipping...');
} else {
    window.apexPurchaserLoaded = true;

    class ApexPurchaser {
        constructor() {
            this.isRunning = false;
            this.sessionId = null;
            this.currentAccount = 0;
            this.totalAccounts = 0;
            this.init();
        }

        init() {
            this.loadSettings();
            this.setupEventListeners();
            this.updateUI();
        }

        setupEventListeners() {
            // Prevent duplicate listeners
            if (this.eventListenersAdded) return;
            this.eventListenersAdded = true;

            document.getElementById('startBtn').addEventListener('click', () => this.startAutomation());
            document.getElementById('stopBtn').addEventListener('click', () => this.stopAutomation());
            document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
            document.getElementById('clearBtn').addEventListener('click', () => this.clearProgress());

            // Auto-save settings on change
            const inputs = document.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.addEventListener('change', () => this.saveSettings());
            });

            // Listen for progress updates from content script
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.action === 'progressUpdate') {
                    this.updateProgress(request.currentAccount, request.totalAccounts);
                } else if (request.action === 'log') {
                    this.addLog(request.message, request.type);
                }
            });
        }

        loadSettings() {
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

        saveSettings() {
            const settings = {
                cardNumber: document.getElementById('cardNumber').value,
                expiryMonth: document.getElementById('expiryMonth').value,
                expiryYear: document.getElementById('expiryYear').value,
                cvv: document.getElementById('cvv').value,
                accountType: document.getElementById('accountType').value,
                numberOfAccounts: parseInt(document.getElementById('numberOfAccounts').value)
            };

            chrome.storage.sync.set({ apexSettings: settings });
            this.addLog('Settings saved');
        }

        async startAutomation() {
            if (this.isRunning) {
                this.addLog('Automation already running');
                return;
            }

            // Validate settings
            if (!this.validateSettings()) {
                return;
            }

            try {
                this.isRunning = true;
                this.currentAccount = 0;
                this.totalAccounts = parseInt(document.getElementById('numberOfAccounts').value);
                this.updateUI();
                this.addLog('Starting APEX automation...');

                // Get current tab
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

                if (!tab) {
                    throw new Error('No active tab found');
                }

                // Ensure we're on the member page where content script is injected
                if (!tab.url.includes('apextraderfunding.com/member')) {
                    this.addLog('Navigating to member page...');
                    await chrome.tabs.update(tab.id, { url: 'https://dashboard.apextraderfunding.com/member' });

                    // Wait for navigation and content script to load
                    await this.waitForPageAndContentScript(tab.id);
                }

                // Send automation data
                const settings = this.getSettings();

                try {
                    // Send message to content script
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        action: 'startAutomation',
                        data: settings
                    });

                    if (response && response.success) {
                        this.addLog('Automation started successfully');
                        this.updateStatus('processing', 'Running...');
                    } else {
                        throw new Error(response?.error || 'Failed to start automation');
                    }
                } catch (messageError) {
                    this.addLog(`Error: ${messageError.message}`, 'error');
                    this.isRunning = false;
                    this.updateUI();
                }

            } catch (error) {
                this.addLog(`Error: ${error.message}`, 'error');
                this.isRunning = false;
                this.updateUI();
            }
        }

        async stopAutomation() {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) {
                    await chrome.tabs.sendMessage(tab.id, { action: 'stopAutomation' });
                }
            } catch (error) {
                console.log('Error stopping automation:', error);
            }

            this.isRunning = false;
            this.updateUI();
            this.addLog('Automation stopped');
            this.updateStatus('ready', 'Ready');
        }

        async waitForPageAndContentScript(tabId) {
            const maxAttempts = 10;
            const delay = 1000;

            for (let i = 0; i < maxAttempts; i++) {
                try {
                    // Wait for page to load
                    await new Promise(resolve => setTimeout(resolve, delay));

                    // Check if content script is ready
                    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
                    if (response && response.success) {
                        this.addLog('Content script is ready');
                        return;
                    }
                } catch (error) {
                    // Content script not ready yet, continue waiting
                }
            }

            this.addLog('Content script ready timeout, proceeding anyway...');
        }


        validateSettings() {
            const cardNumber = document.getElementById('cardNumber').value.trim();
            const cvv = document.getElementById('cvv').value.trim();
            const numberOfAccounts = parseInt(document.getElementById('numberOfAccounts').value);

            if (!cardNumber) {
                this.addLog('Please enter card number', 'error');
                return false;
            }

            if (!cvv) {
                this.addLog('Please enter CVV', 'error');
                return false;
            }

            if (numberOfAccounts < 1 || numberOfAccounts > 10) {
                this.addLog('Number of accounts must be between 1 and 10', 'error');
                return false;
            }

            return true;
        }

        getSettings() {
            return {
                cardNumber: document.getElementById('cardNumber').value.trim(),
                expiryMonth: document.getElementById('expiryMonth').value,
                expiryYear: document.getElementById('expiryYear').value,
                cvv: document.getElementById('cvv').value.trim(),
                accountType: document.getElementById('accountType').value,
                numberOfAccounts: parseInt(document.getElementById('numberOfAccounts').value),
                sessionId: 'session-' + Date.now()
            };
        }

        updateUI() {
            const startBtn = document.getElementById('startBtn');
            const stopBtn = document.getElementById('stopBtn');

            if (this.isRunning) {
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else {
                startBtn.disabled = false;
                stopBtn.disabled = true;
            }
        }

        updateStatus(status, text) {
            const statusEl = document.getElementById('status');
            statusEl.textContent = text;
            statusEl.className = `status ${status}`;
        }

        addLog(message, type = 'info') {
            const logContainer = document.getElementById('logContainer');
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${type}`;

            const timestamp = new Date().toLocaleTimeString();
            logEntry.textContent = `[${timestamp}] ${message}`;

            logContainer.appendChild(logEntry);
            logContainer.scrollTop = logContainer.scrollHeight;

            // Keep only last 50 log entries
            while (logContainer.children.length > 50) {
                logContainer.removeChild(logContainer.firstChild);
            }
        }

        openSettings() {
            chrome.tabs.create({ url: 'options.html' });
        }

        updateProgress(current, total) {
            this.currentAccount = current;
            this.totalAccounts = total;

            const progressText = document.getElementById('progressText');
            const progressFill = document.getElementById('progressFill');
            const progressSection = document.getElementById('progressSection');

            if (current > 0 && total > 0) {
                progressText.textContent = `Processing account ${current} of ${total}`;
                const percentage = ((current - 1) / total) * 100;
                progressFill.style.width = `${percentage}%`;
                progressSection.style.display = 'block';
            } else {
                progressSection.style.display = 'none';
            }
        }

        clearProgress() {
            this.isRunning = false;
            this.currentAccount = 0;
            this.totalAccounts = 0;

            // Hide progress section
            document.getElementById('progressSection').style.display = 'none';

            // Reset progress bar
            document.getElementById('progressFill').style.width = '0%';

            // Update UI
            this.updateUI();

            // Clear logs
            document.getElementById('logContainer').innerHTML = '<div class="log-entry">Extension ready. Configure settings and start automation.</div>';

            // Stop automation in content script
            this.stopAutomation();

            this.addLog('Progress cleared - ready to restart');
            this.updateStatus('ready', 'Ready');
        }
    }

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        new ApexPurchaser();
    });

} // End of duplicate loading check