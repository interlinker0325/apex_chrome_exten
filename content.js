// APEX Purchaser Chrome Extension - Content Script
// Simplified, clean implementation

// Prevent duplicate loading
if (window.apexAutomationLoaded) {
  console.log('APEX Purchaser content script already loaded, skipping...');
} else {
  window.apexAutomationLoaded = true;

  // Generate unique instance ID
  const instanceId = Date.now() + Math.random();
  window.apexAutomationInstanceId = instanceId;

  class ApexAutomation {
    constructor() {
      this.isRunning = false;
      this.currentAccount = 1;
      this.settings = null;
      this.completedCount = 0;
      this.hasResumedOnce = false;
      this.init();
    }

    init() {
      this.setupMessageListener();
      this.addLog(`Content script loaded (Instance: ${instanceId})`);

      // Small delay to ensure everything is ready
      setTimeout(() => {
        // Check if we should continue automation on page load
        // Only check if no other instance is already running
        if (!window.apexAutomationRunning && !this.isRunning) {
          this.checkForContinuation();
        } else {
          this.addLog(`Automation already running, skipping continuation check (Instance: ${instanceId})`);
        }
      }, 500);
    }

    setupMessageListener() {
      // Prevent duplicate listeners
      if (this.messageListenerAdded) return;
      this.messageListenerAdded = true;

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
          case 'ping':
            sendResponse({ success: true });
            return true;
          case 'startAutomation':
            this.startAutomation(request.data, sendResponse);
            return true; // Keep the message channel open for async response
          case 'stopAutomation':
            this.stopAutomation(sendResponse);
            return true;
        }
      });
    }

    async startAutomation(data, sendResponse) {
      // Check if automation is already running globally
      if (window.apexAutomationRunning || this.isRunning) {
        this.addLog('Automation already running, rejecting new start request');
        sendResponse({ success: false, error: 'Automation already running' });
        return;
      }

      try {
        // Set startup lock to prevent race conditions
        const startupLockKey = 'apexAutomationStartupLock';
        const existingLock = await chrome.storage.local.get([startupLockKey]);

        if (existingLock[startupLockKey]) {
          this.addLog('Another instance is starting automation, rejecting duplicate start');
          sendResponse({ success: false, error: 'Automation startup in progress' });
          return;
        }

        // Set startup lock
        await chrome.storage.local.set({ [startupLockKey]: { instanceId: instanceId, timestamp: Date.now() } });

        // Set flags immediately to prevent race conditions
        this.isRunning = true;
        window.apexAutomationRunning = true;
        this.settings = data;
        this.currentAccount = 1;
        this.completedCount = 0;

        this.addLog('Starting APEX automation...');
        this.addLog(`Processing ${this.settings.numberOfAccounts} accounts`);
        this.addLog(`Account type: ${this.settings.accountType}`);

        // Acquire automation lock so new content script instances skip continuation during navigation
        await chrome.storage.local.set({
          apexAutomationLock: {
            instanceId: instanceId,
            timestamp: Date.now()
          }
        });

        // Save automation state
        await this.saveAutomationState();

        // Clear startup lock
        await chrome.storage.local.remove([startupLockKey]);

        // Clear any prior stop request flag on new start
        await chrome.storage.local.remove(['apexAutomationStopRequested']);

        // Send immediate response to popup
        sendResponse({ success: true });

        // Start processing first account only; subsequent accounts handled by continuation after navigation
        this.handleAccountFlow(1).catch(error => {
          this.addLog(`Error during automation: ${error.message}`, 'error');
          this.isRunning = false;
          window.apexAutomationRunning = false;
          this.clearAutomationState();
        });
      } catch (error) {
        this.addLog(`Error: ${error.message}`, 'error');
        this.isRunning = false;
        window.apexAutomationRunning = false;
        // Clear startup lock on error
        await chrome.storage.local.remove(['apexAutomationStartupLock']);
        sendResponse({ success: false, error: error.message });
      }
    }

    async stopAutomation(sendResponse) {
      this.isRunning = false;
      window.apexAutomationRunning = false;
      await this.clearAutomationState();
      this.addLog('Automation stopped by user');
      sendResponse({ success: true });
    }

    async processAccounts() {
      for (let i = 1; i <= this.settings.numberOfAccounts; i++) {
        if (!this.isRunning) break;

        this.currentAccount = i;
        this.addLog(`🔄 Processing account ${i}/${this.settings.numberOfAccounts}`);

        // Save state before processing
        await this.saveAutomationState();

        try {
          const success = await this.processSingleAccount(i);
          if (success) {
            this.completedCount += 1;
            this.sendProgressUpdate(this.completedCount, this.settings.numberOfAccounts);
            this.addLog(`✅ Account ${i} completed successfully`);
          } else {
            this.addLog(`❌ Account ${i} failed`, 'error');
          }
        } catch (error) {
          this.addLog(`❌ Account ${i} failed: ${error.message}`, 'error');
        }

        if (!this.isRunning) break;

        // Wait before next account
        if (i < this.settings.numberOfAccounts) {
          await this.delay(2000);
        }
      }

      if (this.completedCount >= this.settings.numberOfAccounts) {
        this.addLog('🎉 All accounts processed!');
      }
      this.isRunning = false;
      window.apexAutomationRunning = false;

      // Clear automation state when done
      await this.clearAutomationState();

      // Send final progress update
      this.sendProgressUpdate(this.completedCount, this.settings.numberOfAccounts);
    }

    async processSingleAccount(accountNumber) {
      // Guard: do not process beyond configured number of accounts
      if (this.settings && accountNumber > (this.settings.numberOfAccounts || 0)) {
        this.addLog(`All accounts processed (requested ${this.settings.numberOfAccounts}), skipping account ${accountNumber}`);
        return false;
      }

      // Check if this account is already being processed
      if (window.apexProcessingAccount === accountNumber) {
        this.addLog(`Account ${accountNumber} already being processed, skipping...`);
        return false;
      }

      // Check if automation is still running
      if (!this.isRunning || !window.apexAutomationRunning) {
        this.addLog(`Automation stopped, skipping account ${accountNumber}`);
        return false;
      }

      // Mark this account as being processed
      window.apexProcessingAccount = accountNumber;

      const currentUrl = window.location.href;

      let success = false;
      if (currentUrl.includes('/payment/') || currentUrl.includes('/authorize-cim')) {
        this.addLog(`Already on payment page for account ${accountNumber}`);
        await this.fillPaymentDetails(accountNumber);
        await this.submitPayment(accountNumber);
        success = await this.waitForConfirmation(accountNumber);
      } else if (currentUrl.includes('/signup/')) {
        this.addLog(`On signup page for account ${accountNumber}`);
        await this.fillInitialForm(accountNumber);
        await this.navigateToPaymentPage(accountNumber);
        await this.fillPaymentDetails(accountNumber);
        await this.submitPayment(accountNumber);
        success = await this.waitForConfirmation(accountNumber);
      } else {
        this.addLog(`Starting from dashboard for account ${accountNumber}`);
        await this.navigateToSignupPage(accountNumber);
        await this.fillInitialForm(accountNumber);
        await this.navigateToPaymentPage(accountNumber);
        await this.fillPaymentDetails(accountNumber);
        await this.submitPayment(accountNumber);
        success = await this.waitForConfirmation(accountNumber);
      }

      // Clear the processing flag when done
      if (window.apexProcessingAccount === accountNumber) {
        window.apexProcessingAccount = null;
      }

      return success === true;
    }

    async navigateToSignupPage(accountNumber) {
      const signupUrl = `https://dashboard.apextraderfunding.com/signup/${this.settings.accountType}`;

      if (this.shouldAbort()) return;
      this.addLog(`Navigating to signup page for account ${accountNumber}...`);
      window.location.href = signupUrl;

      await this.waitForNavigation();
    }

    async fillInitialForm(accountNumber) {
      if (this.shouldAbort()) return false;
      this.addLog(`Filling initial form for account ${accountNumber}...`);

      // Wait for page to load
      await this.waitForElement('input[type="text"], input[type="checkbox"], input[type="submit"]', 15000);
      await this.humanDelay(2000, 4000); // 2-4 seconds

      // Fill coupon code
      const couponField = document.querySelector('input[name*="coupon"]');
      if (couponField) {
        if (this.shouldAbort()) return false;
        await this.typeWithDelay(couponField, 'SAVENOW', 120);
        this.addLog(`Entered coupon code for account ${accountNumber}`);
        await this.humanDelay(500, 1500); // 0.5-1.5 seconds
      }

      // Check terms agreement
      const termsCheckbox = document.querySelector('input[type="checkbox"][id*="agree"]');
      if (termsCheckbox && !termsCheckbox.checked) {
        if (this.shouldAbort()) return false;
        await this.humanDelay(800, 1500); // 0.8-1.5 seconds
        termsCheckbox.click();
        this.addLog(`Agreed to terms for account ${accountNumber}`);
        await this.humanDelay(1000, 2000); // 1-2 seconds
      }

      // Click next button
      const nextButton = document.querySelector('input[type="submit"][value*="Next"]');
      if (nextButton) {
        if (this.shouldAbort()) return false;
        await this.humanDelay(1000, 2000); // 1-2 seconds
        nextButton.click();
        this.addLog(`Clicked next button for account ${accountNumber}`);
      }
    }

    async navigateToPaymentPage(accountNumber) {
      if (this.shouldAbort()) return;
      this.addLog(`Waiting for payment page for account ${accountNumber}...`);

      // Wait for navigation to payment page
      await this.waitForUrlChange(/\/payment\//, 30000);
      if (this.shouldAbort()) return;
      await this.humanDelay(3000, 5000); // 3-5 seconds after navigation
    }

    async fillPaymentDetails(accountNumber) {
      if (this.shouldAbort()) return false;
      this.addLog(`Filling payment details for account ${accountNumber}...`);

      // Wait for payment form to load
      await this.waitForElement('#cc_number, input[name*="card"]', 10000);
      await this.humanDelay(2000, 4000); // 2-4 seconds

      // Fill card number
      const cardField = document.querySelector('#cc_number, input[name*="card"]');
      if (cardField) {
        if (this.shouldAbort()) return false;
        await this.typeWithDelay(cardField, this.settings.cardNumber, 80);
        this.addLog(`Entered card number for account ${accountNumber}`);
        await this.humanDelay(1000, 2000); // 1-2 seconds
      }

      // Fill expiry month
      const monthField = document.querySelector('#m-0, select[name*="month"]');
      if (monthField) {
        if (this.shouldAbort()) return false;
        await this.humanDelay(500, 1200); // 0.5-1.2 seconds
        // Convert "09" to "9" for select field
        const monthValue = parseInt(this.settings.expiryMonth).toString();
        monthField.value = monthValue;
        monthField.dispatchEvent(new Event('change', { bubbles: true }));
        this.addLog(`Selected expiry month ${monthValue} for account ${accountNumber}`);
        await this.humanDelay(800, 1500); // 0.8-1.5 seconds
      }

      // Fill expiry year
      const yearField = document.querySelector('#y-0, select[name*="year"]');
      if (yearField) {
        if (this.shouldAbort()) return false;
        await this.humanDelay(500, 1200); // 0.5-1.2 seconds
        yearField.value = this.settings.expiryYear;
        yearField.dispatchEvent(new Event('change', { bubbles: true }));
        this.addLog(`Selected expiry year for account ${accountNumber}`);
        await this.humanDelay(800, 1500); // 0.8-1.5 seconds
      }

      // Fill CVV
      const cvvField = document.querySelector('#cc_code, input[name*="cvv"]');
      if (cvvField) {
        if (this.shouldAbort()) return false;
        await this.humanDelay(500, 1200); // 0.5-1.2 seconds
        await this.typeWithDelay(cvvField, this.settings.cvv, 100);
        this.addLog(`Entered CVV for account ${accountNumber}`);
        await this.humanDelay(1000, 2000); // 1-2 seconds
      }
    }

    async submitPayment(accountNumber) {
      if (this.shouldAbort()) return;
      this.addLog(`Submitting payment for account ${accountNumber}...`);

      // Wait before submitting (human-like hesitation)
      await this.humanDelay(2000, 4000); // 2-4 seconds
      if (this.shouldAbort()) return;

      const submitButton = document.querySelector('#qfauto-0, input[type="submit"][value*="Pay"], button[type="submit"]');
      if (submitButton) {
        submitButton.click();
        this.addLog(`Clicked submit button for account ${accountNumber}`);
      }
    }

    async waitForConfirmation(accountNumber) {
      this.addLog(`Waiting for confirmation for account ${accountNumber}...`);

      // Wait for success indicators
      const successIndicators = [
        'Thanks for your purchase',
        'Account created successfully',
        'Payment successful',
        'Congratulations'
      ];

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (!this.isRunning) break;

        // Detect payment form errors and stop overall process
        const paymentError = this.detectPaymentError();
        if (paymentError) {
          this.addLog(`❌ Payment error detected: ${paymentError}`, 'error');
          try {
            chrome.runtime.sendMessage({
              action: 'paymentError',
              message: paymentError
            });
          } catch (_) {}

          // Stop automation and clear state
          this.isRunning = false;
          window.apexAutomationRunning = false;
          await this.clearAutomationState();
          return false; // Exit early since we are stopping due to error
        }

        // Check for success text
        const pageText = document.body.textContent.toLowerCase();
        const hasSuccess = successIndicators.some(indicator =>
          pageText.includes(indicator.toLowerCase())
        );

        if (hasSuccess) {
          this.addLog(`✅ Success confirmed for account ${accountNumber}`);
          return true;
        }

        // Check for success URL
        if (window.location.href.includes('/thanks') || window.location.href.includes('/success')) {
          this.addLog(`✅ Success URL detected for account ${accountNumber}`);
          return true;
        }

        this.addLog(`Waiting for confirmation... (attempt ${attempt}/${maxAttempts})`);
        await this.delay(2000);
      }

      this.addLog(`⚠️ Confirmation timeout for account ${accountNumber}, continuing...`);
      return false;
    }

    detectPaymentError() {
      try {
        // Common error container used by the site
        const errorEl = document.querySelector('.am-element.am-error .cimerror, .am-error .cimerror, span.cimerror');
        if (errorEl) {
          const text = errorEl.innerText || errorEl.textContent || '';
          return text.replace(/\s+/g, ' ').trim();
        }
        // Also consider input rows marked as error
        const errorRow = document.querySelector('.am-row .am-element.am-error');
        if (errorRow) {
          const text = errorRow.innerText || errorRow.textContent || '';
          return text.replace(/\s+/g, ' ').trim();
        }
      } catch (_) {}
      return null;
    }

    async waitForElement(selector, timeout = 10000) {
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        if (this.shouldAbort()) throw new Error('Aborted');
        const element = document.querySelector(selector);
        if (element) return element;
        await this.delay(100);
      }

      throw new Error(`Element not found: ${selector}`);
    }

    async waitForUrlChange(pattern, timeout = 20000) {
      const startTime = Date.now();
      const initialUrl = window.location.href;

      while (Date.now() - startTime < timeout) {
        if (this.shouldAbort()) return;
        if (window.location.href !== initialUrl && pattern.test(window.location.href)) {
          return;
        }
        await this.delay(100);
      }

      throw new Error('URL change timeout');
    }

    async waitForNavigation() {
      await this.humanDelay(10000, 12000); // 10-12 seconds for navigation
      if (this.shouldAbort()) return;
    }

    delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    shouldAbort() {
      return !this.isRunning || !window.apexAutomationRunning;
    }

    // Human-like delay with randomization (cancelable)
    async humanDelay(minMs = 1000, maxMs = 3000) {
      const total = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      let elapsed = 0;
      const step = 100;
      while (elapsed < total) {
        if (this.shouldAbort()) return;
        await this.delay(step);
        elapsed += step;
      }
    }

    // Typing delay for form fields
    async typeWithDelay(element, text, delayMs = 100) {
      element.value = '';
      for (let i = 0; i < text.length; i++) {
        if (this.shouldAbort()) return;
        element.value += text[i];
        element.dispatchEvent(new Event('input', { bubbles: true }));
        const extra = Math.random() * 50;
        let waited = 0;
        while (waited < delayMs + extra) {
          if (this.shouldAbort()) return;
          const step = Math.min(50, delayMs + extra - waited);
          await this.delay(step);
          waited += step;
        }
      }
    }

    async checkForContinuation() {
      // Prevent multiple continuations per page instance
      if (this.hasResumedOnce) {
        return;
      }

      // Check if there's a saved automation state
      try {
        const result = await chrome.storage.local.get(['apexAutomationState', 'apexAutomationLock', 'apexAutomationStopRequested']);

        // If a stop was requested previously, honor it and do not continue
        if (result.apexAutomationStopRequested) {
          this.addLog('Stop requested earlier, not continuing');
          await this.clearAutomationState();
          await chrome.storage.local.remove(['apexAutomationStopRequested']);
          return;
        }

        if (result.apexAutomationState && result.apexAutomationState.isRunning) {
          const savedState = result.apexAutomationState;
          const savedTotal = (savedState.settings && savedState.settings.numberOfAccounts) || 0;

          // If saved state indicates we've reached or exceeded total accounts, do not continue
          if (savedTotal > 0 && savedState.completedCount >= savedTotal) {
            this.addLog('All requested accounts already processed, not continuing');
            await this.clearAutomationState();
            return;
          }

          // Check if automation is not already running globally and state is recent
          const timeSinceLastUpdate = Date.now() - savedState.timestamp;

          // Only continue if no other instance is running and state is recent
          if (!window.apexAutomationRunning && !this.isRunning && timeSinceLastUpdate < 30000) {
            // Proceed with continuation even if a lock exists, since previous page likely unloaded
            if (!result.apexAutomationLock) {
              await chrome.storage.local.set({
                apexAutomationLock: {
                  instanceId: instanceId,
                  timestamp: Date.now()
                }
              });
            }

            window.apexAutomationRunning = true;
            this.isRunning = true;
            this.hasResumedOnce = true;

            this.addLog('Found ongoing automation, continuing...');
            this.settings = savedState.settings;

            // Resume at next account after completed ones
            const nextAccount = Math.min(savedTotal, (savedState.completedCount || 0) + 1);
            this.currentAccount = nextAccount;

            // Continue with the next account
            await this.handleAccountFlow(this.currentAccount);
          } else {
            this.addLog('Automation already running or state too old, skipping continuation');
          }
        }
      } catch (error) {
        // No saved state, continue normally
      }
    }

    async saveAutomationState() {
      try {
        await chrome.storage.local.set({
          apexAutomationState: {
            isRunning: this.isRunning,
            settings: this.settings,
            completedCount: this.completedCount,
            nextAccount: Math.min((this.settings && this.settings.numberOfAccounts) || 0, this.completedCount + 1),
            timestamp: Date.now()
          }
        });
      } catch (error) {
        console.log('Error saving automation state:', error);
      }
    }

    async clearAutomationState() {
      try {
        // Clear automation state, lock, and startup lock
        await chrome.storage.local.remove(['apexAutomationState', 'apexAutomationLock', 'apexAutomationStartupLock']);
      } catch (error) {
        console.log('Error clearing automation state:', error);
      }
    }

    sendProgressUpdate(currentAccount, totalAccounts) {
      try {
        chrome.runtime.sendMessage({
          action: 'progressUpdate',
          currentAccount: currentAccount,
          totalAccounts: totalAccounts
        }, (response) => {
          // Handle response or ignore if popup is closed
          if (chrome.runtime.lastError) {
            // Popup is closed or not available, this is normal
          }
        });
      } catch (error) {
        // Popup might not be open, this is normal
      }
    }

    addLog(message, type = 'info') {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] ${message}`);

      // Send log to popup with raw message; popup will add timestamp
      try {
        chrome.runtime.sendMessage({
          action: 'log',
          message: message,
          type: type
        });
      } catch (error) {
        // Popup might not be open
      }
    }

    async handleAccountFlow(accountNumber) {
      if (!this.isRunning || !window.apexAutomationRunning) {
        return;
      }

      // Persist current intent
      this.currentAccount = accountNumber;
      await this.saveAutomationState();

      // Update progress to show current account index
      // Progress updated after completion

      const success = await this.processSingleAccount(accountNumber);

      if (success) {
        this.completedCount += 1;
        // Keep showing progressing index (current account number), not completed count
        // Progress updated after completion
        await this.saveAutomationState();
      }

      // Decide next step
      if (!this.isRunning) {
        return;
      }

      if (this.completedCount >= this.settings.numberOfAccounts) {
        this.addLog('🎉 All accounts processed!');
        this.isRunning = false;
        window.apexAutomationRunning = false;
        await this.clearAutomationState();
        // Final update uses total/total
        this.sendProgressUpdate(this.completedCount, this.settings.numberOfAccounts);
        return;
      }

      // If the last account failed, we still proceed to next attempt
      const nextAccount = this.completedCount + 1;
      this.addLog(`Preparing next account ${nextAccount}/${this.settings.numberOfAccounts}...`);
      // Navigate to signup for next account to trigger a fresh page and continuation
      await this.navigateToSignupPage(nextAccount);
      // After navigation, this instance will unload; the next page will resume via checkForContinuation
    }
  }

  // Initialize automation
  new ApexAutomation();

} // End of duplicate loading check
