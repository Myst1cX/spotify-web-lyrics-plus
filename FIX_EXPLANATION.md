# Fix Explanation: Why Genius Provider Was Skipped

## The Problem You Observed

You noticed that:
1. Auto-detection showed "No lyrics were found from any of the available providers"
2. BUT when you manually clicked the Genius provider button, lyrics loaded immediately
3. This meant Genius DID have the lyrics, but auto-detection somehow missed them

## Root Cause: Missing Error Handling

### How Auto-Detection Works

The script checks 9 providers in sequence:

```
Provider 1: LRCLIB (synced)
Provider 2: Spotify (synced)
Provider 3: KPoe (synced)
Provider 4: Musixmatch (synced)
Provider 5: LRCLIB (unsynced)
Provider 6: Spotify (unsynced)
Provider 7: KPoe (unsynced)
Provider 8: Musixmatch (unsynced)
Provider 9: Genius (unsynced) ← YOUR LYRICS ARE HERE!
```

### What Was Going Wrong (BEFORE the fix)

```javascript
// OLD CODE - NO ERROR HANDLING
for (const { name, type } of detectionOrder) {
  const provider = Providers.map[name];
  const result = await provider.findLyrics(info);
  // ... process result
}
```

**Scenario that caused your issue:**

```
1. Check LRCLIB (synced)     → No lyrics found ✓
2. Check Spotify (synced)     → No lyrics found ✓
3. Check KPoe (synced)        → CRASH! Network timeout ✗
   └─> Loop breaks here due to unhandled error
4. Check Musixmatch (synced)  → NEVER CHECKED ✗
5. Check LRCLIB (unsynced)    → NEVER CHECKED ✗
6. Check Spotify (unsynced)   → NEVER CHECKED ✗
7. Check KPoe (unsynced)      → NEVER CHECKED ✗
8. Check Musixmatch (unsynced)→ NEVER CHECKED ✗
9. Check Genius (unsynced)    → NEVER CHECKED ✗ (YOUR LYRICS!)

Result: "No lyrics were found" message (WRONG!)
```

### Why Manual Click Worked

When you clicked the Genius button manually:
- The code directly called `Genius.findLyrics()`
- It bypassed the auto-detection loop entirely
- No earlier provider failures could interfere
- Genius returned lyrics successfully ✓

## The Fix: Add Error Handling

```javascript
// NEW CODE - WITH ERROR HANDLING
for (const { name, type } of detectionOrder) {
  try {
    const provider = Providers.map[name];
    const result = await provider.findLyrics(info);
    // ... process result
  } catch (error) {
    console.warn(`[Lyrics+] Error checking ${name} provider:`, error);
    // Continue to next provider instead of breaking
  }
}
```

**Same scenario with the fix:**

```
1. Check LRCLIB (synced)     → No lyrics found ✓
2. Check Spotify (synced)     → No lyrics found ✓
3. Check KPoe (synced)        → CRASH! Network timeout ✗
   └─> Error caught, logged, loop continues ✓
4. Check Musixmatch (synced)  → No lyrics found ✓
5. Check LRCLIB (unsynced)    → No lyrics found ✓
6. Check Spotify (unsynced)   → No lyrics found ✓
7. Check KPoe (unsynced)      → No lyrics found ✓
8. Check Musixmatch (unsynced)→ No lyrics found ✓
9. Check Genius (unsynced)    → LYRICS FOUND! ✓ (YOUR LYRICS!)

Result: Lyrics displayed successfully! ✓
```

## What Causes Provider Crashes?

Any of these can cause an unhandled exception:
- Network timeouts
- Malformed API responses
- Unexpected data structures
- Rate limiting errors
- CORS issues
- Server errors (500, 503)
- JavaScript runtime errors (accessing undefined properties)

## Summary

**Before:** One provider failure = entire detection fails = Genius never checked
**After:** One provider failure = logged and skipped = all 9 providers always checked

This is why your manual click worked but auto-detection didn't - the fix ensures that Genius (and ALL providers) always get their turn, regardless of earlier failures.
