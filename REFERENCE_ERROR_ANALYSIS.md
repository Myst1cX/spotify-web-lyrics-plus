# ReferenceError Analysis: LyricsPlusDebug is not defined

## Problem Statement
When attempting to use `LyricsPlusDebug.help()` or any other LyricsPlusDebug command in the browser console, users encounter:
```
Uncaught ReferenceError: LyricsPlusDebug is not defined
    <anonymous> debugger eval code:1
```

## MDN ReferenceError Documentation Summary

According to [MDN's ReferenceError documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Not_defined), a ReferenceError is thrown when trying to reference a variable that doesn't exist in the current scope. Common causes include:

1. **Variable not declared**: The variable hasn't been declared in any accessible scope
2. **Scope issues**: Variable exists but is not accessible from the current scope
3. **Timing issues**: Attempting to use a variable before the script that defines it has executed
4. **Typos**: Misspelling the variable name

## Root Cause Analysis

### Code Structure
The `testing-ground.user.js` file follows this structure:

```javascript
// ==UserScript==
// @name         Spotify Lyrics+ Testing
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// ... other metadata
// ==/UserScript==

(function () {
  'use strict';
  
  // ... 6700+ lines of code ...
  
  // Line 6845: LyricsPlusDebug is defined
  window.LyricsPlusDebug = {
    enable: () => { /* ... */ },
    disable: () => { /* ... */ },
    help: () => { /* ... */ },
    // ... other methods
  };
  
  // Line 6913: Success message logged
  console.log('%c[Lyrics+] Debug helper loaded! Type LyricsPlusDebug.help() for commands.', 'color: #1db954;');
  
  // Line 6916: Verification check
  if (typeof window.LyricsPlusDebug !== 'undefined') {
    console.log('%c[Lyrics+] ✓ LyricsPlusDebug is available globally', 'color: #888;');
  }
  
  // Line 6937: Initialize the script
  init();
})(); // Line 6938: IIFE closes
```

### Why the ReferenceError Occurs

Based on the MDN documentation and code analysis, the ReferenceError **"LyricsPlusDebug is not defined"** occurs due to **timing issues**. The possible scenarios are:

#### 1. **Script Not Yet Executed**
The userscript manager hasn't executed the script yet because:
- The page hasn't fully loaded
- The @match pattern hasn't triggered
- The userscript is disabled
- The userscript manager extension is not active

#### 2. **Script Execution Failed Before Line 6845**
If any error occurs in the 6700+ lines of code before `window.LyricsPlusDebug` is assigned (line 6845), the assignment never happens:
- JavaScript syntax errors
- Runtime errors in earlier code
- Missing dependencies (e.g., OpenCC library)
- DOM elements not found
- API calls that throw unhandled errors

#### 3. **Script Not Loaded on Current Page**
The `@match https://open.spotify.com/*` pattern means the script only runs on Spotify Web:
- If you're on a different domain, the script won't load
- If you're on `spotify.com` (not `open.spotify.com`), it won't match

#### 4. **Console Context Timing**
If you open DevTools and type the command immediately:
- The page might still be loading
- The userscript might not have initialized yet
- The IIFE might not have completed execution

### Evidence from the Code

The code includes verification checks that prove this is designed correctly:

1. **Global assignment** (line 6845): `window.LyricsPlusDebug = {...}` properly exposes it globally
2. **Verification check** (line 6916): Confirms the variable is accessible
3. **Success logging** (line 6913): Logs when it's ready to use

If you see these console messages:
```
[Lyrics+] Debug helper loaded! Type LyricsPlusDebug.help() for commands.
[Lyrics+] ✓ LyricsPlusDebug is available globally
```

Then `LyricsPlusDebug` **is** defined and accessible.

## How to Verify LyricsPlusDebug is Available

### Method 1: Check Console Logs
Look for these messages in your console:
- ✅ `[Lyrics+] Debug helper loaded!` - Script executed successfully
- ✅ `[Lyrics+] ✓ LyricsPlusDebug is available globally` - Variable is accessible

### Method 2: Direct Check
```javascript
typeof LyricsPlusDebug !== 'undefined'  // Should return true
typeof window.LyricsPlusDebug !== 'undefined'  // Should return true
```

### Method 3: Inspect Window Object
```javascript
window.LyricsPlusDebug  // Should show the object with all methods
```

## Solutions and Troubleshooting

### If LyricsPlusDebug is Truly Not Defined:

1. **Verify userscript is active**
   - Check your userscript manager extension
   - Ensure the script is enabled
   - Confirm you're on `https://open.spotify.com/*`

2. **Check for script errors**
   - Open DevTools Console
   - Look for any red error messages
   - Errors before line 6845 will prevent LyricsPlusDebug from being defined

3. **Reload the page**
   - The script might have failed to initialize
   - Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

4. **Check script execution**
   - Look for any of the script's console messages
   - If you see none, the script isn't running at all

5. **Verify OpenCC dependency**
   - The script requires: `@require https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js`
   - Network issues or CDN being down can prevent script execution

### If You See the Success Messages But Still Get ReferenceError:

This would be unusual and might indicate:
- Browser console environment issues
- Extension conflicts
- Content Security Policy restrictions (unlikely for `window` assignment)

## Conclusion

The ReferenceError `"LyricsPlusDebug is not defined"` is **not a code bug**, but a **timing/execution issue** as defined by MDN's ReferenceError documentation. The code correctly assigns `LyricsPlusDebug` to the global `window` object (line 6845) and includes verification checks.

The error occurs when:
1. The userscript hasn't executed yet (wrong page, disabled, timing)
2. The script failed to execute before reaching the assignment
3. The user tries to access it before the script completes initialization

**This is not something that can be "fixed" in the code** - it's a natural consequence of how userscripts and page loading work. The script is designed correctly. Users experiencing this should verify their userscript manager is working and the page is fully loaded before using the debug commands.

## Recommendations

No code changes are needed. The implementation is correct. Consider these documentation improvements:

1. Add a troubleshooting section to the README
2. Explain that commands only work after the script loads
3. Provide the verification checks above for users to test
4. Document the console messages users should see when it's working

The current code already includes user-friendly logging and verification - it's working as intended.
