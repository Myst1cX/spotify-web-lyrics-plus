# Lyrics+ Console Debug Script

Use these commands in your browser's developer console to troubleshoot issues with the Spotify Lyrics+ userscript.

## Quick Start

1. Open Spotify Web Player in your browser
2. Press `F12` to open Developer Console
3. Go to the **Console** tab
4. Copy and paste any of the commands below

## Available Commands

### Enable Debug Logging
```javascript
LyricsPlusDebug.enable()
```
This will show detailed logs about what the script is doing. Very useful for troubleshooting.

### Disable Debug Logging
```javascript
LyricsPlusDebug.disable()
```
Turn off debug logging when you're done.

### Get Current Track Info
```javascript
LyricsPlusDebug.getTrackInfo()
```
Shows information about the currently playing track (title, artist, duration, etc.)

### Get Repeat State
```javascript
LyricsPlusDebug.getRepeatState()
```
Shows the current repeat button state: 'off', 'all', or 'one'

### Get Audio Element Status
```javascript
LyricsPlusDebug.getAudioElement()
```
Shows the HTML5 audio element status including:
- Current playback position
- Track duration
- Whether it's paused or ended
- Ready state

### Show All Available Commands
```javascript
LyricsPlusDebug.help()
```

## Troubleshooting Replay Issues

If you're experiencing issues with songs not replaying correctly:

1. **Enable debug mode and play a song with repeat enabled:**
   ```javascript
   LyricsPlusDebug.enable()
   ```

2. **Check the repeat state:**
   ```javascript
   LyricsPlusDebug.getRepeatState()
   ```
   Should return 'all' or 'one' if repeat is enabled.

3. **Check audio element when song reaches the end:**
   ```javascript
   LyricsPlusDebug.getAudioElement()
   ```
   Look for the `ended` property - if it's `true`, that's the issue.

4. **Watch the console logs** as the song approaches the end. You should see:
   - `[Lyrics+ DEBUG] [Seekbar] Seeking to XXXms`
   - If seeking near the end: `[Lyrics+ DEBUG] [Seekbar] Applied end buffer`
   - Seek method used: `✓ Seeked via audio.currentTime` or similar

5. **Copy the logs and report them** in the GitHub issue.

## Example Debug Session

```javascript
// 1. Enable debug logging
LyricsPlusDebug.enable()

// 2. Get track info
LyricsPlusDebug.getTrackInfo()

// 3. Check repeat state
LyricsPlusDebug.getRepeatState()

// 4. Let the song play to the end and watch console logs

// 5. When issue occurs, check audio state
LyricsPlusDebug.getAudioElement()

// 6. Copy all console output and share it in the GitHub issue
```

## Report Issues

If you find problems, please report them at:
https://github.com/Myst1cX/spotify-web-lyrics-plus/issues

Include:
1. The console logs (with debug enabled)
2. Track information (title, duration)
3. Repeat state
4. What behavior you observed vs. what you expected
