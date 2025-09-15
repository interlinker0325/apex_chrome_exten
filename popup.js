// Popup script for APEX Purchaser Chrome Extension
// This script now works directly with content.js for all automation

let sessionId = null;
let isAutomationRunning = false;

// DOM elements
const startScrapingBtn = document.getElementById('startScraping');
const stopScrapingBtn = document.getElementById('stopScraping');
const extensionOptionsBtn = document.getElementById('extensionOptions');
const statusElement = document.getElementById('status');
const logsElement = document.getElementById('logs');

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved settings and state
    await loadSettings();
    await loadPersistentState();
    
    // Set up event listeners
    startScrapingBtn.addEventListener('click', handleStartScraping);
    stopScrapingBtn.addEventListener('click', handleStopScraping);
    extensionOptionsBtn.addEventListener('click', openOptionsPage);
    
    // Set up real-time listeners
    setupRealTimeListeners();
});

// Load settings from storage
async function loadSettings() {
    try {
        const result = await chrome.storage.sync.get(['settings']);
        if (result.settings) {
            console.log('Settings loaded:', result.settings);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Load persistent state from storage
async function loadPersistentState() {
    try {
        const result = await chrome.storage.local.get(['popupState']);
        if (result.popupState) {
            const state = result.popupState;
            
            // Restore automation status
            isAutomationRunning = state.isAutomationRunning || false;
            sessionId = state.sessionId || null;
            
            // Restore logs
            if (state.logs && state.logs.length > 0) {
                logsElement.innerHTML = '';
                state.logs.forEach(log => {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    logEntry.textContent = log;
                    logsElement.appendChild(logEntry);
                });
                logsElement.scrollTop = logsElement.scrollHeight;
            }
            
            // Restore status
            if (state.status) {
                updateStatus(state.status, state.statusText || getStatusText(state.status));
            } else {
                updateStatus('ready', 'Extension ready. Configure settings and start scraping.');
            }
            
            // Update button state
            updateButtonState();
            
            console.log('Persistent state loaded:', state);
        } else {
            // Initialize with default state
            updateStatus('ready', 'Extension ready. Configure settings and start scraping.');
        }
    } catch (error) {
        console.error('Error loading persistent state:', error);
        updateStatus('ready', 'Extension ready. Configure settings and start scraping.');
    }
}

// Save persistent state to storage
async function savePersistentState() {
    try {
        const logs = Array.from(logsElement.children).map(entry => entry.textContent);
        const status = statusElement.className.split(' ')[1] || 'ready';
        const statusText = statusElement.textContent;
        
        const state = {
            isAutomationRunning,
            sessionId,
            logs,
            status,
            statusText,
            timestamp: Date.now()
        };
        
        await chrome.storage.local.set({ popupState: state });
    } catch (error) {
        console.error('Error saving persistent state:', error);
    }
}

// Set up real-time listeners for state updates
function setupRealTimeListeners() {
    // Listen for storage changes (from content script)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.popupState) {
            const newState = changes.popupState.newValue;
            if (newState) {
                // Update logs in real-time
                if (newState.logs && newState.logs.length > logsElement.children.length) {
                    const currentLogCount = logsElement.children.length;
                    newState.logs.slice(currentLogCount).forEach(log => {
                        const logEntry = document.createElement('div');
                        logEntry.className = 'log-entry';
                        logEntry.textContent = log;
                        logsElement.appendChild(logEntry);
                    });
                    logsElement.scrollTop = logsElement.scrollHeight;
                }
                
                // Update status in real-time
                if (newState.status && newState.status !== statusElement.className.split(' ')[1]) {
                    updateStatus(newState.status, newState.statusText || getStatusText(newState.status));
                }
                
                // Update automation running state
                isAutomationRunning = newState.isAutomationRunning || false;
                updateButtonState();
            }
        }
    });
}

// Update button state based on automation status
function updateButtonState() {
    if (isAutomationRunning) {
        startScrapingBtn.textContent = 'PROCESSING...';
        startScrapingBtn.disabled = true;
        startScrapingBtn.style.opacity = '0.6';
        stopScrapingBtn.style.display = 'block';
    } else {
        startScrapingBtn.textContent = 'START SCRAPING';
        startScrapingBtn.disabled = false;
        startScrapingBtn.style.opacity = '1';
        stopScrapingBtn.style.display = 'none';
    }
}

