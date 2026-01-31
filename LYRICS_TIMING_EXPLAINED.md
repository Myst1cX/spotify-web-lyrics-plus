# Lyrics Timing System - How It Works

## Overview
The lyrics timing system uses two separate timing concepts that work together to provide smooth, adjustable lyric synchronization.

---

## Two Different Timing Concepts

### 1. Polling Rate (HIGHLIGHT_INTERVAL_MS = 50ms)
**What it is:** How frequently the script checks the playback position.

**Location in code:**
```javascript
// Line 99 - Constant definition
HIGHLIGHT_INTERVAL_MS: 50,

// Line 825 - Used in setInterval
}, TIMING.HIGHLIGHT_INTERVAL_MS);
```

**Purpose:** Creates a smooth animation by checking 20 times per second (1000ms ÷ 50ms = 20 checks/second)

**Why 50ms?**
- Fast enough for smooth highlighting (20 FPS)
- Not so fast that it wastes CPU resources
- Balances responsiveness with performance

---

### 2. Anticipation Offset (User Adjustable)
**What it is:** The timing adjustment that shifts when lyrics appear.

**Default value:** 1000ms (lyrics appear 1 second early)  
**Range:** -5000ms to +5000ms  
**Stored in:** localStorage as "lyricsPlusAnticipationOffset"

**Location in code:**
```javascript
// Line 712-717 - Get/Set functions
function getAnticipationOffset() {
  return Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 1000);
}
function setAnticipationOffset(val) {
  localStorage.setItem("lyricsPlusAnticipationOffset", val);
}

// Line 785 - Applied to playback position
const anticipatedMs = curPosMs + getAnticipationOffset();
```

**Purpose:** Allows users to fine-tune when lyrics appear relative to the audio

---

## How They Work Together

Every 50ms (the polling rate), the script executes this logic:

```javascript
highlightTimer = setInterval(() => {
  // 1. Get current playback position from Spotify
  const posEl = document.querySelector('[data-testid="playback-position"]');
  const curPosMs = timeStringToMs(posEl.textContent);
  
  // 2. Apply the user's timing offset
  const anticipatedMs = curPosMs + getAnticipationOffset();
  
  // 3. Find which lyric line should be active
  let activeIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (anticipatedMs >= (lyrics[i].time ?? lyrics[i].startTime)) {
      activeIndex = i;
    } else break;
  }
  
  // 4. Highlight the active line
  // ... styling code ...
  
}, TIMING.HIGHLIGHT_INTERVAL_MS); // Runs every 50ms
```

---

## Example Scenario

**Track playing at 10.000 seconds (10,000ms)**

| User Offset | Anticipated Position | Effect |
|-------------|---------------------|---------|
| +1000ms (default) | 11,000ms | Lyrics appear 1 second **early** |
| +2000ms | 12,000ms | Lyrics appear 2 seconds **early** |
| 0ms | 10,000ms | Lyrics appear **exactly** on time |
| -500ms | 9,500ms | Lyrics appear 0.5 seconds **late** |
| -1000ms | 9,000ms | Lyrics appear 1 second **late** |

---

## User Interface

### Adjustment Control
Located in the popup UI:
```
Adjust lyrics timing (ms):
lower = appear later, higher = appear earlier

[▲]
[ 1000 ]  ← Input field with spinner buttons
[▼]
```

- **Range:** -5000 to +5000
- **Step:** 50ms increments
- **Updates:** Immediately on change

### When User Adjusts the Offset

```javascript
// Line 3707-3716 - saveAndApplyOffset()
function saveAndApplyOffset() {
  let val = parseInt(offsetInput.value, 10) || 0;
  if (val > 5000) val = 5000;
  if (val < -5000) val = -5000;
  offsetInput.value = val;
  setAnticipationOffset(val);                                    // Save to localStorage
  if (currentSyncedLyrics && currentLyricsContainer) {
    highlightSyncedLyrics(currentSyncedLyrics, currentLyricsContainer);  // Restart timer
  }
}
```

**What happens:**
1. Validates the input (clamps to -5000 to +5000)
2. Saves to localStorage (persists across page reloads)
3. Restarts the highlight timer with the new offset
4. New timing takes effect immediately

---

## Why This Design?

### Separation of Concerns
- **Polling rate** is a technical detail (how often to check)
- **Offset** is a user preference (when lyrics should appear)

### Performance
- 50ms polling is efficient (20 checks/second)
- Changing offset doesn't affect polling rate
- Single timer handles all highlighting

### User Control
- Users can fine-tune timing for their system
- Different audio setups may have different delays
- Bluetooth headphones often need negative offset
- Wired headphones may need positive offset

---

## Common Misconceptions

### ❌ "The 50ms interval means I can only adjust by 50ms increments"
**Wrong!** The polling rate (50ms) and the offset adjustment are independent.
- Polling rate: How often the script checks
- Offset: How much time is added/subtracted
- You can set offset to any value (e.g., 1234ms) regardless of the 50ms polling

### ❌ "Changing the offset requires changing the interval"
**Wrong!** The offset is simply added to the current position during each check.
- The interval stays at 50ms
- The offset is read fresh on every check
- No need to restart or reconfigure the interval

### ✅ "The offset shifts when lyrics appear, not how often they're checked"
**Correct!** Think of it like this:
- The script asks "what time is it?" every 50ms
- The offset adjusts the answer: "it's actually 1 second later than you think"
- The script then highlights based on that adjusted time

---

## Technical Notes

### Why Default to +1000ms?
Most users prefer to see lyrics slightly ahead of the audio:
- Gives time to read the line before it's sung
- Better for learning song lyrics
- More pleasant user experience

### Why Allow Negative Values?
Some scenarios need lyrics to appear late:
- Bluetooth audio delay compensation
- Network streaming delays
- Personal preference for "singalong" mode

### Why 50ms Polling?
- **Too fast** (e.g., 10ms): Wastes CPU, no visible benefit
- **Too slow** (e.g., 200ms): Jerky highlighting, poor UX
- **50ms**: Sweet spot for smooth highlighting at 20 FPS

---

## Conclusion

The "Adjust lyrics timing (ms)" feature **works correctly**. The 50ms interval is the polling rate, not a limitation on the offset adjustment. Users can set any offset value, and it will be applied accurately during each 50ms check cycle.

**TL;DR:**
- ⏱️ **50ms** = How often to check (polling rate)
- ⚙️ **Offset** = When lyrics appear (timing adjustment)
- ✅ **Both work together** = Smooth, adjustable synchronization
