# APEX Purchaser Chrome Extension

A Chrome extension for automated APEX account purchasing that works entirely in your browser - no backend server required!

## Features

- **100% Browser-Based**: All automation happens directly in your browser - no server needed
- **Secure & Private**: User credentials stay in your browser, never shared with any server
- **Easy Configuration**: Simple options page for setting up payment details and account preferences
- **Real-time Monitoring**: Live status updates and activity logs
- **One-Click Operation**: Start the purchasing process with a single click from the extension popup
- **Offline Capable**: Works without internet connection to external servers

## Installation

### Development Installation

1. **Load the Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the `APEX_frontend` folder
   - The extension should now appear in your extensions list

2. **Configure Settings**:
   - Click on the extension icon in the toolbar
   - Click "EXTENSION OPTIONS" to open the settings page
   - Fill in your payment details and account preferences
   - Click "Save Settings"

3. **Start Using**:
   - Click the extension icon
   - Click "START SCRAPING" to begin the automated process
   - Monitor progress through the real-time logs

## File Structure

```
APEX_frontend/
├── manifest.json          # Extension manifest
├── popup.html             # Extension popup interface
├── popup.js               # Popup functionality
├── popup.css              # Popup styling
├── options.html           # Settings page
├── options.js             # Settings functionality
├── options.css            # Settings styling
├── background.js          # Background service worker
├── content.js             # Content script
└── icons/                 # Extension icons (placeholder)
```

## How It Works

1. **User Configuration**: Users configure their settings through the options page
2. **Secure Storage**: All sensitive data is stored locally using Chrome's storage API
3. **Direct Automation**: The content script runs directly on APEX pages to fill forms and process payments
4. **Real-time Updates**: The popup displays live status updates and logs
5. **No Server Required**: Everything happens in your browser - no backend needed!

## Security Features

- **100% Local**: All processing happens in your browser
- **No Data Transmission**: Sensitive data never leaves your browser
- **No Server Dependencies**: No external servers to trust or maintain
- **Permission Management**: Minimal required permissions for security

## Architecture

The extension consists of three main components:
- **Popup**: User interface for starting automation and viewing status
- **Content Script**: Runs on APEX pages to perform automation
- **Background Script**: Handles communication between popup and content script

## Troubleshooting

### Extension Not Loading
- Ensure all files are in the correct directory
- Check that `manifest.json` is valid JSON
- Verify Chrome Developer mode is enabled

### Settings Not Saving
- Check browser permissions for storage
- Ensure all required fields are filled
- Try refreshing the options page

### Automation Issues
- Ensure you're on the correct APEX page (dashboard.apextraderfunding.com/member)
- Check that all form fields are being filled correctly
- Review browser console for error messages
- Try refreshing the page and running again

## Development

### Making Changes
1. Edit the relevant files (HTML, CSS, JS)
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension
4. Test your changes

### Debugging
- Use Chrome DevTools on the popup and options pages
- Check the background script in the Extensions page
- Review console logs for errors

## Permissions

The extension requires minimal permissions:
- `storage` - For saving user settings
- `activeTab` - For interacting with web pages
- `scripting` - For content script injection
- `host_permissions` - For API communication

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify all settings are correctly configured
3. Ensure you're on the correct APEX page
4. Review the activity logs for detailed information

## Version History

- **v2.0.0** - Extension-only version (no backend required)
  - Complete automation runs directly in browser
  - No server dependencies
  - Enhanced form filling and payment processing
  - Improved error handling and retry logic
  - Real-time status monitoring
  - Secure local storage

- **v1.0.0** - Initial release with backend integration
  - Extension popup with start/options buttons
  - Settings page for configuration
  - Backend API integration
  - Real-time status monitoring