// Handle start scraping button click
async function handleStartScraping() {
    try {
        if (isAutomationRunning) {
            addLog('Automation already running, please wait...');
            return;
        }
        
        // Get settings from storage
        const result = await chrome.storage.sync.get(['settings']);
        const settings = result.settings;
        
        if (!settings) {
            addLog('Error: Please configure settings first');
            openOptionsPage();
            return;
        }
        
        // Validate required settings
        if (!settings.cardNumber || !settings.cvv) {
            addLog('Error: Please fill in payment details in settings');
            openOptionsPage();
            return;
        }
        
        updateStatus('processing', 'Starting...');
        addLog('Starting APEX automation on current page...');
        
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            addLog('Error: No active tab found');
            updateStatus('error', 'Error');
            return;
        }
        
        // Check if we're on the APEX dashboard
        if (!tab.url.includes('apextraderfunding.com/member')) {
            addLog('Error: Please navigate to APEX dashboard first');
            addLog('Go to: https://dashboard.apextraderfunding.com/member/');
            updateStatus('error', 'Error');
            return;
        }
        
        // First, inject the content script if it's not already loaded
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            addLog('Content script injected');
        } catch (error) {
            // Content script might already be loaded, that's okay
            console.log('Content script injection result:', error.message);
        }
        
        // Wait a moment for the content script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Test if content script is loaded
        try {
            const pingResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            if (pingResponse && pingResponse.success) {
                addLog('Content script is ready');
            } else {
                addLog('Content script not responding, trying to inject...');
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            addLog('Content script not loaded, injecting...');
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Send message to content script to start automation
        try {
            isAutomationRunning = true;
            sessionId = 'content-script-' + Date.now();
            
            // Update button state and save state
            updateButtonState();
            await savePersistentState();
            
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'startAutomation',
                data: {
                    ...settings,
                    sessionId: sessionId
                }
            });
            
            if (response && response.success) {
                addLog('Automation started on current page');
                updateStatus('processing', 'Processing...');
            } else {
                addLog(`Error: ${response ? response.error : 'No response from content script'}`);
                updateStatus('error', 'Error');
                isAutomationRunning = false;
                updateButtonState();
                await savePersistentState();
            }
        } catch (error) {
            addLog(`Error starting automation: ${error.message}`);
            addLog('Please refresh the page and try again');
            updateStatus('error', 'Error');
            isAutomationRunning = false;
            updateButtonState();
            await savePersistentState();
        }
        
    } catch (error) {
        console.error('Error starting scraping:', error);
        addLog(`Error: ${error.message}`);
        updateStatus('error', 'Error');
        isAutomationRunning = false;
    }
}

// Handle stop scraping button click
async function handleStopScraping() {
    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab) {
            // Send stop message to content script
            await chrome.tabs.sendMessage(tab.id, {
                action: 'stopAutomation'
            });
        }
        
        // Clear any saved state
        await chrome.storage.local.remove(['apexNextAccount']);
        
        // Update UI
        isAutomationRunning = false;
        updateStatus('stopped', 'Stopped');
        addLog('Automation stopped by user');
        updateButtonState();
        await savePersistentState();
        
    } catch (error) {
        console.error('Error stopping automation:', error);
        addLog('Error stopping automation: ' + error.message);
    }
}

// Open options page
function openOptionsPage() {
    chrome.runtime.openOptionsPage();
}

// Update status display
function updateStatus(status, text) {
    statusElement.textContent = text;
    statusElement.className = `status ${status}`;
}

// Get status text
function getStatusText(status) {
    switch (status) {
        case 'ready': return 'Ready';
        case 'processing': return 'Processing...';
        case 'stopped': return 'Stopped';
        case 'completed': return 'Completed';
        case 'error': return 'Error';
        default: return 'Ready';
    }
}

// Add log entry
function addLog(message) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    logsElement.appendChild(logEntry);
    logsElement.scrollTop = logsElement.scrollHeight;
    
    // Save state after adding log
    savePersistentState();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === 'updateStatus') {
        updateStatus(message.status, getStatusText(message.status));
        
        // Reset automation running flag when process completes
        if (['completed', 'stopped', 'error'].includes(message.status)) {
            isAutomationRunning = false;
            updateButtonState();
            
            if (message.status === 'completed') {
                addLog('✅ Process completed successfully');
            } else if (message.status === 'stopped') {
                addLog('🛑 Process stopped');
            } else if (message.status === 'error') {
                addLog('❌ Process failed');
            }
            
            // Save state after status change
            await savePersistentState();
            
            // Reset status after delay
            setTimeout(async () => {
                updateStatus('ready', 'Extension ready. Configure settings and start scraping.');
                await savePersistentState();
            }, 3000);
        }
    } else if (message.action === 'addLog') {
        addLog(message.message);
    }
});