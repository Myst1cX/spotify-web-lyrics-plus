# Race Condition Fix: How the Advertisement Scenario is Prevented

## The Problem: What Was Happening

### The Advertisement Scenario (from bug1.txt)

When you were playing "Miss Dior" and an advertisement started:

**Timeline of the Bug:**
```
Time 0ms:    "Miss Dior" starts playing
Time 10ms:   Lyrics search STARTS for "Miss Dior"
             └─> Provider 1 (LRCLIB): checking... (async operation)
Time 500ms:  Advertisement starts playing (detected as new song!)
Time 510ms:  NEW lyrics search STARTS for "Advertisement • 1 of 1"
             └─> Provider 1 (LRCLIB): checking... (async operation)
Time 800ms:  Advertisement search completes - FOUND lyrics!
             └─> UI UPDATED: Shows advertisement lyrics ✓
Time 1200ms: "Miss Dior" search STILL RUNNING in background
             └─> Provider 1 failed, trying Provider 2... Provider 3...
Time 3000ms: "Miss Dior" search finishes - NO lyrics found
             └─> UI UPDATED: "No lyrics found" ✗
```

**Result:** Even though the advertisement HAD lyrics showing, the old "Miss Dior" search overwrote them with "No lyrics found"!

### Why This Happened

The script uses `async/await` to search multiple lyrics providers sequentially:
1. Try LRCLIB (synced)
2. Try Spotify (synced)  
3. Try KPoe (synced)
4. Try Musixmatch (synced)
5. Try LRCLIB (unsynced)
6. ...and so on

Each provider call is **asynchronous** - it takes time (network request). While waiting, JavaScript continues executing other code.

**The Race Condition:**
- When "Miss Dior" search was waiting for a provider response...
- The advertisement started playing...
- A NEW search started for the advertisement...
- Both searches ran **concurrently** (at the same time)
- The advertisement search finished first and updated the UI ✓
- But the "Miss Dior" search kept running in the background
- When it finally finished (with no results), it updated the UI ✗

