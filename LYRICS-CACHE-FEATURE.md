# Lyrics Caching Feature

## Overview
The lyrics caching feature automatically stores lyrics for the last 50 songs you've played, enabling instant loading without network requests. This is especially useful for:
- **Repeat One**: When you replay the same song, lyrics appear instantly with scroll position reset
- **Recently Played**: Songs you've heard recently load instantly when you play them again
- **Offline-like Experience**: Cached songs don't need internet to display lyrics

## How It Works

### Automatic Caching
- When lyrics are successfully fetched from any provider (LRCLIB, Spotify, KPoe, Musixmatch, Genius), they're automatically saved to cache
- Cache stores the last 50 songs played
- Uses browser's localStorage for persistence (survives page reloads and browser restarts)
- Oldest songs are automatically removed when the 50-song limit is reached (LRU eviction)

### Instant Loading
When you play a song:
1. **Cache Check**: Script first checks if lyrics are already cached
2. **Instant Display**: If found, lyrics appear immediately (no network delay)
3. **Network Fallback**: If not cached, lyrics are fetched from providers as usual

### Repeat One Support
When Repeat One is enabled and a song ends:
1. **Detection**: Script detects when song position resets from end to beginning
2. **Scroll Reset**: Lyrics automatically scroll back to the first line
3. **No Reloading**: Uses already cached lyrics - no fetching needed
4. **Seamless Experience**: Happens instantly as song restarts

## Console Messages

The feature provides clear, user-friendly console messages:

### Cache Operations
```
💾 [Lyrics+] Found cached lyrics! Loading instantly without network request...
✨ [Lyrics+] Loading lyrics from cache for "Song Title" by Artist Name
   📦 Source: LRCLIB (previously fetched)
⚡ [Lyrics+] Lyrics loaded instantly from cache (no internet needed!)
✅ [Lyrics+] Lyrics saved to cache! Now have 15 of last 50 songs cached for instant replay
```

### Repeat One Detection
```
🔁 [Lyrics+] Song restarted! Repeat One detected for "Song Title"
   ⏮️ Resetting lyrics scroll to the beginning...
   ✅ Lyrics scrolled back to start (cached lyrics, no loading needed!)
```

### Cache Management
```
💾 [Lyrics+] Removed oldest cached song to make room for new ones (keeping last 50 songs)
🔍 [Lyrics+] No cached lyrics found for this song - fetching from providers...
🔍 [Lyrics+] Searching for lyrics: "Song Title" by Artist Name
```

## Debug Commands

Access these commands in the browser console (press F12):

### View Cache Statistics
```javascript
LyricsPlusDebug.getCacheStats()
```
Shows:
- Number of cached songs
- Maximum cache size
- List of cached songs with provider info
- Timestamp of when each song was cached

### Clear Cache
```javascript
LyricsPlusDebug.clearCache()
```
Removes all cached lyrics (useful for troubleshooting)

### Enable Debug Mode
```javascript
LyricsPlusDebug.enable()
```
Shows detailed technical logs for developers

## Storage Information

### Cache Size
- **Maximum songs**: 50
- **Estimated size per song**: 1-5 KB
- **Total storage**: ~50-250 KB
- **Storage location**: Browser's localStorage

### Data Stored Per Song
```javascript
{
  trackId: "spotify_track_id",
  timestamp: 1234567890,
  provider: "LRCLIB",
  synced: [...],      // Synced lyrics with timestamps
  unsynced: [...],    // Unsynced/plain lyrics
  trackInfo: {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album Name",
    duration: 180000
  }
}
```

### Privacy
- All data stored locally in your browser
- No data sent to external servers
- Cache clears when you clear browser data
- Can be manually cleared with `LyricsPlusDebug.clearCache()`

## Testing the Feature

### Test Repeat One
1. Play a song with lyrics
2. Enable Repeat One in Spotify
3. Wait for song to finish
4. Watch console - should see "Song restarted!" message
5. Verify lyrics scroll back to beginning
6. Lyrics should display instantly without "Loading lyrics..." message

### Test Recently Played Cache
1. Play a song with lyrics (first time)
2. Console shows: "No cached lyrics found for this song - fetching..."
3. After lyrics load, console shows: "Lyrics saved to cache!"
4. Play a different song
5. Go back to first song
6. Console should show: "Found cached lyrics! Loading instantly..."
7. Lyrics should appear immediately

### Test Cache Limit
1. Play more than 50 different songs
2. Console will show: "Removed oldest cached song to make room..."
3. Verify oldest songs are removed from cache
4. Use `LyricsPlusDebug.getCacheStats()` to see current cache size

## Troubleshooting

### Cache Not Working
**Problem**: Lyrics aren't loading from cache
**Solutions**:
- Check console for cache messages
- Try `LyricsPlusDebug.getCacheStats()` to see if songs are being cached
- Ensure browser allows localStorage
- Check browser storage quota hasn't been exceeded

### Repeat One Not Detecting
**Problem**: Song restarts but doesn't show console message
**Solutions**:
- Check console for any errors
- Verify Repeat One is enabled in Spotify
- Try `LyricsPlusDebug.enable()` to see detailed logs
- Song must be playing for at least 5 seconds before restart detection works

### Cache Too Large
**Problem**: Want to reduce storage usage
**Solutions**:
- Cache automatically limits to 50 songs
- Clear cache with `LyricsPlusDebug.clearCache()`
- Cache is very small (~50-250 KB total)

## Benefits

### Speed
- **Instant Loading**: Cached songs load in <1ms vs 500-2000ms from network
- **No Network Delay**: Works even during poor internet connection
- **Smooth Experience**: No "Loading lyrics..." wait time

### Data Savings
- Reduced network requests
- Less bandwidth usage
- Works offline for cached songs

### User Experience
- Seamless repeat one functionality
- Consistent experience for favorite songs
- Automatic - no configuration needed

## Technical Details

### LRU Eviction
The cache uses Least Recently Used (LRU) eviction:
- Each time a cached song is accessed, its timestamp is updated
- When cache exceeds 50 songs, oldest (by timestamp) are removed
- Frequently played songs stay in cache longer

### Detection Algorithm
Repeat one detection uses position monitoring:
- Tracks playback position every 400ms
- Detects when position jumps from >5s to <5s on same track
- Threshold prevents false positives from seeking

### Persistence
- Uses localStorage API for browser-native storage
- Survives page reloads and browser restarts
- Cleared only when browser data is cleared or manually

## Future Enhancements

Possible improvements:
- Configurable cache size
- Manual cache management UI
- Export/import cache
- Cache statistics in popup
- Smart pre-caching of queue

## Version History

- **v16.0**: Initial implementation of lyrics caching feature
  - 50-song LRU cache
  - Repeat one detection
  - User-friendly console logging
  - Debug commands integration
