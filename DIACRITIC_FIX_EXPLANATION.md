# Diacritic Normalization Fix - Detailed Explanation

## The Bug

### What Happened
The Genius lyrics provider was rejecting valid lyrics when song titles contained diacritical marks (accents). This affected many languages including:
- Romanian: ă, â, î, ș, ț
- Spanish: á, é, í, ó, ú, ñ
- French: é, è, ê, ë, à, ç
- German: ä, ö, ü, ß
- Portuguese: ã, õ, á, é, í, ó, ú

### Concrete Example (from bug report)
**Track:** "Seara De Seara" by Stefan Costea (Spotify metadata, no diacritics)  
**Genius Result:** "Seară de seară" by Ștefan Costea (with Romanian diacritics)

**Before Fix:**
```
Target normalized:  "searadeseara"  (from "Seara De Seara")
Result normalized:  "seardesear"    (from "Seară de seară")
                     ^^^^      ^^^^
                     Missing 'a' because 'ă' was deleted!

Match: NO ✗
Penalty: -2 (no title overlap)
Score: 4.73 (below threshold of 6)
Result: REJECTED
```

**After Fix:**
```
Target normalized:  "searadeseara"  (from "Seara De Seara")
Result normalized:  "searadeseara"  (from "Seară de seară")
                                     ă→a conversion!

Match: YES ✓
Penalty: 0 (titles match)
Score: 6.73 (above threshold)
Result: ACCEPTED
```

---

## The Root Cause

### Old Normalization Function
```javascript
function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/gi, '');
}
```

**Problem:** This removes ALL non-alphanumeric characters, including diacritics.

When applied to "Seară":
1. `toLowerCase()` → "seară"
2. `replace(/[^a-z0-9]/gi, '')` → "sear"
   - The "ă" is not in [a-z0-9], so it's deleted!

Result: "seară" → "sear" (loses the 'a' sound)

---

## The Solution

### New Normalization Function
```javascript
function normalize(str) {
  // Use NFD (Canonical Decomposition) to decompose diacritics
  // Then remove the combining marks (Unicode range \u0300-\u036f)
  // This converts: ă→a, é→e, ñ→n, ö→o, etc.
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining marks
    .replace(/[^a-z0-9]/gi, '');
}
```

### How It Works

#### Step 1: NFD Normalization
NFD (Normalization Form Decomposed) separates characters into:
- **Base character** (e.g., 'a', 'e', 'n')
- **Combining mark** (e.g., acute accent, tilde, umlaut)

Example:
- "ă" (single character U+0103) → "a" (U+0061) + "̆" (U+0306 breve)
- "é" (single character U+00E9) → "e" (U+0065) + "́" (U+0301 acute)
- "ñ" (single character U+00F1) → "n" (U+006E) + "̃" (U+0303 tilde)

#### Step 2: Remove Combining Marks
The regex `[\u0300-\u036f]` matches all combining diacritical marks in Unicode.

Removing these leaves just the base characters:
- "a" + "̆" → "a"
- "e" + "́" → "e"
- "n" + "̃" → "n"

#### Step 3: Remove Remaining Non-Alphanumeric
The final `replace(/[^a-z0-9]/gi, '')` removes spaces, punctuation, etc.

### Full Example Walkthrough

Input: "Seară de seară"

1. `toLowerCase()` → "seară de seară"
2. `normalize('NFD')` → "seara de seara" (ă → a + combining breve)
3. `replace(/[\u0300-\u036f]/g, '')` → "seara de seara" (remove breves)
4. `replace(/[^a-z0-9]/gi, '')` → "searadeseara" (remove spaces)

Final: "searadeseara" ✓

---

## Testing Results

### Test Cases
```javascript
// Romanian
"Seară de seară" → "searadeseara" ✓
"Seara de Seara" → "searadeseara" ✓ (matches!)
"Ștefan"        → "stefan"       ✓
"Stefan"        → "stefan"       ✓ (matches!)

// Spanish
"Niño"          → "nino"         ✓
"Nino"          → "nino"         ✓ (matches!)

// French
"Café"          → "cafe"         ✓
"Cafe"          → "cafe"         ✓ (matches!)

// German
"Über"          → "uber"         ✓
"Uber"          → "uber"         ✓ (matches!)

// Portuguese
"São"           → "sao"          ✓
"Sao"           → "sao"          ✓ (matches!)
```

All tests pass! Titles with and without diacritics now normalize to the same value.

---

## Impact

### Positive Effects
1. **More matches:** Songs with diacritics now match correctly
2. **Language support:** Works for all Latin-script languages with diacritics
3. **Artist matching:** `normalizeArtists()` calls `normalize()`, so artists benefit too
4. **Backward compatible:** Songs without diacritics still work exactly the same

### Score Impact for Bug Report Case
```
Before fix:
  Artist score:  4.73
  Title score:   2.00
  Penalty:      -2.00 (no title overlap)
  Final score:   4.73 ❌ (below threshold of 6)

After fix:
  Artist score:  4.73
  Title score:   2.00
  Penalty:       0.00 (titles match!)
  Final score:   6.73 ✅ (above threshold of 6)
```

---

## Technical Details

### Unicode Normalization Forms
- **NFC (Composed):** Combines base + mark into single character (é)
- **NFD (Decomposed):** Separates into base + mark (e + ́)
- **NFKC/NFKD:** Compatibility forms (also handles full-width, etc.)

We use NFD because:
1. It makes diacritics explicit as separate marks
2. We can then remove all marks with a single regex
3. This leaves clean base characters

### Combining Diacritical Marks Range
- Unicode range: U+0300 to U+036F
- Covers: acute, grave, circumflex, tilde, umlaut, macron, breve, etc.
- See: https://en.wikipedia.org/wiki/Combining_Diacritical_Marks

---

## Why This Works Better Than Alternatives

### Alternative 1: Manual Character Mapping
```javascript
// DON'T DO THIS
str.replace(/[àáâãäå]/g, 'a')
   .replace(/[èéêë]/g, 'e')
   .replace(/[ìíîï]/g, 'i')
   // ... 50+ more lines for all diacritics
```
**Problems:**
- Incomplete (can't cover all Unicode)
- Hard to maintain
- Easy to miss characters

### Alternative 2: Remove All Unicode
```javascript
// DON'T DO THIS
str.replace(/[^\x00-\x7F]/g, '')
```
**Problems:**
- Removes the character entirely (seară → sear)
- Loses phonetic information
- Same bug we had before!

### Our Solution: NFD + Remove Marks
**Advantages:**
- ✅ Complete (handles all Unicode diacritics)
- ✅ Maintainable (2 lines of code)
- ✅ Preserves base character (seară → seara)
- ✅ Standard Unicode approach

---

## Affected Code

### Direct Changes
- `normalize()` function (line 1913) - main fix

### Indirect Benefits
- `normalizeArtists()` (line 1925) - calls `normalize()`, so artists with diacritics now match
- All Genius matching logic - uses `normalize()` for title comparison
- Score calculation - better matches → fewer penalties → higher scores

---

## Conclusion

This fix solves the diacritic matching problem by using Unicode normalization (NFD) to properly convert accented characters to their base forms, rather than deleting them. This allows the Genius provider to match lyrics correctly regardless of whether the metadata includes diacritics or not.

**Result:** Valid lyrics are no longer rejected due to diacritical differences! 🎉
