# Automatic Spotify Token Extraction

This version of Spotify Web Lyrics+ now includes automatic token extraction, eliminating the need for manual token setup in most cases.

## How It Works

### Automatic Token Detection
- The userscript automatically intercepts network requests made by Spotify's web player
- It extracts authorization tokens from requests to Spotify's API endpoints
- Tokens are automatically stored and used for lyrics requests

### Key Features
1. **Zero Manual Setup**: No need to manually extract tokens from DevTools
2. **Automatic Refresh**: Tokens are refreshed every 50 minutes to prevent expiration
3. **Automatic Retry**: If a token expires, the script automatically fetches a new one and retries
4. **Fallback Support**: Manual token setup is still available if automatic extraction fails

### Supported Endpoints
The script monitors requests to:
- `gew1-spclient.spotify.com` (gabo-receiver-service)
- `spclient.wg.spotify.com` (lyrics API)
- `api.spotify.com` (general Spotify API)

## For Users

### What Changed
- **Before**: You had to manually extract tokens using DevTools every hour
- **After**: Tokens are extracted automatically - just install and use

### Troubleshooting
If automatic token extraction fails:
1. Double-click the "Spotify" provider tab
2. Use the manual token setup as before
3. The manual setup is now marked as "Fallback" mode

### Technical Notes
- Tokens are stored in localStorage as `lyricsPlusSpotifyToken`
- The script logs token extraction activities to the browser console
- Automatic refresh happens every 50 minutes
- Failed requests trigger immediate token refresh and retry

## For Developers

### Implementation Details
The automatic token extraction works by:

1. **Interception Setup**: Overriding `window.fetch` and `XMLHttpRequest.prototype`
2. **Request Monitoring**: Checking outgoing requests for Authorization headers
3. **Token Storage**: Saving valid Bearer tokens to localStorage
4. **Periodic Refresh**: Using `setInterval` for background token refresh

### Code Structure
```javascript
// Main functions
initializeSpotifyToken()    // Sets up everything on page load
setupTokenInterceptor()     // Overrides fetch/XHR
extractSpotifyToken()       // Attempts token extraction
setupTokenRefresh()         // Sets up periodic refresh

// Provider integration
ProviderSpotify.findLyrics() // Now includes automatic retry logic
```

### Testing
Use the included `test-token-extraction.js` script in browser console to verify interception is working.

## Security Considerations

- Tokens are only stored locally in the user's browser
- The script only intercepts Spotify-related requests
- No tokens are transmitted to external servers (except Spotify's own APIs)
- Manual fallback is available if users prefer manual control

## Compatibility

- Works with Tampermonkey, Greasemonkey, and other userscript managers
- Requires permissions for Spotify domains (automatically granted)
- Compatible with all browsers that support userscripts