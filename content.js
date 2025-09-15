// Content script for APEX Purchaser Chrome Extension
// This script runs directly on APEX pages and handles all automation without backend

// Prevent duplicate script loading
if (window.apexPurchaserLoaded) {
    console.log('APEX Purchaser content script already loaded, skipping...');
} else {
    window.apexPurchaserLoaded = true;
    console.log('APEX Purchaser content script loaded');

    // Global variables for automation
    let isAutomationRunning = false;
    let currentSessionId = null;
    let automationSettings = null;
    let currentAccountIndex = 0;
    let automationLock = false; // Prevent multiple automation instances
    let pageLoadHandled = false; // Prevent duplicate page load handling

    // Listen for messages from the extension
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Content script received message:', message);

        switch (message.action) {
            case 'checkPage':
                handleCheckPage(sendResponse);
                return true;

            case 'getPageInfo':
                handleGetPageInfo(sendResponse);
                return true;

            case 'startAutomation':
                handleStartAutomation(message.data, sendResponse);
                return true;

            case 'stopAutomation':
                handleStopAutomation(sendResponse);
                return true;

            case 'ping':
                sendResponse({ success: true, message: 'Content script is loaded and ready' });
                return true;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    });

    // Check if current page is APEX related
    function handleCheckPage(sendResponse) {
        const isApexPage = window.location.hostname.includes('apex') ||
            window.location.hostname.includes('tradovate') ||
            document.title.toLowerCase().includes('apex') ||
            document.title.toLowerCase().includes('tradovate');

        sendResponse({
            success: true,
            isApexPage: isApexPage,
            url: window.location.href,
            title: document.title
        });
    }

    // Get page information
    function handleGetPageInfo(sendResponse) {
        const pageInfo = {
            url: window.location.href,
            title: document.title,
            hostname: window.location.hostname,
            timestamp: new Date().toISOString()
        };

        sendResponse({
            success: true,
            data: pageInfo
        });
    }

    // Monitor page changes for APEX-related sites
    let lastUrl = window.location.href;
    new MutationObserver(() => {
        const url = window.location.href;
        if (url !== lastUrl) {
            lastUrl = url;

            chrome.runtime.sendMessage({
                action: 'pageChanged',
                url: url,
                title: document.title
            }).catch(error => {
                console.log('Error sending page change message:', error);
            });
        }
    }).observe(document, { subtree: true, childList: true });

    // Handle start automation
    async function handleStartAutomation(data, sendResponse) {
        try {
            console.log('handleStartAutomation called with data:', data);
            addLog('handleStartAutomation called');

            if (isAutomationRunning || automationLock) {
                addLog('Automation already running or locked, rejecting request');
                sendResponse({ success: false, error: 'Automation already running' });
                return;
            }

            automationLock = true;

            // Check if we're on the right page
            const isApex = isApexDashboard();
            addLog(`isApexDashboard() returned: ${isApex}`);
            addLog(`Current URL: ${window.location.href}`);

            if (!isApex) {
                addLog('Not on APEX dashboard, rejecting request');
                sendResponse({ success: false, error: 'Please navigate to APEX dashboard first' });
                return;
            }

            isAutomationRunning = true;
            automationSettings = data;
            currentSessionId = data.sessionId;
            currentAccountIndex = 0;

            addLog('Starting automation on current page...');
            addLog(`Settings: ${JSON.stringify(data)}`);

            // Send immediate response to popup
            sendResponse({ success: true });

            // Start the automation process asynchronously
            addLog('Starting runAutomation()...');
            runAutomation().catch(error => {
                console.error('Automation error:', error);
                addLog(`Automation error: ${error.message}`);
                // Set automation lock to prevent duplicates
                isAutomationRunning = false;
                automationLock = true;
                updateStatus('error', 'Error');
            });

        } catch (error) {
            console.error('Error starting automation:', error);
            addLog(`Error in handleStartAutomation: ${error.message}`);
            isAutomationRunning = false;
            automationLock = false;
            sendResponse({ success: false, error: error.message });
        }
    }

    // Handle stop automation
    function handleStopAutomation(sendResponse) {
        isAutomationRunning = false;
        automationLock = false;
        pageLoadHandled = false;

        // Clear any saved state to prevent continuation
        chrome.storage.local.remove(['apexNextAccount'], () => {
            addLog('🧹 Cleared saved state - automation stopped');
        });

        addLog('Automation stopped by user');
        updateStatus('stopped', 'Stopped');
        sendResponse({ success: true });
    }

    // Check if we're on APEX dashboard or signup page
    function isApexDashboard() {
        const hostname = window.location.hostname;
        const pathname = window.location.pathname;
        const isApex = hostname.includes('apextraderfunding.com') &&
            (pathname.includes('/member') || pathname.includes('/signup'));

        console.log('isApexDashboard check:', {
            hostname: hostname,
            pathname: pathname,
            isApex: isApex
        });

        return isApex;
    }

    // Main automation function - handles complete account creation process
    async function runAutomation() {
        try {
            // Prevent duplicate execution
            if (window.apexAutomationRunning) {
                addLog('Automation already running, skipping duplicate execution');
                return;
            }
            window.apexAutomationRunning = true;

            updateStatus('processing', 'Processing...');
            addLog(`Starting purchase process for ${automationSettings.numberOfAccounts} accounts`);
            addLog(`Account type: ${automationSettings.selectedAccount}`);

            // Clear any existing state to start fresh
            chrome.storage.local.remove(['apexNextAccount'], () => {
                addLog('🧹 Cleared any existing state - starting fresh');
            });

            // Check if we're on success page - handle next account setup
            if (window.location.href.includes('/thanks')) {
                addLog('Success page detected - handling next account setup');

                // We need to determine which account was just completed
                // Since we're on success page, we should check for continuation state
                const continuationFound = await checkForContinuation();
                if (continuationFound) {
                    addLog('Found continuation state, processing next account');
                    return;
                } else {
                    addLog('No continuation state found, starting fresh with account 1');
                    // Continue with normal flow below
                }
            }

            // Process first account - let waitForConfirmation handle next account setup
            currentAccountIndex = 1;
            addLog(`🔄 Processing account 1/${automationSettings.numberOfAccounts}`);

            try {
                // Process current account (whether on dashboard, signup, or payment page)
                await processSingleAccount(1);
                addLog(`✅ Account 1 processed successfully - waiting for success page to continue...`);

            } catch (error) {
                addLog(`❌ Error processing account 1: ${error.message}`);
                updateStatus('error', `Account 1 failed: ${error.message}`);

                isAutomationRunning = false;
                automationLock = false;
            }

            // Note: Success page logic in waitForConfirmation will handle completion

        } catch (error) {
            console.error('Automation error:', error);
            addLog(`Automation error: ${error.message}`);
            updateStatus('error', 'Error');
        } finally {
            isAutomationRunning = false;
            automationLock = false;
            window.apexAutomationRunning = false;
        }
    }

    // Process account on current page (assumes we're on signup page)
    async function processAccountOnCurrentPage(accountNumber) {
        try {
            addLog(`Processing account ${accountNumber} on current page...`);

            const currentUrl = window.location.href;
            addLog(`Current URL: ${currentUrl}`);

            // Check if we're on signup page
            if (currentUrl.includes('/signup/')) {
                addLog(`On signup page, filling form and proceeding...`);
                await fillInitialForm(accountNumber);
                await navigateToPaymentPage(accountNumber);
                await fillPaymentDetails(accountNumber);
                await submitPayment(accountNumber);
                await waitForConfirmation(accountNumber);
            }
            // Check if we're already on payment page
            else if (currentUrl.includes('/payment/') || currentUrl.includes('/authorize-cim')) {
                addLog(`Already on payment page, proceeding with payment...`);
                await fillPaymentDetails(accountNumber);
                await submitPayment(accountNumber);
                await waitForConfirmation(accountNumber);
            }
            else {
                throw new Error(`Unexpected page for account processing: ${currentUrl}`);
            }

        } catch (error) {
            console.error('Process account on current page error:', error);
            throw error;
        }
    }

    // Process a single account - complete workflow
    async function processSingleAccount(accountNumber) {
        try {
            addLog(`Starting account ${accountNumber} creation process...`);

            const currentUrl = window.location.href;

            // Check if we're already on payment page
            if (currentUrl.includes('/payment/') || currentUrl.includes('/authorize-cim')) {
                addLog(`Already on payment page, skipping to payment details...`);
                await fillPaymentDetails(accountNumber);
                await submitPayment(accountNumber);
                await waitForConfirmation(accountNumber);
            }
            // Check if we're on signup page
            else if (currentUrl.includes('/signup/')) {
                addLog(`On signup page, filling form and proceeding...`);
                await fillInitialForm(accountNumber);
                await navigateToPaymentPage(accountNumber);
                await fillPaymentDetails(accountNumber);
                await submitPayment(accountNumber);
                await waitForConfirmation(accountNumber);
            }
            // Start from dashboard
            else {
                addLog(`Starting from dashboard, navigating to signup...`);
                await navigateToSignupPage(accountNumber);
                await fillInitialForm(accountNumber);
                await navigateToPaymentPage(accountNumber);
                await fillPaymentDetails(accountNumber);
                await submitPayment(accountNumber);
                await waitForConfirmation(accountNumber);
            }

            addLog(`Account ${accountNumber} creation completed successfully`);

        } catch (error) {
            addLog(`Error in account ${accountNumber} processing: ${error.message}`);
            throw error;
        }
    }

    // Navigate to signup page
    async function navigateToSignupPage(accountNumber) {
        const accountUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
        const currentUrl = window.location.href;

        if (currentUrl.includes('/signup/') && currentUrl.includes(automationSettings.selectedAccount)) {
            addLog(`Already on correct signup page: ${currentUrl}`);
            return;
        }

        addLog(`Navigating to signup page for account ${accountNumber}...`);
        addLog(`Target URL: ${accountUrl}`);
        addLog(`Current URL: ${currentUrl}`);

        try {
            window.location.assign(accountUrl);
            addLog('Navigation initiated');
        } catch (error) {
            addLog(`Navigation error: ${error.message}`);
            window.location.href = accountUrl;
        }

        // Wait for navigation to complete
        await waitForNavigationComplete();

        // Additional wait for page to fully load
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Fill initial form (coupon code and terms agreement)
    async function fillInitialForm(accountNumber) {
        addLog(`Filling initial form for account ${accountNumber}...`);

        // Wait for page to be fully loaded
        await waitForPageLoad();
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if we're on the signup page
        if (!window.location.href.includes('/signup/')) {
            throw new Error('Not on signup page after navigation');
        }

        addLog('On signup page, waiting for form elements...');

        // Wait for key elements to be present
        await waitForElement('input[type="text"], input[type="checkbox"], input[type="submit"]', 15000);

        // Fill coupon code
        await fillCouponCode(accountNumber);

        // Agree to terms
        await agreeToTerms(accountNumber);

        // Click next/continue button
        await clickNextButton(accountNumber);
    }

    // Fill coupon code
    async function fillCouponCode(accountNumber) {
        const couponCode = window.APEX_CONFIG ? window.APEX_CONFIG.COUPON_CODE : 'JAYPELLE';

        const couponSelectors = [
            'input[placeholder*="coupon"]',
            'input[name*="coupon"]',
            '#coupon-0',
            'input[type="text"][placeholder*="Coupon"]'
        ];

        let couponField = null;
        for (const selector of couponSelectors) {
            couponField = document.querySelector(selector);
            if (couponField) {
                addLog(`Found coupon field with selector: ${selector}`);
                break;
            }
        }

        if (couponField) {
            couponField.value = couponCode;
            couponField.dispatchEvent(new Event('input', { bubbles: true }));
            addLog(`Entered coupon code '${couponCode}' for account ${accountNumber}`);
        } else {
            addLog('Coupon field not found, trying alternative approach...');

            // Look for "I agree not to use a coupon code" checkbox
            const noCouponCheckbox = document.querySelector('input[type="checkbox"]');
            if (noCouponCheckbox && noCouponCheckbox.nextElementSibling &&
                noCouponCheckbox.nextElementSibling.textContent.includes('coupon')) {
                noCouponCheckbox.click();
                addLog(`Checked "no coupon code" option for account ${accountNumber}`);
            }
        }
    }

    // Agree to terms
    async function agreeToTerms(accountNumber) {
        const termsSelectors = [
            'input[type="checkbox"][id*="agree"]',
            'input[type="checkbox"][name*="agree"]',
            '#_i_agree-page-0-0-0',
            'input[type="checkbox"]'
        ];

        let termsCheckbox = null;
        for (const selector of termsSelectors) {
            const checkboxes = document.querySelectorAll(selector);
            for (const checkbox of checkboxes) {
                if (checkbox.nextElementSibling &&
                    checkbox.nextElementSibling.textContent.toLowerCase().includes('agree')) {
                    termsCheckbox = checkbox;
                    addLog(`Found terms checkbox with selector: ${selector}`);
                    break;
                }
            }
            if (termsCheckbox) break;
        }

        if (termsCheckbox && !termsCheckbox.checked) {
            termsCheckbox.click();
            addLog(`Agreed to terms for account ${accountNumber}`);
        }
    }

    // Click next/continue button
    async function clickNextButton(accountNumber) {
        const nextButtonSelectors = [
            'input[type="submit"][value*="Next"]',
            'input[type="submit"][value*="Continue"]',
            'button[type="submit"]',
            '#_qf_page-0_next-0',
            'input[type="submit"]'
        ];

        let nextButton = null;
        for (const selector of nextButtonSelectors) {
            nextButton = document.querySelector(selector);
            if (nextButton) {
                addLog(`Found next button with selector: ${selector}`);
                break;
            }
        }

        if (nextButton) {
            nextButton.click();
            addLog(`Clicked next/continue button for account ${accountNumber}`);

            // Wait for navigation to payment page
            addLog('Waiting for navigation to payment page...');
            await waitForPaymentPageNavigation();
        } else {
            addLog('Next button not found, checking if already on payment page...');
        }
    }

    // Wait for payment page navigation
    async function waitForPaymentPageNavigation() {
        return new Promise((resolve) => {
            addLog('Waiting for payment page navigation...');

            let attempts = 0;
            const maxAttempts = 30; // 15 seconds total

            const checkForPaymentPage = () => {
                attempts++;
                const currentUrl = window.location.href;
                addLog(`Checking for payment page (attempt ${attempts}/${maxAttempts}): ${currentUrl}`);

                // Check if we're on payment page
                if (currentUrl.includes('/payment/') ||
                    currentUrl.includes('/authorize-cim') ||
                    document.querySelector('#cc_number') ||
                    document.querySelector('#qfauto-0')) {
                    addLog('Payment page detected, proceeding...');
                    resolve();
                    return;
                }

                if (attempts >= maxAttempts) {
                    addLog('Payment page navigation timeout, proceeding anyway...');
                    resolve();
                    return;
                }

                setTimeout(checkForPaymentPage, 500);
            };

            // Start checking immediately
            checkForPaymentPage();
        });
    }

    // Navigate to payment page
    async function navigateToPaymentPage(accountNumber) {
        addLog(`Waiting for payment page for account ${accountNumber}...`);

        // Wait for payment form to appear
        await waitForPaymentForm();
    }

    // Wait for payment form to appear
    async function waitForPaymentForm() {
        const paymentSelectors = [
            'input[name*="cc_number"]',
            'input[name*="card"]',
            '#cc_number',
            'input[placeholder*="card"]'
        ];

        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
            for (const selector of paymentSelectors) {
                const field = document.querySelector(selector);
                if (field) {
                    addLog('Payment form found, proceeding with payment details...');
                    return;
                }
            }

            attempts++;
            addLog(`Waiting for payment form... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        throw new Error('Payment form not found after waiting');
    }

    // Fill payment details
    async function fillPaymentDetails(accountNumber) {
        addLog(`Filling payment details for account ${accountNumber}...`);
        addLog(`Current URL: ${window.location.href}`);
        addLog(`Settings available: ${automationSettings ? 'Yes' : 'No'}`);

        if (automationSettings) {
            addLog(`Card number: ${automationSettings.cardNumber}`);
            addLog(`Expiry month: ${automationSettings.expiryMonth}`);
            addLog(`Expiry year: ${automationSettings.expiryYear}`);
            addLog(`CVV: ${automationSettings.cvv} (length: ${automationSettings.cvv.toString().length})`);
        }

        // Card number field
        const cardSelectors = [
            '#cc_number',
            'input[name*="cc_number"]',
            'input[name*="card"]',
            'input[placeholder*="card"]',
            'input[placeholder*="Credit Card Number"]',
            'input[type="text"][placeholder*="Credit Card"]'
        ];

        let cardField = null;
        for (const selector of cardSelectors) {
            cardField = document.querySelector(selector);
            if (cardField) {
                addLog(`Found card field with selector: ${selector}`);
                break;
            }
        }

        if (cardField) {
            cardField.value = automationSettings.cardNumber;
            cardField.dispatchEvent(new Event('input', { bubbles: true }));
            addLog(`Entered card number for account ${accountNumber}`);
        } else {
            throw new Error('Card number field not found');
        }

        // Expiry month
        const monthSelectors = [
            '#m-0',
            'input[name="m-0"]',
            'input[name*="month"]',
            'input[name*="m-"]',
            'input[name*="expiry"]',
            'input[placeholder*="Month"]',
            'input[type="text"][placeholder*="Month"]',
            'select[name*="month"]',
            'select[name*="m-"]',
            'select[name*="expiry"]'
        ];

        addLog(`Looking for month field with selectors: ${monthSelectors.join(', ')}`);

        let monthSelect = null;
        for (const selector of monthSelectors) {
            monthSelect = document.querySelector(selector);
            if (monthSelect) {
                addLog(`Found month select with selector: ${selector}`);
                addLog(`Month field type: ${monthSelect.tagName}, value: ${monthSelect.value}`);
                break;
            } else {
                addLog(`Month selector '${selector}' not found`);
            }
        }

        if (monthSelect) {
            if (monthSelect.tagName === 'SELECT') {
                // Log available options for debugging
                const options = Array.from(monthSelect.options).map(opt => `"${opt.value}" (${opt.text})`);
                addLog(`Month select options: ${options.join(', ')}`);

                // Try different month formats - remove leading zero
                const monthValue = automationSettings.expiryMonth.replace(/^0+/, '') || automationSettings.expiryMonth;
                const monthFormats = [
                    monthValue, // "3" (no leading zero)
                    monthValue.padStart(2, '0'), // "03" (with leading zero)
                    automationSettings.expiryMonth, // Original value "08"
                    automationSettings.expiryMonth.replace(/^0+/, '') // "8" (remove leading zero)
                ];

                let monthSet = false;
                for (const format of monthFormats) {
                    if (monthSelect.querySelector(`option[value="${format}"]`)) {
                        monthSelect.value = format;
                        monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        addLog(`Selected expiry month ${format} for account ${accountNumber}`);
                        monthSet = true;
                        break;
                    }
                }

                if (!monthSet) {
                    // Try to find option by text content
                    for (const format of monthFormats) {
                        const option = Array.from(monthSelect.options).find(opt =>
                            opt.text.trim() === format || opt.value === format
                        );
                        if (option) {
                            monthSelect.value = option.value;
                            monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            addLog(`Selected expiry month ${option.value} (${option.text}) for account ${accountNumber}`);
                            monthSet = true;
                            break;
                        }
                    }
                }

                if (!monthSet) {
                    addLog(`Warning: Could not set month value. Available options: ${options.join(', ')}`);
                } else {
                    // Verify the month was set correctly
                    addLog(`Month field verification: current value = "${monthSelect.value}", selected option text = "${monthSelect.selectedOptions[0]?.text || 'N/A'}"`);
                }
            } else {
                monthSelect.value = automationSettings.expiryMonth;
                monthSelect.dispatchEvent(new Event('input', { bubbles: true }));
                addLog(`Entered expiry month ${automationSettings.expiryMonth} for account ${accountNumber}`);
            }
        } else {
            // Try to find month field by looking for input fields near the year field
            addLog('Month field not found with standard selectors, trying alternative approach...');
            const allInputs = document.querySelectorAll('input[type="text"], input[type="number"], select');
            let foundMonth = false;

            for (let input of allInputs) {
                const placeholder = input.placeholder ? input.placeholder.toLowerCase() : '';
                const name = input.name ? input.name.toLowerCase() : '';
                const id = input.id ? input.id.toLowerCase() : '';

                if (placeholder.includes('month') || name.includes('month') || name.includes('m-') || id.includes('m-')) {
                    addLog(`Found potential month field: ${input.tagName} with placeholder="${input.placeholder}", name="${input.name}", id="${input.id}"`);

                    if (input.tagName === 'SELECT') {
                        input.value = automationSettings.expiryMonth;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        addLog(`Selected expiry month ${automationSettings.expiryMonth} for account ${accountNumber}`);
                    } else {
                        input.value = automationSettings.expiryMonth;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        addLog(`Entered expiry month ${automationSettings.expiryMonth} for account ${accountNumber}`);
                    }
                    foundMonth = true;
                    break;
                }
            }

            if (!foundMonth) {
                throw new Error('Month field not found with any method');
            }
        }

        // Expiry year
        const yearSelectors = [
            '#y-0',
            'select[name*="year"]',
            'select[name*="y-"]',
            'select[name*="expiry"]',
            'input[name*="year"]',
            'input[placeholder*="Year"]',
            'input[type="text"][placeholder*="Year"]'
        ];

        let yearSelect = null;
        for (const selector of yearSelectors) {
            yearSelect = document.querySelector(selector);
            if (yearSelect) {
                addLog(`Found year select with selector: ${selector}`);
                break;
            }
        }

        if (yearSelect) {
            if (yearSelect.tagName === 'SELECT') {
                yearSelect.value = automationSettings.expiryYear;
                yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
                addLog(`Selected expiry year ${automationSettings.expiryYear} for account ${accountNumber}`);
            } else {
                yearSelect.value = automationSettings.expiryYear;
                yearSelect.dispatchEvent(new Event('input', { bubbles: true }));
                addLog(`Entered expiry year ${automationSettings.expiryYear} for account ${accountNumber}`);
            }
        } else {
            throw new Error('Year field not found');
        }

        // CVV field
        const cvvSelectors = [
            '#cc_code',
            'input[name="cc_code"]',
            'input[name*="cc_code"]',
            'input[name*="cvv"]',
            'input[name*="CVV"]',
            'input[placeholder*="cvv"]',
            'input[placeholder*="CVV"]',
            'input[placeholder*="Credit Card Code"]',
            'input[placeholder*="Security Code"]',
            'input[placeholder*="CVC"]',
            'input[type="text"][placeholder*="Code"]',
            'input[type="password"][name*="cvv"]',
            'input[type="password"][name*="code"]',
            'input[autocomplete="cc-csc"]',
            'input[data-stripe="cvc"]'
        ];

        let cvvField = null;
        for (const selector of cvvSelectors) {
            cvvField = document.querySelector(selector);
            if (cvvField) {
                addLog(`Found CVV field with selector: ${selector}`);
                break;
            }
        }

        if (cvvField) {
            // Clear field first
            cvvField.value = '';
            cvvField.focus();

            // Ensure CVV is exactly 3 digits
            const cvvValue = automationSettings.cvv.toString().padStart(3, '0').substring(0, 3);
            addLog(`Using CVV value: ${cvvValue}`);

            // Set the value
            cvvField.value = cvvValue;

            // Trigger multiple events to ensure validation
            cvvField.dispatchEvent(new Event('input', { bubbles: true }));
            cvvField.dispatchEvent(new Event('change', { bubbles: true }));
            cvvField.dispatchEvent(new Event('blur', { bubbles: true }));

            // Verify the value was set
            if (cvvField.value === cvvValue) {
                addLog(`✅ CVV entered successfully: ${cvvValue}`);
            } else {
                addLog(`⚠️ CVV value mismatch - Expected: ${cvvValue}, Actual: ${cvvField.value}`);
            }
        } else {
            throw new Error('CVV field not found');
        }
    }

    // Submit payment
    async function submitPayment(accountNumber) {
        addLog(`Submitting payment for account ${accountNumber}...`);

        const submitSelectors = [
            '#qfauto-0',
            'input[type="submit"][value*="Pay"]',
            'input[type="submit"][value*="Submit"]',
            'button[type="submit"]',
            'input[type="submit"]',
            'button[class*="submit"]',
            'button[class*="pay"]',
            'button[value*="Subscribe And Pay"]',
            'input[value*="Subscribe And Pay"]',
            'button:contains("Subscribe And Pay")',
            'input[type="submit"][value*="Subscribe"]'
        ];

        let submitButton = null;
        for (const selector of submitSelectors) {
            submitButton = document.querySelector(selector);
            if (submitButton) {
                addLog(`Found submit button with selector: ${selector}`);
                break;
            }
        }

        // If not found by selectors, try to find by text content
        if (!submitButton) {
            const allButtons = document.querySelectorAll('button, input[type="submit"]');
            for (const button of allButtons) {
                if (button.textContent && button.textContent.includes('Subscribe And Pay')) {
                    submitButton = button;
                    addLog('Found submit button by text content: Subscribe And Pay');
                    break;
                }
            }
        }

        if (submitButton) {
            submitButton.click();
            addLog(`Clicked submit/pay button for account ${accountNumber}`);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check for payment failure indicators
            const failureSelectors = [
                '.error',
                '.alert-error',
                '.alert-danger',
                '[class*="error"]',
                '[class*="failed"]',
                '[class*="declined"]',
                '.payment-error',
                '.card-error'
            ];

            let paymentFailed = false;
            for (const selector of failureSelectors) {
                const errorElement = document.querySelector(selector);
                if (errorElement && errorElement.textContent) {
                    const errorText = errorElement.textContent.toLowerCase();
                    if (errorText.includes('error') || errorText.includes('failed') ||
                        errorText.includes('declined') || errorText.includes('invalid')) {
                        addLog(`💳 Payment failure detected: ${errorElement.textContent}`);
                        paymentFailed = true;
                        break;
                    }
                }
            }

            // Check for error messages in the page
            if (!paymentFailed) {
                const pageText = document.body.textContent.toLowerCase();
                if (pageText.includes('payment failed') || pageText.includes('card declined') ||
                    pageText.includes('transaction failed') || pageText.includes('invalid card')) {
                    addLog(`💳 Payment failure detected in page content`);
                    paymentFailed = true;
                }
            }

            if (paymentFailed) {
                throw new Error('Payment failed - card declined or invalid');
            }

        } else {
            throw new Error('Submit button not found');
        }
    }

    // Wait for confirmation
    async function waitForConfirmation(accountNumber) {
        addLog(`Waiting for confirmation for account ${accountNumber}...`);

        // Wait for success indicators
        const successSelectors = [
            '.success',
            '.alert-success',
            '[class*="success"]',
            '[text*="success"]',
            '[text*="completed"]',
            '[text*="thank you"]'
        ];

        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            // Check for success text in page content first
            const pageText = document.body.textContent.toLowerCase();
            if (pageText.includes('thank you for signing up') ||
                pageText.includes('your payment has been successfully processed') ||
                pageText.includes('order reference') ||
                pageText.includes('transaction reference') ||
                pageText.includes('enjoy your membership')) {
                addLog(`✅ Success confirmation found for account ${accountNumber}: Payment processed successfully`);

                // Update currentAccountIndex to the completed account
                currentAccountIndex = accountNumber;

                // If there are more accounts, save state for next account
                if (automationSettings && automationSettings.numberOfAccounts > accountNumber) {
                    const nextAccountNumber = accountNumber + 1;
                    addLog(`🔄 Account ${accountNumber} completed, setting up for account ${nextAccountNumber}...`);

                    const nextAccountState = {
                        currentAccount: nextAccountNumber,
                        numberOfAccounts: automationSettings.numberOfAccounts,
                        selectedAccount: automationSettings.selectedAccount,
                        cardNumber: automationSettings.cardNumber,
                        cvv: automationSettings.cvv,
                        expiryMonth: automationSettings.expiryMonth,
                        expiryYear: automationSettings.expiryYear,
                        timestamp: Date.now()
                    };

                    chrome.storage.local.set({ 'apexNextAccount': nextAccountState }, () => {
                        addLog(`💾 Saved state for account ${nextAccountNumber}`);
                        addLog(`🔄 Navigating to next account...`);

                        // Navigate to signup page for next account
                        const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
                        addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                        window.location.href = nextSignupUrl;
                    });
                } else {
                    addLog(`🎉 All accounts completed! (${accountNumber}/${automationSettings?.numberOfAccounts})`);
                    updateStatus('completed', 'All accounts completed!');

                    // Clear any saved state since we're done
                    chrome.storage.local.remove(['apexNextAccount'], () => {
                        addLog('🧹 Cleared saved state - automation complete');
                    });

                    isAutomationRunning = false;
                    automationLock = false;
                    window.apexAutomationRunning = false;
                }

                return;
            }

            for (const selector of successSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.toLowerCase().includes('success')) {
                    addLog(`✅ Success element found for account ${accountNumber}`);

                    // Handle next account setup (same logic as success text detection)
                    currentAccountIndex = accountNumber;

                    if (automationSettings && automationSettings.numberOfAccounts > accountNumber) {
                        const nextAccountNumber = accountNumber + 1;
                        addLog(`🔄 Account ${accountNumber} completed, setting up for account ${nextAccountNumber}...`);

                        const nextAccountState = {
                            currentAccount: nextAccountNumber,
                            numberOfAccounts: automationSettings.numberOfAccounts,
                            selectedAccount: automationSettings.selectedAccount,
                            cardNumber: automationSettings.cardNumber,
                            cvv: automationSettings.cvv,
                            expiryMonth: automationSettings.expiryMonth,
                            expiryYear: automationSettings.expiryYear,
                            timestamp: Date.now()
                        };

                        chrome.storage.local.set({ 'apexNextAccount': nextAccountState }, () => {
                            addLog(`💾 Saved state for account ${nextAccountNumber}`);
                            addLog(`🔄 Navigating to next account...`);

                            const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
                            addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                            window.location.href = nextSignupUrl;
                        });
                    } else {
                        addLog(`🎉 All accounts completed! (${accountNumber}/${automationSettings?.numberOfAccounts})`);
                        updateStatus('completed', 'All accounts completed!');

                        chrome.storage.local.remove(['apexNextAccount'], () => {
                            addLog('🧹 Cleared saved state - automation complete');
                        });
                    }

                    return;
                }
            }

            // Check URL for success indicators
            if (window.location.href.includes('success') ||
                window.location.href.includes('thank') ||
                window.location.href.includes('complete') ||
                window.location.href.includes('/thanks')) {
                addLog(`✅ Success URL detected for account ${accountNumber}`);

                // Handle next account setup (same logic as success text detection)
                currentAccountIndex = accountNumber;

                if (automationSettings && automationSettings.numberOfAccounts > accountNumber) {
                    const nextAccountNumber = accountNumber + 1;
                    addLog(`🔄 Account ${accountNumber} completed, setting up for account ${nextAccountNumber}...`);

                    const nextAccountState = {
                        currentAccount: nextAccountNumber,
                        numberOfAccounts: automationSettings.numberOfAccounts,
                        selectedAccount: automationSettings.selectedAccount,
                        cardNumber: automationSettings.cardNumber,
                        cvv: automationSettings.cvv,
                        expiryMonth: automationSettings.expiryMonth,
                        expiryYear: automationSettings.expiryYear,
                        timestamp: Date.now()
                    };

                    chrome.storage.local.set({ 'apexNextAccount': nextAccountState }, () => {
                        addLog(`💾 Saved state for account ${nextAccountNumber}`);
                        addLog(`🔄 Navigating to next account...`);

                        const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
                        addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                        window.location.href = nextSignupUrl;
                    });
                } else {
                    addLog(`🎉 All accounts completed! (${accountNumber}/${automationSettings?.numberOfAccounts})`);
                    updateStatus('completed', 'All accounts completed!');

                    chrome.storage.local.remove(['apexNextAccount'], () => {
                        addLog('🧹 Cleared saved state - automation complete');
                    });
                }

                return;
            }

            attempts++;
            addLog(`Waiting for confirmation... (attempt ${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        addLog(`Confirmation timeout for account ${accountNumber}, but continuing...`);

        // Handle next account setup even on timeout
        currentAccountIndex = accountNumber;

        if (automationSettings && automationSettings.numberOfAccounts > accountNumber) {
            const nextAccountNumber = accountNumber + 1;
            addLog(`🔄 Account ${accountNumber} timeout, but setting up for account ${nextAccountNumber}...`);

            const nextAccountState = {
                currentAccount: nextAccountNumber,
                numberOfAccounts: automationSettings.numberOfAccounts,
                selectedAccount: automationSettings.selectedAccount,
                cardNumber: automationSettings.cardNumber,
                cvv: automationSettings.cvv,
                expiryMonth: automationSettings.expiryMonth,
                expiryYear: automationSettings.expiryYear,
                timestamp: Date.now()
            };

            chrome.storage.local.set({ 'apexNextAccount': nextAccountState }, () => {
                addLog(`💾 Saved state for account ${nextAccountNumber} (timeout case)`);
                addLog(`🔄 Navigating to next account...`);

                const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
                addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                window.location.href = nextSignupUrl;
            });
        } else {
            addLog(`🎉 All accounts completed! (${accountNumber}/${automationSettings?.numberOfAccounts}) - timeout case`);
            updateStatus('completed', 'All accounts completed!');

            chrome.storage.local.remove(['apexNextAccount'], () => {
                addLog('🧹 Cleared saved state - automation complete');
            });
        }
    }

    // Wait for page to load
    function waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    }

    // Wait for navigation to complete
    function waitForNavigationComplete() {
        return new Promise((resolve) => {
            addLog('Waiting for navigation to complete...');

            // Check if we're already on the target page
            if (window.location.href.includes('/signup/')) {
                addLog('Already on signup page: ' + window.location.href);
                resolve();
                return;
            }

            addLog('Current URL: ' + window.location.href);

            // Wait for URL to change to signup page
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds total

            const checkUrl = () => {
                attempts++;
                const currentUrl = window.location.href;
                addLog(`Checking URL (attempt ${attempts}/${maxAttempts}): ${currentUrl}`);

                if (currentUrl.includes('/signup/')) {
                    addLog('Navigation completed, now on signup page');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    addLog('Navigation timeout, proceeding anyway');
                    addLog('This might be due to popup blockers or page restrictions');
                    resolve();
                } else {
                    setTimeout(checkUrl, 500);
                }
            };

            // Start checking immediately
            checkUrl();
        });
    }

    // Wait for element to be available
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    // Add log message
    async function addLog(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);

        // Send log to popup via background script
        chrome.runtime.sendMessage({
            action: 'addLog',
            message: logMessage
        }).catch(error => {
            console.log('Error sending log:', error);
        });

        // Also save to storage for persistent state
        try {
            const result = await chrome.storage.local.get(['popupState']);
            const currentState = result.popupState || { logs: [] };
            currentState.logs = currentState.logs || [];
            currentState.logs.push(logMessage);

            // Keep only last 100 logs to prevent storage bloat
            if (currentState.logs.length > 100) {
                currentState.logs = currentState.logs.slice(-100);
            }

            // Update automation status in state
            currentState.isAutomationRunning = isAutomationRunning;
            currentState.sessionId = currentSessionId;

            await chrome.storage.local.set({ popupState: currentState });
        } catch (error) {
            // Storage might not be available, that's okay
        }
    }

    // Update automation status
    async function updateStatus(status, message) {
        chrome.runtime.sendMessage({
            action: 'updateStatus',
            status: status,
            message: message
        }).catch(error => {
            console.log('Error sending status update:', error);
        });

        // Also save to storage for persistent state
        try {
            const result = await chrome.storage.local.get(['popupState']);
            const currentState = result.popupState || { logs: [] };
            currentState.status = status;
            currentState.statusText = message;
            currentState.isAutomationRunning = isAutomationRunning;
            currentState.sessionId = currentSessionId;

            await chrome.storage.local.set({ popupState: currentState });
        } catch (error) {
            // Storage might not be available, that's okay
        }
    }

    // Add visual indicator if on APEX page
    function addApexIndicator() {
        // Check if we're on an APEX-related page
        const isApexPage = window.location.hostname.includes('apex') ||
            window.location.hostname.includes('tradovate') ||
            document.title.toLowerCase().includes('apex') ||
            document.title.toLowerCase().includes('tradovate');

        if (isApexPage) {
            // Add a small indicator that the extension is active
            const indicator = document.createElement('div');
            indicator.id = 'apex-purchaser-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #4CAF50;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                z-index: 10000;
                font-family: Arial, sans-serif;
            `;
            indicator.textContent = 'APEX Purchaser Active';
            document.body.appendChild(indicator);

            // Remove indicator after 3 seconds
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 3000);
        }
    }

    // Check for next account to process
    async function checkForContinuation() {
        try {
            // Prevent multiple continuation checks
            if (isAutomationRunning || automationLock) {
                addLog('Automation already running, skipping continuation check');
                return false;
            }

            return new Promise((resolve) => {
                chrome.storage.local.get(['apexNextAccount'], async (result) => {
                    addLog(`Debug: checkForContinuation - result = ${JSON.stringify(result)}`);

                    if (result.apexNextAccount) {
                        const state = result.apexNextAccount;
                        const timeSinceLastUpdate = Date.now() - state.timestamp;

                        addLog(`Debug: Found saved state - currentAccount: ${state.currentAccount}, numberOfAccounts: ${state.numberOfAccounts}, timeSinceLastUpdate: ${timeSinceLastUpdate}ms`);

                        // Only continue if it's been less than 2 minutes and we haven't exceeded total accounts
                        if (timeSinceLastUpdate < 120000 && state.currentAccount <= state.numberOfAccounts) {
                            addLog(`🔄 Found next account to process: ${state.currentAccount}/${state.numberOfAccounts}`);

                            // Set automation lock to prevent duplicates
                            automationLock = true;

                            // Set up automation settings
                            automationSettings = {
                                cardNumber: state.cardNumber,
                                cvv: state.cvv,
                                expiryMonth: state.expiryMonth,
                                expiryYear: state.expiryYear,
                                numberOfAccounts: state.numberOfAccounts,
                                selectedAccount: state.selectedAccount,
                                sessionId: `account-${state.currentAccount}-${Date.now()}`
                            };

                            currentAccountIndex = state.currentAccount;
                            // Set automation lock to prevent duplicates
                            automationLock = true;
                            isAutomationRunning = true;

                            // If we're on success page, navigate to next signup page
                            if (window.location.href.includes('/thanks')) {
                                addLog(`🎉 Success page detected, navigating to next account...`);
                                const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${state.selectedAccount}`;
                                addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                                window.location.href = nextSignupUrl;
                                resolve(true);
                            } else {
                                // Process this account on current page
                                addLog(`🔄 Processing account ${state.currentAccount} on current page...`);
                                try {
                                    await processNextAccount(state.currentAccount, state.numberOfAccounts);
                                } catch (error) {
                                    console.error('Error processing next account:', error);
                                    addLog(`Error processing next account: ${error.message}`);
                                }
                                resolve(true);
                            }
                        } else {
                            addLog(`Debug: State too old or invalid - clearing state`);
                            // Clear old state
                            chrome.storage.local.remove(['apexNextAccount']);
                            resolve(false);
                        }
                    } else {
                        addLog(`Debug: No saved state found`);
                        resolve(false);
                    }
                });
            });
        } catch (error) {
            console.error('Next account check error:', error);
            isAutomationRunning = false;
            automationLock = false;
            return false;
        }
    }

    // Process the next account
    async function processNextAccount(accountNumber, numberOfAccounts) {
        try {
            addLog(`🔄 Processing account ${accountNumber}/${numberOfAccounts}`);
            updateStatus('processing', `Processing account ${accountNumber}/${numberOfAccounts}`);

            // Update currentAccountIndex to match the account being processed
            currentAccountIndex = accountNumber;

            // Process the account - waitForConfirmation will handle next account setup
            await processSingleAccount(accountNumber);
            addLog(`✅ Account ${accountNumber} processed successfully - waiting for success page to continue...`);

        } catch (error) {
            addLog(`❌ Error processing account ${accountNumber}: ${error.message}`);

            // Try to continue with next account despite error
            if (accountNumber < numberOfAccounts) {
                addLog(`🔄 Continuing with next account despite error...`);

                // Set up next account despite error
                const nextAccountNumber = accountNumber + 1;
                addLog(`🔄 Setting up for account ${nextAccountNumber} despite error...`);

                const nextAccountState = {
                    currentAccount: nextAccountNumber,
                    numberOfAccounts: numberOfAccounts,
                    selectedAccount: automationSettings.selectedAccount,
                    cardNumber: automationSettings.cardNumber,
                    cvv: automationSettings.cvv,
                    expiryMonth: automationSettings.expiryMonth,
                    expiryYear: automationSettings.expiryYear,
                    timestamp: Date.now()
                };

                chrome.storage.local.set({ 'apexNextAccount': nextAccountState }, () => {
                    addLog(`💾 Saved state for account ${nextAccountNumber} (error case)`);
                    addLog(`🔄 Navigating to next account...`);

                    const nextSignupUrl = `https://dashboard.apextraderfunding.com/signup/${automationSettings.selectedAccount}`;
                    addLog(`🔄 Navigating to: ${nextSignupUrl}`);
                    window.location.href = nextSignupUrl;
                });
            } else {
                addLog(`🎉 All accounts processed (with errors)`);
                updateStatus('error', 'Completed with errors');
                isAutomationRunning = false;
                automationLock = false;
            }
        }
    }


    // Auto-start automation if on signup page and settings are available
    async function checkAndStartAutomation() {
        try {
            // Prevent duplicate auto-start
            if (window.apexAutoStartChecked || pageLoadHandled) {
                addLog('Auto-start already checked or page load already handled, skipping');
                return;
            }
            window.apexAutoStartChecked = true;
            pageLoadHandled = true;

            // Prevent multiple automation instances
            if (isAutomationRunning || window.apexAutomationRunning || automationLock) {
                addLog('Automation already running or locked, skipping auto-start');
                return;
            }

            // Check if we're on a signup page, payment page, or success page
            if (window.location.href.includes('/signup/') ||
                window.location.href.includes('/payment/') ||
                window.location.href.includes('/authorize-cim') ||
                window.location.href.includes('/thanks')) {
                addLog('Detected signup, payment, or success page, checking for saved settings...');

                // Get settings from storage
                const result = await chrome.storage.sync.get(['settings']);
                const settings = result.settings;

                if (settings && settings.cardNumber && settings.cvv) {
                    addLog('Found saved settings, starting automation automatically...');

                    // Set automation lock to prevent duplicates
                    automationLock = true;
                    isAutomationRunning = true;
                    automationSettings = settings;
                    currentSessionId = 'auto-' + Date.now();
                    currentAccountIndex = 0;

                    addLog('Auto-starting automation...');
                    addLog(`Settings: ${JSON.stringify(settings)}`);

                    // Start the automation process
                    runAutomation().catch(error => {
                        console.error('Auto-automation error:', error);
                        addLog(`Auto-automation error: ${error.message}`);
                        isAutomationRunning = false;
                        automationLock = false;
                        updateStatus('error', 'Error');
                    });
                } else {
                    addLog('No saved settings found, please configure settings first');
                    addLog('Click the extension icon and go to Extension Options');
                }
            }
        } catch (error) {
            console.error('Error in checkAndStartAutomation:', error);
            addLog(`Error checking for auto-start: ${error.message}`);
            isAutomationRunning = false;
            automationLock = false;
        }
    }

    // Run when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!pageLoadHandled) {
                addApexIndicator();
                // Wait a bit for page to fully load, then check for continuation first
                setTimeout(async () => {
                    if (pageLoadHandled) {
                        addLog('Page load already handled, skipping');
                        return;
                    }

                    addLog(`🔍 Debug: Page loaded, checking for continuation...`);
                    const continuationFound = await checkForContinuation();
                    addLog(`🔍 Debug: Continuation found: ${continuationFound}`);

                    // Only check auto-start if no continuation was found and no automation running
                    if (!continuationFound && !isAutomationRunning && !automationLock) {
                        addLog(`🔍 Debug: No continuation found, checking auto-start...`);
                        checkAndStartAutomation();
                    } else {
                        addLog(`🔍 Debug: Skipping auto-start - continuation: ${continuationFound}, running: ${isAutomationRunning}, locked: ${automationLock}`);
                    }
                }, 2000);
            }
        });
    } else {
        if (!pageLoadHandled) {
            addApexIndicator();
            // Wait a bit for page to fully load, then check for continuation first
            setTimeout(async () => {
                if (pageLoadHandled) {
                    addLog('Page load already handled, skipping');
                    return;
                }

                addLog(`🔍 Debug: Page loaded, checking for continuation...`);
                const continuationFound = await checkForContinuation();
                addLog(`🔍 Debug: Continuation found: ${continuationFound}`);

                // Only check auto-start if no continuation was found and no automation running
                if (!continuationFound && !isAutomationRunning && !automationLock) {
                    addLog(`🔍 Debug: No continuation found, checking auto-start...`);
                    checkAndStartAutomation();
                } else {
                    addLog(`🔍 Debug: Skipping auto-start - continuation: ${continuationFound}, running: ${isAutomationRunning}, locked: ${automationLock}`);
                }
            }, 2000);
        }
    }
}