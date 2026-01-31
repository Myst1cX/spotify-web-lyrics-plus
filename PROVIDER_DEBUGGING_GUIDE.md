# Provider Debugging Guide

## Overview
All lyrics providers now have comprehensive debugging output that shows exactly how lyrics searches are performed, what data is sent/received, and why searches succeed or fail.

## Debug Output Format

Each provider follows a consistent debugging pattern:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Provider Debug] Starting lyrics search
[Provider Debug] Input info: {...}
[Provider Debug] Request URL: ...
[Provider Debug] Response status: ...
[Provider Debug] ✓ Success message OR ✗ Failure reason
```

## Provider-Specific Details

### LRCLIB Provider

**Debug Information:**
- Input parameters (artist, title, album, duration)
- Search mode (WITH or WITHOUT album)
- Complete API URL with query parameters
- Duration in seconds
- Response status codes
- Data structure (hasPlainLyrics, hasSyncedLyrics, isInstrumental)
- Instrumental track detection

**Example Output:**
```javascript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[LRCLIB Debug] Starting lyrics search
[LRCLIB Debug] Input info: {artist: "Artist Name", title: "Song Title", album: "Album", duration: 180000}
[LRCLIB Debug] Searching WITH album parameter
[LRCLIB Debug] Including album in search
[LRCLIB Debug] Including duration: 180 seconds
[LRCLIB Debug] Request URL: https://lrclib.net/api/get?...
[LRCLIB Debug] Response status: 200 OK
[LRCLIB Debug] Response data: {hasPlainLyrics: true, hasSyncedLyrics: true, isInstrumental: false, duration: 180}
[LRCLIB Debug] ✓ Lyrics found! Type: Synced
```

**Fallback Behavior:**
If initial search with album fails, automatically retries without album:
```javascript
[LRCLIB Debug] Retrying without album (fallback search)
```

**Error Messages:**
- `404` → "Track not found in LRCLIB database"
- `429` → "Rate limit exceeded - too many requests"
- No data → "Track not found in LRCLIB database or no lyrics available"

---

### KPoe Provider

**Debug Information:**
- Normalized input parameters
- Source order preference
- Force reload indicator
- Cache behavior
- Complete API URL
- Response status with explanations
- Data structure (lyrics type, line count, source)

**Example Output:**
```javascript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[KPoe Debug] Starting lyrics search
[KPoe Debug] Input info: {artist: "artist", title: "title", album: "album", duration: 180, sourceOrder: "none", forceReload: false}
[KPoe Debug] Request URL: https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?...
[KPoe Debug] Response status: 200 OK
[KPoe Debug] Response data: {hasLyrics: true, lyricsType: "synced", lyricsCount: 42, source: "Spotify"}
[KPoe Debug] ✓ Lyrics found! Type: synced, Lines: 42, Source: Spotify (KPoe)
```

**Force Reload:**
```javascript
[KPoe Debug] Force reload enabled (bypassing cache)
```

**Error Messages:**
- `404` → "Track not found in KPoe database"
- `429` → "Rate limit exceeded - too many requests"
- `500` → "Server error - KPoe service may be down"
- No data → "Track not found in KPoe database or no lyrics available"

---

### Musixmatch Provider

**Debug Information:**
- Token status (present/missing, length)
- 3-step process clearly labeled
- Track metadata (trackId, trackName, artistName, hasLyrics, instrumental)
- Separate logging for synced vs unsynced lyrics
- Parse results with line counts
- Masked token in URL logs (for security)

**Example Output:**
```javascript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Musixmatch Debug] Starting lyrics search
[Musixmatch Debug] Input info: {artist: "Artist", title: "Title"}
[Musixmatch Debug] ✓ Token found (length: 48 characters)
[Musixmatch Debug] Step 1: Fetching track info
[Musixmatch Debug] Track URL: https://apic-desktop.musixmatch.com/...***TOKEN***
[Musixmatch Debug] Track response status: 200
[Musixmatch Debug] ✓ Track found: {trackId: 123456, trackName: "...", artistName: "...", hasLyrics: 1, instrumental: 0}
[Musixmatch Debug] Step 2: Fetching synced lyrics (subtitles)
[Musixmatch Debug] Subtitle response status: 200
[Musixmatch Debug] ✓ Synced lyrics found!
[Musixmatch Debug] Parsed 42 synced lyric lines
```

**Step-by-Step Process:**
1. **Step 1:** Get track info from matcher.track.get
2. **Step 2:** Fetch synced lyrics from track.subtitles.get (if available)
3. **Step 3:** Fallback to unsynced lyrics from track.lyrics.get

**Error Messages:**
- `401` → "Musixmatch token expired or invalid. Double click the Musixmatch provider to update your token."
- `404` → "Track not found in Musixmatch database"
- Track lookup failure → "Track lookup failed (HTTP {status})"
- Lyrics fetch failure → "Lyrics fetch failed (HTTP {status})"
- No lyrics → "No lyrics available for this track from Musixmatch"

---

### Spotify Provider

**Debug Information:**
- TrackId and metadata
- Token status and length
- Masked authorization header
- Response status codes with explanations
- Data structure (hasLyrics, hasLines, lineCount, syncType, language)
- Language detection

**Example Output:**
```javascript
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Spotify Debug] Starting lyrics search
[Spotify Debug] Input info: {trackId: "3n3...", title: "Song", artist: "Artist"}
[Spotify Debug] ✓ Token found (length: 253 characters)
[Spotify Debug] Request endpoint: https://spclient.wg.spotify.com/color-lyrics/v2/track/...
[Spotify Debug] Using Authorization: Bearer ***TOKEN***
[Spotify Debug] Response status: 200 OK
[Spotify Debug] Response data: {hasLyrics: true, hasLines: true, lineCount: 38, syncType: "LINE_SYNCED", language: "en"}
[Spotify Debug] ✓ Lyrics found! Type: LINE_SYNCED, Lines: 38, Language: en
```

**Error Messages:**
- `401` → "Double click on the Spotify provider and follow the instructions. Spotify requires a fresh token every hour/upon page reload for security."
- `403` → "Access denied by Spotify - please refresh your token"
- `404` → "Track not found or no lyrics available"
- JSON parse error → "Invalid response format from Spotify"
- Network error → "Spotify lyrics request failed: {error message}"

---

### Genius Provider

**Debug Information:**
(Already comprehensive - no changes needed)
- Input parameters with title variants
- Page-by-page search results
- Candidate evaluation with scoring
- Match threshold calculations
- Artist/title normalization details

## Debugging Best Practices

### 1. Open Browser Console
Press `F12` or right-click → "Inspect" → "Console" tab

### 2. Enable Debug Output
The script has debugging enabled by default. Look for lines starting with `[Provider Debug]`

### 3. Reproduce the Issue
1. Open the lyrics popup
2. Let the script search for lyrics
3. Watch the console for debug output

### 4. Understand the Flow
Each provider will show:
- What it's searching for
- What URL/endpoint it's using
- What response it got
- Why it succeeded or failed

### 5. Common Issues

**No Token Errors:**
```
[Provider Debug] ✗ No token found
```
→ User needs to configure provider token

**404 Errors:**
```
[Provider Debug] ✗ Track not found in [Provider] database
```
→ Track doesn't exist in that provider's database

**Rate Limits:**
```
[Provider Debug] ✗ Rate limit exceeded
```
→ Too many requests, wait before trying again

**Network Errors:**
```
[Provider Debug] ✗ Fetch error: Network error
```
→ Check internet connection or provider service status

## Troubleshooting Guide

### LRCLIB Not Finding Lyrics
1. Check if album parameter is causing issues
2. Look for "Retrying without album" message
3. Verify track duration is reasonable (≥10 seconds)

### KPoe Not Finding Lyrics
1. Check if normalization changed artist/title too much
2. Verify duration parameter is correct
3. Look for source order preference issues

### Musixmatch Failing
1. **Step 1 fails** → Token invalid or track not in database
2. **Step 2 fails** → No synced lyrics, will try unsynced
3. **Step 3 fails** → No lyrics at all in Musixmatch

### Spotify Failing
1. **401 error** → Token expired (refresh every hour)
2. **404 error** → Track has no lyrics in Spotify
3. **Missing trackId** → Internal issue with track detection

### Genius Not Finding Match
1. Check title variants being tried
2. Look at artist matching scores
3. See if version keywords are causing mismatch
4. Check if result was skipped as translation page

## Disabling Debug Output

If you want to disable debug output globally, find this line in the script:

```javascript
const DEBUG = {
  enabled: true, // Set to false to disable all debug logging
```

Change `enabled: true` to `enabled: false`

## Debug Output Symbols

- ✓ Success indicator
- ✗ Failure indicator
- ⚠ Warning indicator (e.g., instrumental track)
- ━━━ Section separator

## File Size Impact

Adding comprehensive debugging increased the file size by:
- **174 lines** (5707 → 5881)
- **~50+ debug points** across all providers
- **20+ user-friendly error messages**

The debug output does not impact performance as it's just console logging, which is very fast.
