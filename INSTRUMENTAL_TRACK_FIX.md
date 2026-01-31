# Instrumental Track Handling Fix

## The Problem

When Musixmatch or LRCLIB providers encountered instrumental tracks, they would return "♪ Instrumental ♪" as lyrics. This prevented the autodetect system from trying other providers that might actually have lyrics for the track.

### Example Scenario

**Before Fix:**
```
User plays an instrumental track
  ↓
Autodetect tries providers in order:
  1. LRCLIB synced → Returns [{ text: "♪ Instrumental ♪" }]
  ↓
Autodetect sees non-empty array → Stops searching
  ↓
Displays: "♪ Instrumental ♪"
  ↓
Other providers (Spotify, KPoe, Musixmatch, Genius) never tried
```

**Issue:** Some tracks marked as "instrumental" by one provider might have lyrics available from another provider (e.g., live versions, covers, or incorrect metadata).

---

## Root Cause Analysis

### Provider Behavior

**Musixmatch (fetchMusixmatchLyrics - line 1785-1787):**
```javascript
if (track.instrumental) {
  return { synced: [{ text: "♪ Instrumental ♪", time: 0 }] };
}
```

**LRCLIB (getSynced/getUnsynced - lines 1462, 1467):**
```javascript
getUnsynced(body) {
  if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
  // ...
}
getSynced(body) {
  if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
  // ...
}
```

### Autodetect Logic

The autodetect system (line 5376-5391) checks:

```javascript
if (result && !result.error) {
  let lyrics = provider[type](result);
  if (lyrics && lyrics.length > 0) {
    // Lyrics found! Use this provider and stop searching
    Providers.setCurrent(name);
    updateLyricsContent(popup, info);
    return; // ← Stops here!
  }
}
```

**Key Issue:** The check `lyrics.length > 0` treats `[{ text: "♪ Instrumental ♪" }]` as valid lyrics because the array has 1 element.

---

## The Solution

### Strategy

Instead of returning instrumental markers as lyrics, indicate "no lyrics available" so the autodetect system continues searching other providers.

### Implementation

#### 1. Musixmatch Provider

**Before:**
```javascript
if (track.instrumental) {
  return { synced: [{ text: "♪ Instrumental ♪", time: 0 }] };
}
```

**After:**
```javascript
if (track.instrumental) {
  return { error: "Track is instrumental (no lyrics available)" };
}
```

**Effect:** When `result.error` exists, the autodetect system treats it as a failure and moves to the next provider.

#### 2. LRCLIB Provider

**Before:**
```javascript
getUnsynced(body) {
  if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
  if (!body?.plainLyrics) return null;
  return Utils.parseLocalLyrics(body.plainLyrics).unsynced;
}
getSynced(body) {
  if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
  if (!body?.syncedLyrics) return null;
  return Utils.parseLocalLyrics(body.syncedLyrics).synced;
}
```

**After:**
```javascript
getUnsynced(body) {
  if (body?.instrumental) return null; // Skip to next provider for instrumental tracks
  if (!body?.plainLyrics) return null;
  return Utils.parseLocalLyrics(body.plainLyrics).unsynced;
}
getSynced(body) {
  if (body?.instrumental) return null; // Skip to next provider for instrumental tracks
  if (!body?.syncedLyrics) return null;
  return Utils.parseLocalLyrics(body.syncedLyrics).synced;
}
```

**Effect:** When `lyrics` is `null`, the autodetect system treats it as empty and moves to the next provider.

---

## Flow Comparison

### Before Fix

```
┌─────────────────────────────────────────────────────────────┐
│ Autodetect Started                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │ Try LRCLIB synced      │
          └────────┬───────────────┘
                   │
                   ▼
     ┌──────────────────────────────┐
     │ body.instrumental = true     │
     └────────┬─────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │ Return [{ text: "♪ Instrumental ♪" }]│
   └────────┬─────────────────────────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ lyrics.length > 0? YES   │
   └────────┬─────────────────┘
            │
            ▼
   ┌──────────────────────────────┐
   │ Display "♪ Instrumental ♪"   │
   │ STOP (don't try other        │
   │ providers)                   │
   └──────────────────────────────┘
```

### After Fix

```
┌─────────────────────────────────────────────────────────────┐
│ Autodetect Started                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────┐
          │ Try LRCLIB synced      │
          └────────┬───────────────┘
                   │
                   ▼
     ┌──────────────────────────────┐
     │ body.instrumental = true     │
     └────────┬─────────────────────┘
              │
              ▼
         ┌─────────────┐
         │ Return null │
         └────────┬────┘
                  │
                  ▼
   ┌──────────────────────────┐
   │ lyrics = null            │
   │ Skip to next provider    │
   └────────┬─────────────────┘
            │
            ▼
   ┌────────────────────────┐
   │ Try Spotify synced     │
   └────────┬───────────────┘
            │
            ▼
   ┌────────────────────────┐
   │ Try KPoe synced        │
   └────────┬───────────────┘
            │
            ▼
   ┌────────────────────────┐
   │ Try Musixmatch synced  │
   └────────┬───────────────┘
            │
            ▼
     ┌──────────────────────────────┐
     │ track.instrumental = true    │
     └────────┬─────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────┐
   │ Return { error: "Track is instrumental" }│
   └────────┬─────────────────────────────────┘
            │
            ▼
   ┌──────────────────────────┐
   │ result.error exists      │
   │ Skip to next provider    │
   └────────┬─────────────────┘
            │
            ▼
   (Continue trying LRCLIB unsynced, Spotify unsynced,
    KPoe unsynced, Musixmatch unsynced, Genius unsynced...)
            │
            ▼
   ┌──────────────────────────────────────────┐
   │ If any provider has lyrics: Display them │
   │ If no provider has lyrics: "No lyrics    │
   │ found"                                   │
   └──────────────────────────────────────────┘
```

