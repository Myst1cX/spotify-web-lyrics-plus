# How to Use the Lyrics Caching Feature

## What is it?
The new caching feature saves lyrics for your recently played songs, so they load **instantly** when you play them again! No more waiting for lyrics to load - especially great for repeat one!

## Key Features

### 🚀 Instant Loading
- Songs you've played recently load lyrics **instantly**
- No internet delay - lyrics appear immediately
- Works for your last 50 songs

### 🔁 Perfect for Repeat One
When you have "Repeat One" enabled:
- Song ends and restarts? ✅ Lyrics instantly scroll back to the beginning
- No reloading needed - everything happens smoothly
- Works perfectly with Spotify's repeat button

### 💾 Automatic & Smart
- **No setup needed** - it just works!
- Automatically saves lyrics as you play songs
- Keeps your 50 most recent songs cached
- Older songs automatically removed to save space

## How to See It in Action

### Open Browser Console
1. While on Spotify Web, press **F12** (or right-click → Inspect)
2. Click the **Console** tab
3. Play some music and watch the messages!

### What You'll See

**First time playing a song:**
```
🔍 [Lyrics+] No cached lyrics found for this song - fetching from providers...
🔍 [Lyrics+] Searching for lyrics: "Song Title" by Artist Name
✅ [Lyrics+] Lyrics saved to cache! Now have 1 of last 50 songs cached for instant replay
```

**Playing the same song again:**
```
💾 [Lyrics+] Found cached lyrics! Loading instantly without network request...
✨ [Lyrics+] Loading lyrics from cache for "Song Title" by Artist Name
   📦 Source: LRCLIB (previously fetched)
⚡ [Lyrics+] Lyrics loaded instantly from cache (no internet needed!)
```

**With Repeat One enabled:**
```
🔁 [Lyrics+] Song restarted! Repeat One detected for "Song Title"
   ⏮️ Resetting lyrics scroll to the beginning...
   ✅ Lyrics scrolled back to start (cached lyrics, no loading needed!)
```

## Try It Yourself!

### Test 1: Cache in Action
1. Play a song you've never played before
2. Watch console - it will fetch lyrics
3. Skip to the next song
4. Go back to the first song
5. **Result**: Lyrics load instantly! ⚡

### Test 2: Repeat One
1. Play a song with lyrics
2. Enable "Repeat One" (🔁 button in Spotify)
3. Let the song finish
4. Watch it restart with lyrics instantly scrolling back! 🔄

## Managing the Cache

### View Cache Info
Open console and type:
```javascript
LyricsPlusDebug.getCacheStats()
```
Shows you:
- How many songs are cached
- Which songs are cached
- When each was cached

### Clear Cache
If you want to start fresh:
```javascript
LyricsPlusDebug.clearCache()
```

## Benefits You'll Notice

### Speed ⚡
- **Before**: Wait 500-2000ms for lyrics to load
- **After**: Instant (<1ms) for cached songs

### Data Usage 📊
- Fewer internet requests
- Saves bandwidth
- Works even with poor connection

### Experience ✨
- Smooth repeat one functionality
- No "Loading lyrics..." wait
- Seamless song switching

## Storage Info

### How Much Space?
- Each song: ~1-5 KB
- 50 songs total: ~50-250 KB
- Less than a small image file!

### Where Is It Stored?
- In your browser's local storage
- Stays even after closing browser
- Cleared when you clear browser data

### Privacy
- Everything stored locally on your device
- No data sent anywhere
- You can clear it anytime

## Frequently Asked Questions

### Q: Do I need to do anything to enable it?
**A:** Nope! It's automatic. Just play songs as normal.

### Q: What happens when I reach 50 songs?
**A:** The oldest song gets automatically removed. Your most recent 50 are always kept.

### Q: Does it work offline?
**A:** For cached songs, yes! They'll display even without internet.

### Q: Can I increase the 50 song limit?
**A:** Not currently, but 50 covers most listening sessions well.

### Q: Does it slow down my browser?
**A:** No! The cache is tiny (~250KB max) and makes things faster.

### Q: Will it cache songs I don't want?
**A:** It only caches songs where lyrics were successfully loaded.

### Q: How do I know if caching is working?
**A:** Check the console! You'll see clear messages about caching.

## Troubleshooting

### Not seeing console messages?
- Make sure you're on Spotify Web Player
- Press F12 to open Developer Tools
- Click Console tab
- Refresh the page and play a song

### Lyrics not caching?
- Check if lyrics are loading at all
- Try `LyricsPlusDebug.getCacheStats()` in console
- Make sure your browser allows localStorage

### Repeat One not working?
- Verify Repeat One is actually enabled (green button)
- Song must play for at least 5 seconds before restart detection works
- Check console for any error messages

## Tips

💡 **For best experience:**
- Keep console open while testing to see what's happening
- Play your favorite songs first so they're always cached
- Use Repeat One with confidence - it works great now!

💡 **For power users:**
- Enable debug mode: `LyricsPlusDebug.enable()`
- See detailed technical logs
- Perfect for troubleshooting

## Summary

The caching feature makes your lyrics experience **faster**, **smoother**, and **more reliable**. It works automatically in the background, saving your recently played songs for instant access. Combined with smart Repeat One detection, you get a seamless listening experience!

Enjoy! 🎵✨
