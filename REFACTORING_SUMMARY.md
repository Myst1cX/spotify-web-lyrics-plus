# Genius Lyrics Fetch Refactoring Summary

## Overview
This refactoring removes all translation derivation logic from the Genius lyrics fetching functionality, ensuring that only original (non-translation) Genius lyrics pages are fetched and displayed.

## Key Changes Made

### 1. Removed Translation Derivation Logic
- **Removed functions**: `deriveOriginalUrlFromTranslation()` and `checkUrlExists()`
- **Eliminated logic**: All code that attempted to derive original URLs from translation/cover/fan pages
- **Impact**: The system no longer tries to "fix" translation URLs by converting them to original URLs

### 2. Added Strict URL Filtering
- **New filtering step**: Before applying scoring logic, all search results are filtered using:
  - `isTranslationPage(result)` must return `false`
  - `isSimpleOriginalUrl(result.url)` must return `true`
- **Early exit**: If no valid original URLs are found after filtering, the function continues to the next search query
- **Logging**: Detailed logging shows which candidates are filtered out and why

### 3. Enhanced Error Messaging
- **Old error**: "Lyrics not found on Genius"
- **New error**: "No original lyrics found on Genius - only translation/cover/fan pages available"
- **Clarity**: Users now understand why lyrics weren't found (only translation pages were available)

### 4. Maintained Existing Scoring Logic
- **Preserved**: All existing artist/title matching and scoring algorithms
- **Enhanced**: Added bonus points for confirmed original URLs
- **Applied only to**: Valid (filtered) original URLs

### 5. Files Updated
- `testing.js` - Updated with full refactored logic
- `pip-gui-experimental.user.js` - Updated with refactored logic
- `pip-gui-stable.user.js` - Updated with refactored logic
- `fetch_genius_lyrics.js` - New standalone module with refactored logic

## How It Works Now

### Search and Filter Process
1. **Search**: Query Genius API for song matches
2. **Filter**: Remove all results where:
   - Artist name contains translation keywords
   - Song title contains translation keywords  
   - URL contains translation keywords
   - URL doesn't match simple original URL pattern
3. **Score**: Apply existing scoring logic only to filtered results
4. **Fetch**: Get lyrics only from the best-scoring original URL
5. **Error**: Return specific error if no original URLs found

### Translation Detection
The system detects translation pages by checking for keywords like:
- "translation", "übersetzung", "перевод", "çeviri"
- "russian translations", "deutsche übersetzung", "genius users"
- "traducciones al espanol", "traduzioni italiane", "fan", etc.

### Simple Original URL Pattern
Valid original URLs must match patterns like:
- `https://genius.com/Artist-song-title-lyrics`
- Must not contain translation keywords in the URL path
- Must end with `-lyrics`

## Example Behavior

### Before (with translation derivation):
1. Find translation URL: `https://genius.com/Genius-russian-translations-song-lyrics`
2. Attempt to derive: `https://genius.com/Artist-song-lyrics`
3. Check if derived URL exists
4. Use derived URL if it exists, otherwise use translation URL

### After (original URLs only):
1. Find results including translation URLs
2. Filter out ALL translation URLs completely
3. Only consider: `https://genius.com/Artist-song-lyrics` (if found)
4. Return error if no original URLs found

## Testing
- Created comprehensive test suite validating filtering logic
- All test cases pass, confirming correct behavior:
  - ✅ Original URLs are accepted
  - ✅ Translation pages are filtered out
  - ✅ Fan/cover pages are filtered out
  - ✅ Spanish translations are filtered out

## Benefits
- **Cleaner code**: Removed complex URL manipulation logic
- **Clearer intent**: Only fetches what it's supposed to fetch
- **Better user experience**: Clear error messages when only translations exist
- **Maintainable**: Simpler logic is easier to understand and maintain
- **Reliable**: No more dependency on URL existence checks and derivation algorithms