---

## Testing Scenarios

### Scenario 1: Track Marked Instrumental by LRCLIB Only

**Track:** "Song A" - LRCLIB marks as instrumental, but Spotify has lyrics

**Before Fix:**
1. LRCLIB synced → Returns "♪ Instrumental ♪"
2. Displays instrumental marker
3. User never sees actual lyrics from Spotify

**After Fix:**
1. LRCLIB synced → Returns null (skip)
2. Spotify synced → Returns actual lyrics
3. Displays lyrics from Spotify ✓

### Scenario 2: Track Marked Instrumental by Musixmatch Only

**Track:** "Song B" - Musixmatch marks as instrumental, but KPoe has lyrics

**Before Fix:**
1. LRCLIB synced → No lyrics
2. Spotify synced → No lyrics
3. KPoe synced → No lyrics
4. Musixmatch synced → Returns "♪ Instrumental ♪"
5. Displays instrumental marker
6. Genius never tried

**After Fix:**
1. LRCLIB synced → No lyrics (skip)
2. Spotify synced → No lyrics (skip)
3. KPoe synced → No lyrics (skip)
4. Musixmatch synced → Error: instrumental (skip)
5. LRCLIB unsynced → No lyrics (skip)
6. Spotify unsynced → No lyrics (skip)
7. KPoe unsynced → Returns actual lyrics
8. Displays lyrics from KPoe ✓

### Scenario 3: Actually Instrumental Track (No Lyrics Anywhere)

**Track:** "Song C" - Truly instrumental, no provider has lyrics

**Before Fix:**
1. LRCLIB synced → Returns "♪ Instrumental ♪"
2. Displays instrumental marker

**After Fix:**
1. Tries all providers in order
2. All return null or errors
3. Displays "No lyrics found for this track"

**Note:** This is slightly different UX but more accurate - the track truly has no lyrics.

### Scenario 4: Track Has Lyrics in Multiple Providers

**Track:** "Song D" - Has lyrics in LRCLIB and Musixmatch

**Before & After:** No change - LRCLIB synced returns actual lyrics, displays them.

---

## Benefits

### 1. Better Lyrics Coverage
- Increases chances of finding lyrics for tracks incorrectly marked as instrumental
- Utilizes all available providers before giving up

### 2. Consistent Behavior
- Both LRCLIB and Musixmatch now handle instrumental tracks the same way
- Follows the established pattern for "no lyrics" (return null or error)

### 3. No Breaking Changes
- Only affects instrumental tracks
- Normal tracks with lyrics work exactly as before
- Provider order and priority unchanged

### 4. Accurate Information
- If truly no lyrics exist, shows "No lyrics found" instead of instrumental marker
- More honest about what's available

---

## Code Changes Summary

**File:** `pip-gui-stable.user.js`

**Lines Modified:**
1. Line 1462: LRCLIB `getUnsynced` - Return `null` for instrumental
2. Line 1467: LRCLIB `getSynced` - Return `null` for instrumental  
3. Line 1786: Musixmatch `fetchMusixmatchLyrics` - Return error for instrumental

**Total:** 3 lines changed, no new code added

**Impact:** Low-risk change with high benefit for edge cases

---

## Alternative Approaches Considered

### Option 1: Filter in Autodetect Logic
```javascript
if (lyrics && lyrics.length > 0) {
  // Check if lyrics contain only instrumental marker
  const isOnlyInstrumental = lyrics.length === 1 && 
    lyrics[0].text === "♪ Instrumental ♪";
  if (!isOnlyInstrumental) {
    // Use these lyrics
  }
}
```

**Rejected:** This puts the logic in the wrong place. Providers should indicate no lyrics, not return fake lyrics.

### Option 2: New Return Value
```javascript
return { instrumental: true };
```

**Rejected:** Requires changing autodetect logic to understand this new format. Current approach works with existing error handling.

### Option 3: Keep Current Behavior
Do nothing, display "♪ Instrumental ♪" as before.

**Rejected:** This prevents finding actual lyrics that might exist in other providers.

---

## Conclusion

This fix improves lyrics detection for edge cases where tracks are incorrectly marked as instrumental by one provider but have lyrics in another. The change is minimal (3 lines), follows existing patterns, and has no negative impact on normal operation.

**Status:** ✅ Complete and tested
**Risk Level:** Low
**User Impact:** Positive (better lyrics coverage)
