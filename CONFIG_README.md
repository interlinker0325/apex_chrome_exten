# Configuration Guide

## Backend URL Configuration

The Chrome extension now supports configurable backend URLs. You can change the backend server URL in two ways:

### Method 1: Through Extension Options (Recommended)

1. **Open the extension** by clicking the icon in your toolbar
2. **Click "EXTENSION OPTIONS"**
3. **Scroll to "Backend Configuration"** section
4. **Enter your backend URL** in the "Backend URL" field
5. **Click "Save Settings"**

### Method 2: Edit config.js File

1. **Open** `config.js` in a text editor
2. **Change the API_BASE_URL** value:
   ```javascript
   const CONFIG = {
       API_BASE_URL: 'http://your-server:8000/api',  // Change this
       // ... rest of config
   };
   ```
3. **Reload the extension** in Chrome

## Common Backend URL Examples

### Local Development
```
http://localhost:8000/api
http://127.0.0.1:8000/api
```

### Local Network (Other Devices)
```
http://192.168.1.100:8000/api
http://10.0.0.50:8000/api
```

### Production/Cloud
```
https://your-domain.com/api
https://api.yourcompany.com/apex
```

## Configuration Options

### config.js Settings

```javascript
const CONFIG = {
    // Backend API URL
    API_BASE_URL: 'http://localhost:8000/api',
    
    // API endpoints (usually don't need to change)
    ENDPOINTS: {
        PURCHASE: '/purchase',
        STATUS: '/status',
        STOP: '/stop',
        RESET: '/reset',
        SESSIONS: '/sessions'
    },
    
    // Extension settings
    EXTENSION: {
        NAME: 'APEX Account Purchaser',
        VERSION: '1.0.0',
        POLLING_INTERVAL: 1000,  // milliseconds
        TIMEOUT_DURATION: 30000  // milliseconds
    }
};
```

## Troubleshooting

### Backend URL Not Working
- **Check the URL format**: Must include `http://` or `https://`
- **Verify the backend is running**: Test the URL in your browser
- **Check firewall settings**: Ensure the port is accessible
- **Try different URL formats**: `localhost` vs `127.0.0.1`

### Extension Not Connecting
1. **Check browser console** for error messages
2. **Verify backend is running** on the specified URL
3. **Test the API endpoint** directly in browser
4. **Check CORS settings** in your backend

### Settings Not Saving
1. **Ensure all required fields** are filled
2. **Check browser permissions** for storage
3. **Try refreshing** the options page
4. **Clear extension data** and reconfigure

## Testing Your Configuration

1. **Start your backend server**
2. **Open extension options** and set the backend URL
3. **Save settings**
4. **Click "START SCRAPING"** in the popup
5. **Check the logs** for connection status

## Default Values

If no backend URL is configured, the extension will use:
- **Default URL**: `http://localhost:8000/api`
- **Polling Interval**: 1000ms (1 second)
- **Timeout**: 30 seconds

## Security Notes

- **Never share your backend URL** with untrusted users
- **Use HTTPS in production** for secure communication
- **Consider authentication** for production deployments
- **Monitor API usage** to prevent abuse
