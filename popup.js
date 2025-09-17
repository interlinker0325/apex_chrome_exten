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
            this.stopButtonMode = 'stop'; // 'stop' | 'clear'
            this.init();
        }

        init() {
            this.setupExpiryOptions();
            this.loadSettings();
            this.setupEventListeners();
            this.setupTabs();
            this.updateUI();
        }

        setupEventListeners() {
            // Prevent duplicate listeners
            if (this.eventListenersAdded) return;
            this.eventListenersAdded = true;

            document.getElementById('startBtn').addEventListener('click', () => this.startAutomation());
            document.getElementById('stopBtn').addEventListener('click', () => {
                if (this.stopButtonMode === 'clear') {
                    this.clearProgressAndReset();
                } else {
                    this.stopAutomation();
                }
            });
            // Settings live in the popup tabs now; no separate options page
            // Clear button removed with compact always-visible progress

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
                } else if (request.action === 'paymentError') {
                    // Stop UI, switch to clear mode, and surface the error
                    this.isRunning = false;
                    this.updateStatus('error', 'Payment error');
                    this.setStopButtonMode('clear');
                    this.updateUI();
                    if (request.message) {
                        this.addLog(request.message, 'error');
                    }
                }
            });
        }

        async loadSettings() {
            const result = await chrome.storage.sync.get(['apexSettings']);
            const now = new Date();
            const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
            const currentYear = String(now.getFullYear());

            if (result.apexSettings) {
                const settings = result.apexSettings;
                document.getElementById('cardNumber').value = settings.cardNumber || '';
                document.getElementById('expiryMonth').value = settings.expiryMonth || currentMonth;
                document.getElementById('expiryYear').value = settings.expiryYear || currentYear;
                document.getElementById('cvv').value = settings.cvv || '';
                this.setAccountTypeRadio(settings.accountType || '25k-Tradovate');
                document.getElementById('numberOfAccounts').value = settings.numberOfAccounts || 1;

                const automationState = await chrome.storage.local.get(['apexAutomationState']);
                this.updateProgress(parseInt(automationState.completedCount || 0), parseInt(settings.numberOfAccounts || 0));
            } else {
                // Default to current month/year
                document.getElementById('expiryMonth').value = currentMonth;
                document.getElementById('expiryYear').value = currentYear;
                // Default progress state
                this.updateProgress(0, parseInt(document.getElementById('numberOfAccounts').value || 0));
            }
        }

        async saveSettings() {
            const settings = {
                cardNumber: document.getElementById('cardNumber').value,
                expiryMonth: document.getElementById('expiryMonth').value,
                expiryYear: document.getElementById('expiryYear').value,
                cvv: document.getElementById('cvv').value,
                accountType: this.getAccountTypeRadio(),
                numberOfAccounts: parseInt(document.getElementById('numberOfAccounts').value)
            };

            await chrome.storage.sync.set({ apexSettings: settings });
            this.addLog('Settings saved');

            // Keep progress total in sync with settings changes when idle
            if (!this.isRunning) {
                const automationState = await chrome.storage.local.get(['apexAutomationState']);
                this.updateProgress(parseInt(automationState.completedCount) || 0, parseInt(settings.numberOfAccounts || 0));
            }
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
                }

                // Wait for navigation and content script to load (inject if missing)
                await this.waitForPageAndContentScript(tab.id);

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
                // Set a persistent stop flag to prevent continuation on next page
                await chrome.storage.local.set({ apexAutomationStopRequested: { timestamp: Date.now() } });

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
            this.setStopButtonMode('clear');
            this.updateUI();
        }

        async waitForPageAndContentScript(tabId) {
            const maxAttempts = 10;
            const delay = 1000;
            let attemptedInjection = false;

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
                    // If not yet injected and we have scripting permission, try injecting once
                    if (!attemptedInjection) {
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId },
                                files: ['content.js']
                            });
                            this.addLog('Injected content script');
                            attemptedInjection = true;
                        } catch (injectErr) {
                            // Injection might fail on chrome:// or restricted pages; continue retrying
                        }
                    }
                    // Continue waiting
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
                accountType: this.getAccountTypeRadio(),
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
                this.setStopButtonMode('stop');
            } else {
                startBtn.disabled = false;
                // Stop button only enabled in 'clear' mode after stop/completion
                stopBtn.disabled = this.stopButtonMode !== 'clear';
            }
        }

        setStopButtonMode(mode) {
            const stopBtn = document.getElementById('stopBtn');
            this.stopButtonMode = mode;
            if (mode === 'clear') {
                stopBtn.textContent = 'Clear & Reset';
                stopBtn.classList.remove('btn-danger');
                stopBtn.classList.add('btn-warning');
            } else {
                stopBtn.textContent = 'Stop Automation';
                stopBtn.classList.add('btn-danger');
                stopBtn.classList.remove('btn-warning');
            }
        }

        setupTabs() {
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabs = document.querySelectorAll('.tab-content');

            tabButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update buttons
                    tabButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Show target tab
                    const target = btn.getAttribute('data-target');
                    tabs.forEach(t => t.classList.remove('active'));
                    const targetEl = document.querySelector(target);
                    if (targetEl) targetEl.classList.add('active');
                });
            });
        }

        setupExpiryOptions() {
            const monthSelect = document.getElementById('expiryMonth');
            const yearSelect = document.getElementById('expiryYear');
            if (!monthSelect || !yearSelect) return;

            const monthNames = [
                '01 - January','02 - February','03 - March','04 - April','05 - May','06 - June',
                '07 - July','08 - August','09 - September','10 - October','11 - November','12 - December'
            ];
            const now = new Date();
            const currentMonthIdx = now.getMonth();
            const currentYear = now.getFullYear();

            // Populate months
            monthSelect.innerHTML = '';
            for (let i = 0; i < 12; i++) {
                const value = String(i + 1).padStart(2, '0');
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = monthNames[i];
                monthSelect.appendChild(opt);
            }
            monthSelect.value = String(currentMonthIdx + 1).padStart(2, '0');

            // Populate years (current to current + 10)
            yearSelect.innerHTML = '';
            for (let y = currentYear; y <= currentYear + 10; y++) {
                const opt = document.createElement('option');
                opt.value = String(y);
                opt.textContent = String(y);
                yearSelect.appendChild(opt);
            }
            yearSelect.value = String(currentYear);
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

        // openSettings removed; settings handled in popup tabs

        updateProgress(current, total) {
            const progressFill = document.getElementById('progressFill');
            const progressNums = document.getElementById('progressNums');

            const valid = current >= 0 && total >= 0;
            const percentage = total > 0 ? Math.min(100, Math.max(0, ((current) / total) * 100)) : 0;
            progressFill.style.width = `${percentage}%`;
            progressNums.textContent = `${Math.max(0, current)} / ${Math.max(0, total)}`;
            if (total > 0 && current >= total && !this.isRunning) {
                // Completed
                this.isRunning = false;
                this.updateStatus('success', 'Completed');
                this.setStopButtonMode('clear');
                this.updateUI();
            }
        }

        clearProgressAndReset() {
            // Reset running state
            this.isRunning = false;

            // Reset progress bar and numbers
            const progressFill = document.getElementById('progressFill');
            const progressNums = document.getElementById('progressNums');
            progressFill.style.width = '0%';
            progressNums.textContent = '0 / 0';

            // Reset logs
            const logContainer = document.getElementById('logContainer');
            logContainer.innerHTML = '<div class="log-entry">Extension ready. Configure settings and start automation.</div>';

            // Reload saved settings (restore last saved values)
            this.loadSettings();

            // Reset UI to ready
            this.updateStatus('ready', 'Ready');
            this.setStopButtonMode('stop');
            this.updateUI();

            // After clearing, disable stop (no more to clear)
            const stopBtn = document.getElementById('stopBtn');
            stopBtn.disabled = true;
        }

        setAccountTypeRadio(value) {
            const group = document.getElementsByName('accountType');
            let found = false;
            group.forEach && group.forEach(r => { if (r.value === value) { r.checked = true; found = true; } });
            if (!found && group.length > 0) {
                group[0].checked = true;
            }
        }

        getAccountTypeRadio() {
            const group = document.getElementsByName('accountType');
            for (let i = 0; i < group.length; i++) {
                if (group[i].checked) return group[i].value;
            }
            return '25k-Tradovate';
        }
    }

    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        new ApexPurchaser();
    });

} // End of duplicate loading check