This is called a **race condition** - multiple operations racing, and whichever finishes last "wins" (even if it shouldn't).

---

## The Solution: Search ID Tracking

### What the Fix Does

The fix adds a **search identifier** that marks which search is "current":

**New Code Components:**
1. **`currentSearchId`** - Global variable storing the ID of the active search
2. **`searchIdCounter`** - Counter ensuring each search gets a unique ID
3. **`searchId`** - Local variable in each search: `trackId_timestamp_counter`
4. **`isSearchStillCurrent()`** - Helper function checking if a search is still active

### How It Prevents the Bug

**New Timeline with Fix:**
```
Time 0ms:    "Miss Dior" starts playing
Time 10ms:   Search #1 STARTS for "Miss Dior"
             searchId = "missId_10_1"
             currentSearchId = "missId_10_1" ✓
             └─> Provider 1 (LRCLIB): checking... (async operation)
             
Time 500ms:  Advertisement starts playing
Time 510ms:  Search #2 STARTS for "Advertisement"
             searchId = "adId_510_2"
             currentSearchId = "adId_510_2" ✓ (OVERWRITES!)
             └─> Provider 1 (LRCLIB): checking... (async operation)
             
Time 800ms:  Search #2 provider returns with lyrics
             Check: currentSearchId === searchId?
             → "adId_510_2" === "adId_510_2" ✓ MATCH!
             → UI UPDATED: Shows advertisement lyrics ✓
             
Time 1200ms: Search #1 provider returns (finally!)
             Check: currentSearchId === searchId?
             → "adId_510_2" === "missId_10_1" ✗ NO MATCH!
             → Search aborted, UI NOT touched ✓
```

**Result:** Only the current search (advertisement) can update the UI. The old search (Miss Dior) silently aborts!

---

## Step-by-Step: How Each Check Works

### Check Point 1: After Each Provider Call

**Location:** Line 6305 in `autodetectProviderAndLoad()`

```javascript
const result = await provider.findLyrics(info);

// Check if this search is still current after the async operation
if (!isSearchStillCurrent()) return;
```

**What this does:**
- After EVERY provider API call completes (which takes time)
- Check if `currentSearchId` still matches our search's `searchId`
- If not, a newer search has started → abort immediately
- Don't waste time checking more providers

### Check Point 2: Before Updating UI with Lyrics

**Location:** Line 6313

```javascript
if (lyrics && lyrics.length > 0) {
  // Final check before updating UI
  if (!isSearchStillCurrent()) return;
  
  // Update UI with lyrics...
}
```

**What this does:**
- Found lyrics and ready to display them
- One final check: is this STILL the current search?
- If not, don't update UI (another search has superseded this one)
- This prevents old results from overwriting new ones

### Check Point 3: Before "No Lyrics Found" Message

**Location:** Line 6341

```javascript
// All providers checked, no lyrics found

// Check if this search is still current
if (!isSearchStillCurrent()) return;

// Show "No lyrics found" message
```

**What this does:**
- Checked all providers, found nothing
- Before showing "No lyrics found", verify we're still current
- If not, don't show the message (newer search may have found lyrics!)
- **This is KEY for the advertisement scenario**

---

## The Advertisement Scenario: Detailed Combat Strategy

### Scenario: Advertisement Interrupts Song Search

**What happens with the fix:**

1. **"Miss Dior" search starts** (Search ID: `miss_100_1`)
   - Sets `currentSearchId = "miss_100_1"`
   - Starts checking providers asynchronously

2. **Advertisement plays** (Search ID: `ad_500_2`)
   - Sets `currentSearchId = "ad_500_2"` (OVERWRITES!)
   - The "Miss Dior" search is now "outdated"
   - Starts checking providers for advertisement

3. **Advertisement search finds lyrics**
   - Checks: `currentSearchId === "ad_500_2"`? ✓ YES
   - Updates UI with advertisement lyrics
   - Mission accomplished!

4. **"Miss Dior" search still running in background**
   - Tries more providers (KPoe, Musixmatch, Genius...)
   - After EACH provider: checks `currentSearchId === "miss_100_1"`?
   - Answer: ✗ NO (it's "ad_500_2" now)
   - Aborts immediately, doesn't continue searching

5. **"Miss Dior" search completes with no results**
   - About to show "No lyrics found"
   - Final check: `currentSearchId === "miss_100_1"`?
   - Answer: ✗ NO
   - **ABORTS WITHOUT TOUCHING UI** ✓

**Result:** Advertisement lyrics stay on screen, not overwritten!

---

## Why This Fix is Correct

### It Handles ALL Race Conditions

The fix doesn't just handle advertisements. It handles ANY situation where:
- Songs change rapidly
- User skips through tracks quickly
- Spotify auto-plays next song mid-search
- Any scenario where a new search starts before the old one finishes

### It's Minimal and Efficient

- **2 new global variables** (`currentSearchId`, `searchIdCounter`)
- **3 validation checks** (after async ops, before UI updates)
- **No changes to provider logic** (maintains all existing functionality)
- **No breaking changes** (all existing code still works)

### It's Guaranteed to Work

- Each search gets a **unique ID** (track + timestamp + counter)
- Collision is mathematically impossible
- Only the search with ID matching `currentSearchId` can update UI
- Old searches fail their checks and exit silently

---

## Summary

**Q: What exactly does this fix achieve?**

**A:** It prevents outdated lyrics searches from updating the UI by tracking which search is "current" and aborting any search that's been superseded.

**Q: How is the advertisement situation combatted?**

**A:** When an advertisement starts mid-search:
1. The new advertisement search overwrites `currentSearchId`
2. The old song search becomes "outdated"
3. The old search checks `currentSearchId` after each async operation
4. It detects it's outdated and aborts before touching the UI
5. Only the advertisement search (being "current") can update the UI

**Result:** No more "No lyrics found" overwriting valid lyrics! ✓
