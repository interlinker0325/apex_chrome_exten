# APEX Purchaser - Simple Version

A clean, simple Chrome extension for automating APEX account creation.

## Features

- ✅ Simple HTML/CSS/JS implementation
- ✅ Clean, modern UI
- ✅ Multiple account support
- ✅ Automatic form filling
- ✅ Payment processing
- ✅ Success detection
- ✅ Real-time logging

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder
5. The extension will appear in your Chrome toolbar

## Usage

1. Navigate to the APEX dashboard: `https://dashboard.apextraderfunding.com/member`
2. Click the APEX Purchaser extension icon
3. Fill in your payment details
4. Select account type and number of accounts
5. Click "Start Automation"
6. The extension will automatically create the specified number of accounts

## Files

- `popup.html` - Main extension interface
- `popup.css` - Styling
- `popup.js` - Popup functionality
- `content.js` - Automation logic
- `background.js` - Background service worker
- `manifest.json` - Extension configuration
- `options.html` - Settings page

## Settings

Click the "Settings" button to configure default values for:
- Card number
- Expiry date
- CVV
- Account type
- Number of accounts

## Troubleshooting

- Make sure you're on the APEX dashboard before starting
- Check that all payment details are correct
- Ensure you have a stable internet connection
- Check the activity log for any error messages

## Support

This is a simplified version focused on core functionality. All complex features have been removed for stability.
