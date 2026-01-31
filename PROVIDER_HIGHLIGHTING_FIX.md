# Provider Highlighting Fix - Visual Explanation

## The Problem

When reopening the lyrics popup, the previously used provider remained highlighted in green during the search phase, which was confusing.

### Before Fix

```
User Action: Click "Lyrics+" button to open popup
┌─────────────────────────────────────────────────────┐
│ Lyrics Plus                                    [✕]  │
├─────────────────────────────────────────────────────┤
│ [LRCLIB] [Spotify] [KPoe] [Musixmatch] [Genius]   │
│    ✓                                                │
│   GREEN     (from previous session - MISLEADING!)  │
├─────────────────────────────────────────────────────┤
│ Loading lyrics...                                   │
│                                                     │
│ (Background: Actually searching all providers       │
│  in order: LRCLIB → Spotify → KPoe → ...)          │
└─────────────────────────────────────────────────────┘

Issue: User sees LRCLIB highlighted green, but the script is 
       searching ALL providers. This is misleading!
```

### After Fix

```
User Action: Click "Lyrics+" button to open popup
┌─────────────────────────────────────────────────────┐
│ Lyrics Plus                                    [✕]  │
├─────────────────────────────────────────────────────┤
│ [LRCLIB] [Spotify] [KPoe] [Musixmatch] [Genius]   │
│                                                     │
│   ALL GREY     (clearly searching...)               │
├─────────────────────────────────────────────────────┤
│ Loading lyrics...                                   │
│                                                     │
│ (Background: Searching all providers in order)      │
└─────────────────────────────────────────────────────┘

After a moment...
┌─────────────────────────────────────────────────────┐
│ Lyrics Plus                                    [✕]  │
├─────────────────────────────────────────────────────┤
│ [LRCLIB] [Spotify] [KPoe] [Musixmatch] [Genius]   │
│              ✓                                      │
│           GREEN    (Spotify found lyrics!)          │
├─────────────────────────────────────────────────────┤
│ [Verse 1]                                           │
│ Some lyrics here...                                 │
│                                                     │
└─────────────────────────────────────────────────────┘

Better! User clearly sees:
1. Initially: No provider selected (searching)
2. Then: Correct provider becomes green when it finds lyrics
```

---

## The Fix

One line change in `createPopup()` function:

```javascript
function createPopup() {
  DEBUG.ui.popupCreated();
  removePopup();

  // Clear current provider so no provider is highlighted while searching
  Providers.current = null;  // ← NEW LINE

  // ... rest of popup creation
}
```

### Why This Works

**Before Fix:**
```
Providers.current = "LRCLIB"  (from previous session)
  ↓
createPopup()
  ↓
Render tabs: Check if (Providers.current === name)
  ↓
LRCLIB === "LRCLIB" → TRUE → Green highlight
  ↓
Start autodetectProviderAndLoad()
  ↓
User sees LRCLIB green while searching (WRONG!)
```

**After Fix:**
```
Providers.current = "LRCLIB"  (from previous session)
  ↓
createPopup()
  ↓
Providers.current = null  ← CLEARED
  ↓
Render tabs: Check if (Providers.current === name)
  ↓
null === "LRCLIB" → FALSE → Grey (all grey)
  ↓
Start autodetectProviderAndLoad()
  ↓
User sees all grey while searching (CORRECT!)
  ↓
Lyrics found → Providers.setCurrent("Spotify")
  ↓
updateTabs() → Spotify becomes green (CORRECT!)
```

---

## Complete Flow Diagram

### Opening Popup Flow

```
┌─────────────────────────────────────────────────────────────┐
│ USER CLICKS "Lyrics+" BUTTON                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ createPopup()                                               │
│   1. removePopup() - clean up old popup                     │
│   2. Providers.current = null  ← FIX                        │
│   3. Create popup element                                   │
│   4. Create header and controls                             │
│   5. Create provider tabs (all grey, none highlighted)      │
│   6. Create lyrics container                                │
│   7. Add to DOM                                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ POPUP VISIBLE - ALL TABS GREY                               │
│ Shows: "Loading lyrics..."                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ autodetectProviderAndLoad(popup, info)                      │
│   Loop through providers in order:                          │
│   1. LRCLIB synced                                          │
│   2. Spotify synced                                         │
│   3. KPoe synced                                            │
│   4. Musixmatch synced                                      │
│   5. LRCLIB unsynced                                        │
│   ... etc                                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
    LYRICS FOUND              NO LYRICS FOUND
            │                         │
            │                         ▼
            │               ┌─────────────────────────┐
            │               │ Providers.current = null│
            │               │ updateTabs(tabs, true)  │
            │               │ → All tabs stay grey    │
            │               │ Show "No lyrics found"  │
            │               └─────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│ Providers.setCurrent(name)              │
│ updateTabs(popup._lyricsTabs)           │
│ → Provider tab becomes green            │
│ updateLyricsContent(popup, info)        │
│ → Lyrics displayed                      │
└─────────────────────────────────────────┘
```

---

## Edge Cases Handled

### Case 1: Track Change While Popup Is Open
```
Popup open, showing lyrics from LRCLIB (green)
  ↓
User skips to next track
  ↓
pollingInterval detects track change
  ↓
currentTrackId updated
  ↓
Show "Loading lyrics..."
  ↓
autodetectProviderAndLoad(popup, info) called
  ↓
(Note: Providers.current NOT cleared - already have popup open)
  ↓
Search finds lyrics from Spotify
  ↓
Providers.setCurrent("Spotify")
updateTabs() → Spotify becomes green, LRCLIB becomes grey
```

**Result:** ✅ Works correctly - provider changes to match new track

### Case 2: Manual Provider Selection
```
Popup open, no provider selected (all grey)
  ↓
User clicks "Genius" tab
  ↓
btn.onclick handler:
  Providers.setCurrent("Genius")
  updateTabs(tabs)
  → Genius becomes green
  updateLyricsContent(popup, info)
  → Load Genius lyrics
```

**Result:** ✅ Works correctly - manual selection still functions

### Case 3: Reopen Popup Multiple Times
```
First open:
  createPopup() → Providers.current = null
  All tabs grey → Spotify finds lyrics → Spotify green

Close popup

Second open:
  createPopup() → Providers.current = null (cleared again!)
  All tabs grey → LRCLIB finds lyrics → LRCLIB green
```

**Result:** ✅ Each open starts fresh with no provider highlighted

---

## Summary

**The Problem:** Provider stayed highlighted from previous session during search
**The Solution:** Clear `Providers.current = null` when opening popup
**The Result:** Clean UI state - providers only highlighted when they have lyrics

**User Experience Improvement:**
- ✅ Clear visual feedback during search phase (all grey)
- ✅ Accurate highlighting (only when provider has lyrics)
- ✅ No misleading stale state from previous session
- ✅ Consistent behavior on every popup open

**Code Impact:** Minimal - one line change, no side effects
