// Configuration file for APEX Purchaser Chrome Extension
// This file contains all the configuration constants

const CONFIG = {
    // Mandatory coupon code for APEX accounts
    COUPON_CODE: 'SAVENOW',
    
    // Extension version
    VERSION: '2.0.0',
    
    // Default settings
    DEFAULT_SETTINGS: {
        cardNumber: '',
        expiryMonth: '03',
        expiryYear: new Date().getFullYear() + 5,
        cvv: '',
        numberOfAccounts: 1,
        selectedAccount: '300k-Tradovate'
    },
    
    // APEX URLs
    APEX_URLS: {
        DASHBOARD: 'https://dashboard.apextraderfunding.com/member',
        SIGNUP_BASE: 'https://dashboard.apextraderfunding.com/signup/'
    },
    
    // Timeouts and delays (in milliseconds)
    TIMEOUTS: {
        ELEMENT_WAIT: 10000,
        NAVIGATION_WAIT: 20000,
        PAGE_LOAD_WAIT: 3000,
        FORM_SUBMIT_WAIT: 5000
    }
};

// Make config available globally
if (typeof window !== 'undefined') {
    window.APEX_CONFIG = CONFIG;
}

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
