# Replay Button Fix - Summary

## Problem Fixed
Songs with the replay button enabled would sometimes get stuck at the last second (e.g., 3:25 for a 3:25 song) or jump between the last few seconds without replaying. The track would show silence after reaching the end instead of restarting.

## Root Cause
When seeking to exactly the track duration (e.g., seeking to 3:25 on a 3:25 song), the browser's audio player enters an "ended" state. This state conflicts with Spotify's repeat functionality, preventing the track from replaying as expected.

## Solution Implemented
The fix adds a 200ms buffer before the track end when seeking. When the script detects a seek operation that would go to within 200ms of the track end, it automatically caps the seek position at `duration - 200ms`. This prevents the audio element from entering the "ended" state while still allowing playback to complete naturally and trigger the repeat.

### Technical Details
- Modified the `seekTo()` function to include end-buffer logic
- Created `applySeekEndBuffer()` helper function to reduce code duplication
- Applied the buffer consistently across all three seeking methods:
  1. Audio element `currentTime` property
  2. Native range input value
  3. CSS progress-bar pointer events

## How to Test the Fix

1. **Install the updated userscript** from your browser's userscript manager
2. **Open Spotify Web Player** (https://open.spotify.com/)
3. **Enable the repeat button** (click until it shows "Repeat all" or "Repeat one")
4. **Play a song** and let it reach the end
5. **Observe**: The song should now replay correctly without getting stuck

### Testing with Debug Mode (Optional)

If you want to see what's happening behind the scenes:

1. Open Developer Console (F12)
2. Enable debug mode:
   ```javascript
   LyricsPlusDebug.enable()
   ```
3. Play a song with repeat enabled
4. Watch the console logs as the song approaches the end
5. You should see messages like:
   - `[Lyrics+ DEBUG] [Seekbar] Seeking to XXXms`
   - `[Lyrics+ DEBUG] [Seekbar] Applied end buffer: XXXms → XXXms to prevent "ended" state`
   - `[Lyrics+ DEBUG] [Seekbar] ✓ Seeked via audio.currentTime to XXXms`

## Debug Helper Commands

The fix also includes a new debug helper accessible from the browser console:

### Available Commands:

```javascript
// Show all available commands
LyricsPlusDebug.help()

// Enable debug logging
LyricsPlusDebug.enable()

// Disable debug logging
LyricsPlusDebug.disable()

// Check if debug mode is enabled
LyricsPlusDebug.isEnabled()

// Get current track information
LyricsPlusDebug.getTrackInfo()

// Get repeat button state ('off', 'all', or 'one')
LyricsPlusDebug.getRepeatState()

// Get audio element status (position, duration, paused, ended, etc.)
LyricsPlusDebug.getAudioElement()
```

## What If the Issue Still Occurs?

If you still experience issues after installing the fix:

1. **Enable debug mode** and watch the console logs
2. **Check the repeat state**:
   ```javascript
   LyricsPlusDebug.enable()
   LyricsPlusDebug.getRepeatState()
   ```
3. **Let the song play to the end** and watch for any error messages
4. **Check audio element status** when the issue occurs:
   ```javascript
   LyricsPlusDebug.getAudioElement()
   ```
5. **Copy all console logs** and report them in the GitHub issue

## Additional Resources

- See `console-debug-script.md` for more detailed troubleshooting steps
- Report issues at: https://github.com/Myst1cX/spotify-web-lyrics-plus/issues

## Files Modified

- `pip-gui-stable.user.js` - Main userscript file with the fix
- `console-debug-script.md` - Detailed troubleshooting guide
- `FIX-SUMMARY.md` - This file

## Version
This fix is included in version 15.9+ of the Spotify Lyrics+ userscript.
