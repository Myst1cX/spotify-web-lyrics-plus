// ==UserScript==
// @name         Spotify Lyrics+ Dev
// @namespace    https://github.com/Myst1cX/spotify-web-lyrics-plus
// @version      17.50.dev
// @icon         https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/icons/icon.png
// @description  Display synced and unsynced lyrics from multiple sources (LRCLIB, Spotify, KPoe, Musixmatch, Genius) in a floating popup on Spotify Web. Both formats are downloadable. Optionally toggle a line by line lyrics translation. Lyrics window can be expanded to include playback and seek controls.
// @author       Myst1cX
// @match        *://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      genius.com
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-dev.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-dev.user.js
// ==/UserScript==

// ADDED (17.49): CHROMIUM PIP SEEK/PLAY/PAUSE BUTTONS VIA MEDIASESSION
// Chromium's native video-PiP overlay draws play/pause/seek buttons from registered
// navigator.mediaSession action handlers, not from whether pipVideo is actually seekable -
// pipVideo is a MediaStream via canvas.captureStream(), which has no real seekable ranges
// and (per Chromium's docs) can also cause the play/pause button to be hidden unless
// mediaSession 'play'/'pause' handlers are registered explicitly.
// Added setupPipMediaSessionHandlers()/teardownPipMediaSessionHandlers(), registering
// 'play', 'pause', 'seekbackward', 'seekforward' on native enterpictureinpicture and
// clearing them on leavepictureinpicture, so we're not silently hijacking OS/hardware
// media-key behavior while PiP is closed. The seek handlers offset from a best-effort
// current position (new getSpotifyPositionMs()) by details.seekOffset (falling back to
// a 10s default) and call the existing seekTo(), clamped to [0, track duration].
// seekTo() and its helpers (findSpotifyRangeInput, applySeekEndBuffer, formatMs) used to
// be declared inside createPopup(), so they were only reachable while the lyrics popup
// happened to exist - not usable by these PiP handlers, which can fire independently of
// the popup. Hoisted all four to top-level scope (same fix pattern as 17.43's
// showTransliterationInPopupFor); createPopup()'s own callers (updateProgressUIFromSpotify,
// the progress bar's manual seek) are unaffected and now just resolve the same functions
// via closure over the outer scope.
// Firefox's native PiP overlay does not consult MediaSession for its own seek buttons (see
// pip-seek-controls-analysis.md) - this remains a Chromium-only enhancement and is simply
// inert, not harmful, elsewhere. Document Picture-in-Picture (the fuller cross-browser fix)
// is a separate, larger change and intentionally not part of this one.

// RESOLVED (17.48): POPUP COULDN'T BE DRAGGED/RESIZED OVER SPOTIFUCK'S BOTTOM NAV BAR
// The popup could be dragged/resized over almost anything on the page except Spotifuck's
// bottom nav bar (#sp-bottom-nav) - the popup itself kept extending normally into that
// area, but rendered underneath the nav bar instead of on top of it, like the nav bar
// had a permanent higher priority no matter what. Cause: createPopup() was attaching the
// popup inside Spotify's own `.main-view-container` element instead of directly under
// `document.body` (the root element the whole page hangs off of). Spotify applies a CSS
// property called "containment" (`contain: layout`) to that container for its own scroll
// performance, and a side effect of that property is that it creates what's called a new
// "stacking context" - basically a separate layering group. Once an element is inside one
// of these groups, its z-index (which controls what renders on top of what) only gets
// compared against other things inside that same group - it's blind to anything outside
// it. The popup's z-index (100000) is already far above the nav bar's (9999), but that
// comparison never happened, because the popup was sealed inside `.main-view-container`'s
// layering group while the nav bar sits outside it entirely, in a different container
// (`.Root__main-view`). Whatever layering position `.main-view-container` as a whole
// happened to have relative to the nav bar, the popup inherited - regardless of its own,
// much higher z-index.
// Fix: the popup is now always attached directly under `document.body` instead of
// `.main-view-container`, so it's no longer sealed inside that layering group and its
// z-index (100000) gets compared directly against the nav bar's (9999), like it should
// have been the whole time.
// This doesn't affect where the popup appears by default or where it's remembered
// to reopen - both are calculated from the browser window's own width/height
// (window.innerWidth/innerHeight) or read straight off an element's on-screen
// position via getBoundingClientRect(), neither of which cares what the popup's
// parent element is. Only the layering problem is fixed.

// RESOLVED (17.47): REMOVED THE PERMANENT NOWPLAYINGVIEW-HIDING CSS (CONFLICTED WITH SPOTIFUCK)
// This script used to inject a permanent style rule collapsing the
// `.zjCIcN96KsMfWwRo` panel container to zero-width any time it contained
// NowPlayingView (`.zjCIcN96KsMfWwRo:has([aria-label="Now playing view"]),
// .zjCIcN96KsMfWwRo:has(.NowPlayingView) { min-width:0; max-width:0;
// flex-basis:0; overflow:hidden; }`), plus a rule hiding Spotify's own
// "Show Now Playing view" button (`.wJiY1vDfuci2a4db { display:none; }`).
// That was fine on its own, but breaks when this script is run alongside
// the new version of Spotifuck/SpotiKit desktop ++ (those are two separate 
// userscripts many users, myself included, run together with this one for 
// the rest of its UI/playback changes):
// Spotifuck/SpotiKit desktop ++ now have their own dedicated Now Playing view button and guard, which
// opens/closes NPV by toggling the real panel's aria-hidden state. We had to delete the CSS above since it
// ran independently and could force the panel to zero-width regardless, so even a legitimate open through 
// Spotifuck's own button could render completely invisible. 
// Fix: removed the style injection entirely. NowPlayingView's visibility is
// no longer touched by this script at all. 

// RESOLVED (17.46): TRANSLATION NOW PARTICIPATES IN THE ACTIVE-LINE HIGHLIGHT TOO
// highlightSyncedLyrics() now walks every sub-line after a lyric via updateSubLines(p, active),
// so translation (previously ignored, stuck gray forever) gets its own active/inactive state
// alongside transliteration. Active-line green for lyric, transliteration, and translation is
// now a deliberate three-step hierarchy (solid #1db954, then rgba(45,205,100,0.85), then
// rgba(60,225,120,0.7)) instead of a flat green/gray split, pulled into shared constants
// TRANSLATION_ACTIVE_COLOR / TRANSLITERATION_ACTIVE_COLOR so the main popup and PiP's
// flattenPipBlockRows() can't drift out of sync again - color codes unified.

// RESOLVED (17.45): PIP'S ACTIVE-LINE TRANSLITERATION NOW MATCHES THE MAIN POPUP'S BOLD STYLE
// In the main popup, highlightSyncedLyrics() makes the current line's transliteration
// both green AND bold (fontWeight 700) to match the highlighted lyric above it. PiP's
// canvas renderer only copied the green color, not the bold (oversight on my part).
// flattenPipBlockRows() drew every sub-line (translation and transliteration alike) 
// in the same regular-weight font.
// Now it prepends "bold" to that line's font specifically when it's transliteration on
// the active line, so PiP's highlight matches the popup exactly. 

// RESOLVED (17.44): TRANSLATION TEXT ONLY SHRINKS WHEN TRANSLITERATION IS ALSO ON-SCREEN
// Refines 17.42: with just original lyric + translation, translation stays full size again.
// It only drops to the smaller 0.85em (matching transliteration) once both sub-lines are
// showing together. Works whichever gets turned on first - translateLyricsInPopup() checks
// transliterationPresent to pick the right size when creating translationDiv, while
// showTransliterationInPopupFor() shrinks an already-showing translation the moment
// transliteration is added, and removeTransliterationLyricsFor() grows it back to full
// size once transliteration is turned off again.

// RESOLVED (17.43): FIXED A SILENT CRASH THAT COULD LEAVE THE WRONG PROVIDER CACHED
// FINDING: showTransliterationInPopup() only existed inside createPopup(), but
// updateLyricsContent() and loadLyricsFromCache() - which live outside it - called it too.
// For any song with transliteration turned on, this threw "ReferenceError: not defined" and
// stopped those functions partway through, before they could reach LyricsCache.set(). Net
// effect: picking a different provider (e.g. KPoe) for an already-cached song looked like it
// worked, but the cache silently kept the old provider (e.g. LRCLIB), so replaying the song
// later reverted back to it.
// FIX: Moved the real logic to two top-level functions, showTransliterationInPopupFor(lyricsContainer)
// and removeTransliterationLyricsFor(lyricsContainer), that any function can call regardless of
// scope. createPopup()'s original versions now just forward to these.

// RESOLVED (17.42): TRANSLATION TEXT NOW MATCHES TRANSLITERATION'S SMALLER FONT SIZE
// translationDiv now sets fontSize: '0.85em' (same as transliterationDiv), so in the
// popup, translation is no longer full lyric size when shown alongside transliteration -
// matches the sizing PiP already used for both sub-lines.

// RESOLVED (17.41): TRANSLITERATION BUTTON NOW USES A DEDICATED SVG ICON
// transliterationToggleBtn now renders a custom SVG glyph (A / arrow / arrow / 拼)
// in place of the 🔡 emoji, matching the style of the other header buttons
// (currentColor fill, full 0-24 viewBox, no extra padding wrapper - same
// convention as translationToggleBtn). The 拼 character is sourced from Noto
// Sans CJK SC Bold via fonttools for an accurate glyph outline. 

// RESOLVED (17.40): KPOE 5-ATTEMPT NORMALIZATION NO LONGER GUARANTEES A 400 ON NON-LATIN-SCRIPT SONGS
// FINDING: Utils.normalize() keeps only ASCII word characters plus a small punctuation
// allowlist (see its regex) - built to strip accents/diacritics from Latin text (e.g.
// "cafe" -> "cafe"), but on a title/artist made entirely of non-Latin-script characters
// (Japanese, Cyrillic, Arabic, etc.) there's nothing in that allowlist for it to keep, so it
// silently deletes the whole field instead of normalizing it. Real logs: Songs "夜に駆ける" and
// "アイドル" (by YOASOBI) both normalized to "" on the title-normalizing attempts, producing
// a request URL with `title=` empty - guaranteed 400 (missing required params: title and
// artist, or isrc, or platformId) on whichever server got asked, wasting a request that could
// never have found anything.
// Fix: rather than hardcode which scripts count as "non-Latin" (which would need constant
// upkeep and still miss cases), check normalize()'s own output - if a field had real input but
// normalizing it produced nothing, the normalization was destructive, not useful, so fall back
// to the raw value for that attempt instead (`Utils.normalize(x) || x || ""`). Side effect: for
// an all-non-Latin field, the "normalized" attempt now resolves to the same combo as an earlier
// raw attempt, so the existing `triedCombos` dedup (17.39) skips it outright - no new dedup
// logic needed, no wasted request, no guaranteed-400 attempt burned on a search that already
// has better ways to spend its 5 attempts.

// RESOLVED (17.39): KPOE PROVIDER SEARCH OVERHAUL - SERVER CASCADE NOW CLASSIFIES FAILURES
// INSTEAD OF TREATING THEM ALL THE SAME, DEDUPES REDUNDANT QUERIES, AND NO LONGER GIVES UP
// EARLY WHILE LIVE SERVERS OR BANKED CANDIDATES STILL REMAIN
// Consolidates everything found testing the KPoe cascade (fetchKPoeLyrics) and the 5-attempt
// query loop (ProviderKPoe.findLyrics) against real server logs:
//  - >=500 now catches every server-error code (was only exactly 500/503), so Cloudflare edge
//    codes (502/520/521/522/524) cascade to the next server instead of erroring out on server 1.
//  - 421 (Fastly TLS/SAN routing mismatch, e.g. atomix.one) and 402 (Vercel deployment quota,
//    e.g. the two .vercel.app backups) now cascade to the next server instead of hard-stopping.
//  - 404 now cascades instead of aborting the whole search - real logs showed one server 404
//    while another returned valid lyrics for the identical query (and vice versa), so servers
//    don't share one upstream and a 404 on one says nothing about the rest.
//  - Any other unrecognized 4xx (401/403/405/409/418/etc.) now also cascades instead of
//    silently stopping - >=500 already classifies every server error, so anything left is a
//    4xx by elimination, and every 4xx diagnosed so far is request-specific, not server-down.
//  - A 200 OK response with an empty/missing lyrics body now cascades to the next server too,
//    instead of ending the whole search - some KPoe servers return 200+empty-array for "not
//    found" instead of a proper 404, and that case was silently falling through uncascaded.
//  - The per-attempt server cascade no longer stops at the first any-type success - it keeps a
//    `bestSoFar` candidate and keeps checking remaining servers, only stopping early on Line
//    (synced) type, matching the outer loop's existing Line > Word > None priority.
//  - The 5-attempt loop no longer aborts early just because one attempt's cascade returned
//    "all servers unavailable" - it only gives up once every server is actually,session-wide
//    dead (tracked via `deadServers`), not on a generic error string that also fires from a
//    single query-dependent 404. A live server that only 404'd on one attempt's query still
//    gets a fair shot from a later attempt's differently-normalized query.
//  - Added a `deadServers` Set, shared across all 5 attempts: a server that fails for a
//    session-wide reason (429/421/402/>=500/network-exception) is skipped - no request sent -
//    on every later attempt and cascade. 404/400/unrecognized-4xx are deliberately NOT added,
//    since those depend on the query text and deserve a fresh try each attempt. Once every
//    server is dead, remaining attempts are skipped outright instead of each one recursing
//    through a fully-dead list for nothing.
//  - Added a `triedCombos` Set: an attempt whose resolved {artist, title, album} was already
//    tried this search is skipped outright (no servers touched at all) - Utils.normalize() is
//    a no-op on plain text and an empty album makes includeAlbum true/false identical, so
//    multiple attempts can resolve to the same exact query. The dedup key also mirrors
//    fetchKPoeLyrics' own album-drop rule (album omitted from the request whenever it equals
//    the title), so an includeAlbum:true attempt that collapses to the same URL as an
//    includeAlbum:false attempt is correctly recognized as a duplicate too.
// Current per-status behavior (fetchKPoeLyrics):
//   429/421/402/>=500     -> retry next server, server marked dead for the rest of this search
//   404/other 4xx           -> retry next server, server NOT marked dead (query-dependent)
//   400                      -> return bestSoFar if any, else error - no retry (request itself
//                               is malformed, a different server won't help)
//   network exception        -> retry next server, server marked dead
//   200 + empty lyrics        -> retry next server, server NOT marked dead
//   exhausted servers          -> return bestSoFar if any, else error

// RESOLVED (17.38): LYRICS+ BUTTON INJECTION NO LONGER SPAMS RETRIES/CONSOLE
// buttonInjectionObserver (document.body) and pageObserver (#main) both
// called addButton() unconditionally on every single DOM mutation, which on
// Spotify's constantly-churning UI meant dozens of calls per second. Each
// call, when the mic/lyrics button target wasn't mounted yet, started its
// own independent tryAdd() retry chain (up to BUTTON_ADD_MAX_RETRIES
// setTimeout attempts with DEBUG logging on every attempt/failure) - so many
// overlapping chains ran at once and kept logging even after the button had
// already been successfully injected.
// Root cause: the mic/lyrics button ([data-testid="lyrics-button"]), which
// addButton() inserts next to, only mounts once the full player UI loads -
// which normally only happens once the user actually plays something. There
// was no cheap early-out for "target not mounted yet" or "already injected",
// so every mutation blindly (re)entered the retry machinery.
// Fix: addButton() now returns immediately (no retry chain, no logging) if
// #lyrics-plus-btn already exists, if a retry chain is already in flight
// (new lyricsButtonInjectionInFlight guard), or if the mic button isn't in
// the DOM yet (new lyricsButtonInjected guard tracks success so the
// observers become no-ops afterward). A retry chain now only ever starts
// once the mic button is actually present, i.e. once playback has
// initialized the full player UI, and it runs exactly once.

// RESOLVED (17.37): PIP TOGGLE NO LONGER SHOWS A FALSE "PLAYING IN PIP" NOTICE ON BROWSERS WITHOUT REAL PIP SUPPORT
// togglePip() called pipVideo.requestPictureInPicture() inside a single
// try/catch that also contained the WebKit check and the page-PiP fallback
// below it. On browsers where that call rejects (Gecko-based Android
// browsers - Firefox and its forks - which expose the function on every
// platform but reject it on Android with NotSupportedError, confirmed via
// Mozilla's own "Intent to prototype & ship: Picture in Picture API" notice:
// Android has no native PiP implementation to back it), the await threw
// straight into the outer catch, which just logged the error and returned -
// the WebKit check and fallback a few lines below never ran. Separately, the
// fallback's own notice text ("This video is playing in Picture-in-Picture
// mode") was reused for this case too, describing a PiP window that never
// visually existed, since pipVideo/pipCanvas stay hidden off-screen the
// whole time (applyHiddenPipVideoStyle keeps them at -9999px/1x1px/opacity
// 0). Chromium-based Android browsers (Chrome, Edge, Opera, Brave, Vivaldi -
// same Blink engine as desktop Chrome) are unaffected either way: they
// resolve requestPictureInPicture() genuinely, including for the
// MediaStream/canvas.captureStream() source pipVideo uses here (supported
// since Chrome 71), and get a real floating window.
// Fix: gave requestPictureInPicture() its own try/catch so a rejection falls
// through to the WebKit check and then to a new
// activatePipUnsupportedFallback(), instead of dead-ending. That function
// sets only isPagePipActive (never isPipActive) and skips
// startPipRenderLoop() entirely, since there's nothing to render to.
// enterPipInLyricsContainer() now picks between PIP_ACTIVE_NOTICE_TEXT (real
// sessions) and a new, honest PIP_UNSUPPORTED_NOTICE_TEXT based on
// isPagePipActive, instead of always showing the "playing in PiP" text.

// RESOLVED (17.36): CHINESE CONVERSION TOGGLE NO LONGER WIPES ACTIVE TRANSLATION
// rerenderLyrics() (the Chinese-conversion button handler) rebuilt the whole
// lyrics container from scratch on every toggle: lyricsContainer.innerHTML = ""
// then recreated every <p> line from currentSyncedLyrics/currentUnsyncedLyrics.
// That indiscriminately destroyed the translation/transliteration <div>
// siblings too. Transliteration was then explicitly re-shown afterward (gated
// on STORAGE_KEYS.TRANSLITERATION_ENABLED), but translation had no equivalent
// persisted "was showing" flag, so it just silently disappeared - from both
// the main container and the PiP canvas (getPipLineGroupText() reads live DOM
// siblings of the <p>, so a removed translation div reads as gone there too).
// Root cause: a script conversion never changes line count/order/sync state,
// only the glyphs inside each existing <p> - a full rebuild was never
// necessary for this path in the first place.
// Fix: rerenderLyrics() now just mutates the textContent of each existing
// <p data-lyrics-line-index> in place via convertText() and returns. It no
// longer touches lyricsContainer.innerHTML, no longer needs to reset/restore
// translationPresent/transliterationPresent, no longer re-runs
// highlightSyncedLyrics() or enterPipInLyricsContainer() (nothing was hidden
// or removed to begin with), and translation text itself doesn't need
// re-fetching - Traditional/Simplified are the same underlying language, so a
// translation done against one script is still correct against the other.

// RESOLVED (17.35): PIP STATUS MESSAGES NO LONGER GET SQUISHED/MANGLED WHEN LONG
// drawPipFrame()'s status branch only split currentLyricsStatusMessage on
// literal \n, then handed the resulting line straight to fillText(line,
// centerX, statusY, textMaxWidth). fillText's 4th arg doesn't wrap - it
// horizontally compresses the glyphs to force a too-wide line into that
// width. Long single-line messages with no \n (e.g. the Spotify token
// refresh notice) had no line breaks at all, so the whole sentence got
// squished into one line.
// Fix: each paragraph (already split on \n) is now also word-wrapped to
// textMaxWidth via splitPipTextToLines() - the same helper flattenPipBlockRows()
// uses for the actual lyrics rows - before drawing, and fillText is called
// without a maxWidth argument since every line already fits.

// RESOLVED (17.34):
// • TRANSLATION/TRANSLITERATION COULD LEAK INTO THE MAIN CONTAINER DURING PIP
//   translateLyricsInPopup() and showTransliterationInPopup() insert their
//   result divs directly into lyricsContainer via insertBefore(), which runs
//   *after* enterPipInLyricsContainer() has already hidden the existing lyric
//   lines and shown the "This video is playing in Picture-in-Picture mode"
//   notice. Those newly-inserted divs were never part of that hide pass, so
//   while PiP was active they showed up visible in the main container right
//   alongside the notice - even though the PiP window itself rendered the
//   translation correctly, since it reads the text via data attributes
//   independent of layout/visibility.
//   Fix: new hideElementWhilePipActive()/unhideElementWhilePipActive() helpers.
//   The former hides an element immediately if PiP is currently active and
//   registers it in the same lyricsContainer._pipSavedChildren list that
//   exitPipFromLyricsContainer() already restores from, so it correctly
//   reappears on PiP exit; the latter unregisters an element from that list
//   right before it's removed (removeTranslatedLyrics()/
//   removeTransliterationLyrics()) so the restore step never touches an
//   already-removed node. Called after each translation/transliteration div
//   insertion. (Deliberately not just re-calling enterPipInLyricsContainer()
//   from those paths - the lyric <p> elements are already hidden by that
//   point, so a second call would re-save their already-"none" display as the
//   "original" value and leave lyrics hidden forever after exiting PiP.)
//
// • HEADER SCROLL INDICATOR: NOW UPDATES WHEN BUTTONS DYNAMICALLY SHOW/HIDE
//   updateHeaderScrollIndicator() previously only re-ran on buttonGroup's
//   'scroll' event, a ResizeObserver on buttonGroup itself, and once via
//   requestAnimationFrame at popup creation. chineseConvBtn/
//   transliterationToggleBtn/downloadBtn toggle their own display
//   none<->inline-flex later (updateLyricsContent(), loadLyricsFromCache(),
//   rerenderLyrics(), hideButtonsForInstrumental()) without triggering any of
//   those - a ResizeObserver on buttonGroup fires when buttonGroup's own box
//   changes size, not when a child inside it appears/disappears while
//   flexbox keeps buttonGroup's own width fixed. If one of those buttons
//   popping in after a track loads was what pushed the row into overflow,
//   the scroll track/thumb wouldn't appear until the user happened to
//   scroll or resize the window. Fix: updateHeaderScrollIndicator is now
//   exposed as popup._updateHeaderScrollIndicator and called right after
//   every one of those display-toggle sites.
//
// • HEADER SCROLLBAR: WHEEL LISTENER CLEANUP NOW TARGETS THE RIGHT ELEMENT
//   removePopup() called existing.removeEventListener("wheel", ...) on the
//   popup div, but the listener was attached to headerWrapper - a no-op that
//   was harmless only because the whole subtree gets removed and GC'd right
//   after anyway. Now looked up via existing.querySelector
//   ("#lyrics-plus-header-wrapper") and removed from the correct element.
//
// • HEADER SCROLLBAR: ARROW AUTO-REPEAT AND DRAG NO LONGER GET STUCK
//   headerArrowRepeatTimeout/Interval were plain closure variables, cleared
//   only via a window mouseup/touchend listener - if removePopup() ran while
//   an arrow was held (e.g. the popup torn down by a track/provider event
//   mid-press), nothing stopped the interval, which kept calling
//   scrollButtonGroupBy() against a now-detached buttonGroup and pinned that
//   DOM subtree in memory. Also, only touchend was handled, not touchcancel -
//   an interrupted touch (incoming call, OS gesture, etc.) fires touchcancel
//   instead, so the repeat (and, separately, the scroll-thumb drag state)
//   could get stuck active. Fix: clearHeaderArrowRepeat is now exposed as
//   popup._clearHeaderArrowRepeat and invoked from removePopup(); touchcancel
//   is now handled alongside touchend for both the arrow-repeat and
//   thumb-drag listeners, with matching removePopup() teardown.

// RESOLVED (17.33): IMPROVED THE HEADER'S SCROLLBAR THAT CAN SCROLL BETWEEN HEADER ICONS WHEN OVERFLOWN IN MINIMUM WIDTH MODAL

// RESOLVED (17.32):
// Status changes while PiP was active (e.g. song change ->
// "Loading lyrics..." -> "No lyrics found") could leave the container blank.
// Cause: enterPipInLyricsContainer() re-hid the notice div itself on repeat
// calls, and ensurePipNoticeShown()'s exists-check didn't catch it being
// hidden.
// Fix: exclude the notice from the saved/hidden children set.

// RESOLVED (17.31):
// • HEADER ICON ROW: ADDED A VISIBLE SCROLL INDICATOR + DRAG-TO-SCROLL
//   buttonGroup previously scrolled horizontally on narrow widths with a
//   completely hidden scrollbar (.hide-scrollbar) - there was no visual cue
//   that more icons existed off-screen, and no way to scroll it except a
//   trackpad/touch swipe. Added a thin 1px track (headerScrollTrack) below
//   the header row, with a proportionally-sized thumb (headerScrollThumb)
//   that reflects buttonGroup's scrollWidth/clientWidth/scrollLeft via a new
//   updateHeaderScrollIndicator() function. The thumb is purely visual
//   (pointer-events: none); an invisible, taller hit area layered over the
//   track (headerScrollHitArea, same "invisible hit area over a thin visual
//   element" pattern as the corner resize handle) is what's actually
//   draggable, so it's easy to grab with a mouse or finger without changing
//   the track's 1px visual footprint. Dragging the hit area computes
//   buttonGroup.scrollLeft directly from pointer position along the track
//   (headerScrollPointerToScrollLeft). The indicator is hidden entirely
//   (opacity 0, hit area display:none) whenever buttonGroup isn't actually
//   overflowing. A ResizeObserver on buttonGroup (headerScrollResizeObserver)
//   keeps it in sync as the popup is resized; buttonGroup's own 'scroll'
//   event keeps the thumb tracking scrollLeft during swipes/drags too.
//
// • HEADER ICON ROW: FIXED DRAG-TO-SCROLL FIGHTING WITH POPUP DRAG-TO-MOVE
//   headerWrapper (which contains the new scroll track) is also the popup's
//   drag-to-move handle. Without stopPropagation() in the scroll-thumb's
//   mousedown/touchstart handlers, grabbing the indicator would bubble up
//   and start dragging the whole popup instead of scrolling the icon row.
//   onHeaderScrollDragStart/Move now call stopPropagation() (and
//   preventDefault() for touch) before doing anything else.
//
// • HEADER ICON ROW: ADDED MOUSE-WHEEL HORIZONTAL SCROLLING
//   Added a wheel listener on headerWrapper (onHeaderWheel): scrolling up
//   (negative deltaY) now scrolls the icon row right, scrolling down moves
//   it left - the standard "vertical wheel drives horizontal scroll"
//   convention for horizontally-scrolling UI, so users with a normal mouse
//   (no shift-scroll, no trackpad) can reach icons that scrolled out of
//   view. The listener is a no-op (and lets the page scroll normally)
//   whenever buttonGroup isn't overflowing.
//
// • HEADER ICON ROW: CLOSE BUTTON NO LONGER SCROLLS OUT OF VIEW
//   closeBtn was previously the last child inside buttonGroup itself, so on
//   narrow widths it could scroll off-screen along with every other icon,
//   leaving no way to close the popup without first scrolling all the way
//   right. closeBtn is now appended as a sibling of buttonGroup directly
//   under header (same pattern as titleBar on the left), so it stays
//   permanently visible regardless of buttonGroup's scroll position.
//   buttonGroup itself switched justify-content from flex-end to flex-start
//   and gained flex: "1 1 auto" to correctly claim the remaining header
//   width now that closeBtn no longer counts as one of its children.
//
// • DOWNLOAD BUTTON: RESTORED RIGHT-ALIGNMENT WITHOUT REINTRODUCING OVERFLOW
//   Switching buttonGroup to justify-content: flex-start (needed for the
//   scroll-track math to stay predictable) meant the icon row - starting
//   with the download button - would otherwise hug the left edge with a gap
//   before the close button instead of sitting flush right like before.
//   downloadBtnWrapper now gets margin-left: auto, which visually reproduces
//   flex-end's right-alignment when there's slack space, but - unlike
//   flex-end - collapses to 0 under overflow instead of shoving content past
//   the unreachable left edge, so scrollLeft:0 still shows the download
//   button first and scrolling/dragging right reveals the rest of the icons.
//
// • CLEANUP: ALL NEW LISTENERS/OBSERVERS PROPERLY TORN DOWN IN removePopup()
//   headerScrollResizeObserver is disconnected, the window-level drag
//   listeners (onHeaderScrollDragMove/onHeaderScrollDragEnd) are removed via
//   a new popup._headerScrollDragHandlers reference, and the wheel handler
//   reference is cleared - consistent with the existing _dragHandlers/
//   _resizeHandlers cleanup pattern used for popup move/resize, avoiding the
//   same kind of listener-leak-per-popup-cycle bug fixed for those in 17.21.

// RESOLVED (17.30):
// • HEADER ICONS UNIFIED: ALL BUTTONS NOW SHARE ONE 28x28 BOX + REAL HOVER
//   Every header icon (restore-default, chinese-conv, translation,
//   transliteration, settings, pip, close) now uses the same 28x28 box
//   instead of mismatched fontSize/padding values, so spacing between them
//   is actually equal rather than approximate. Settings gear and translation
//   button were still raw emoji with no hover - replaced both with line-style
//   SVGs that hover-dim like the rest. Close button's oversized "×" glyph
//   replaced with a thin-stroke X SVG in the same box. Download button's SVG
//   had a hardcoded stroke="#fff" blocking its hover color - fixed to
//   currentColor and added the missing hover listeners. Chinese-conv button's
//   old manual padding hack removed (no longer needed with a shared gap).
//   Transliteration button's display toggle switched inline-block →
//   inline-flex so its emoji stays centered instead of block-aligning.
//   buttonGroup gap tightened 4px → 2px → 1px across passes.
//
// • HEADER ICONS: FIXED SPILL-OVER ON NARROW WIDTHS
//   buttonGroup had flexShrink:0, which meant it could never shrink - instead
//   of scrolling on narrow widths it just spilled past the popup's edge.
//   Switched to default flexShrink + minWidth:0 on the group (children stay
//   flexShrink:0 so icons don't distort), so once the group is narrower than
//   its content it scrolls horizontally (hidden scrollbar) instead of
//   overflowing. titleBar set to flexShrink:0 so the title keeps priority.
//
// • DOWNLOAD DROPDOWN: FIXED INVISIBLE CLIPPING
//   Side effect of the fix above: overflow-x:auto on buttonGroup also clips
//   overflow-y, which was silently clipping the dropdown (it opened, just
//   invisible). Moved the dropdown to document.body with position:fixed,
//   position computed from downloadBtn.getBoundingClientRect() on each open.
//   zIndex bumped above the popup's; removePopup() now removes it explicitly
//   since it's no longer a DOM child of the popup.

// RESOLVED (17.29): CREATED A LOGO ICON FOR THE USERSCRIPT

// RESOLVED (17.28):
// • PIP: BACKGROUNDED-TAB REDRAWS NOW WORKER-DRIVEN, MATCHING MAIN CONTAINER'S CADENCE
//   drawPipFrame() was previously kept alive while the tab is hidden/backgrounded
//   by pipFallbackTimer, a plain setInterval firing every 500ms
//   (PIP_FALLBACK_INTERVAL_MS) - 10x coarser than the main container's
//   highlightSyncedLyrics(), which ticks every 50ms (TIMING.HIGHLIGHT_INTERVAL_MS).
//   Since requestAnimationFrame is unconditionally paused on hidden tabs, that
//   500ms fallback was effectively PiP's only redraw source whenever the native
//   PiP window was open and the Spotify tab itself was backgrounded - exactly
//   the normal way PiP gets used. New getPipWorker() spins up a dedicated Worker
//   whose internal setInterval posts a 'tick' message back at
//   TIMING.HIGHLIGHT_INTERVAL_MS; startPipRenderLoop() now calls
//   worker.postMessage('start') instead of arming pipFallbackTimer, and
//   stopPipRenderLoop() posts 'stop'. Workers aren't subject to the page-
//   visibility timer throttling window/document timers get, so this keeps PiP
//   redrawing at the exact same cadence as the main container even while fully
//   backgrounded. pipFallbackTimer/PIP_FALLBACK_INTERVAL_MS are kept as an
//   automatic fallback (with onerror handling) for the rare case a Worker can't
//   be created.
//
// • PIP: FIXED SYNCED LYRICS OCCASIONALLY SKIPPING A LINE
//   Both drawPipFrame() and highlightSyncedLyrics() compute the active line
//   from the same source - Spotify's displayed mm:ss position text - which
//   only updates once per whole second. When two lyric lines land inside the
//   same displayed second, the computed index can jump by 2 in a single read.
//   The main container's CSS transitions and scrollIntoView({behavior:
//   "smooth"}) visually glide through the skipped line so it's never
//   noticeably missing there, but PiP's flat per-frame canvas snapshot had
//   nothing to smooth it, so the skipped line's highlight state was never
//   rendered at all - it would jump straight from line N to N+2, and the
//   user would see line N+1 and N+2 both flash as "caught up" together. New
//   pipRenderedIndex/pipRenderedLyricsRef state in drawPipFrame() decouples
//   the *rendered* index from the *computed* one: forward jumps of 2+ now
//   advance the rendered index by at most one step per redraw, guaranteeing
//   every line is displayed for at least one frame before moving on (closing
//   the gap within ~50-100ms, imperceptibly). Rewinds/seeks and track changes
//   still snap the rendered index immediately - there's nothing to gradually
//   catch up on in those cases.

// RESOLVED (17.27):
// • KPOE SERVERS EXPANDED 3 → 6, WITH RELABELED BACKUPS
//   KPOE_SERVERS grew from [workers.dev, seven.vercel.app, backend.vercel.app]
//   to a 6-entry list, reordered with new primaries: prjktla.my.id (youly's
//   server), atomix.one (meow's mirror), binimum.org (binimum's server), then
//   the original three demoted to backups 3-5 (workers.dev, seven.vercel.app,
//   backend.vercel.app). The cache-stats table (getStats()) and the "loaded
//   from cache" console log (loadLyricsFromCache()) were updated to label all
//   six servers correctly (Primary / Backup 1-5). The retry loop itself
//   (fetchKPoeLyrics) needed no changes since it already indexed generically
//   into the array, so 429/503/500/fetch-error retries now cycle through all
//   six servers automatically.
//
// • PIP: FIXED FIRST-TOGGLE "VIDEO READYSTATE IS HAVE_NOTHING" CRASH
//   requestPictureInPicture() could fire before captureStream() delivered a
//   frame. Added waitForPipVideoReady() (resolves on loadedmetadata/canplay,
//   or a 1s safety timeout); initPipElements() is now async and awaits it,
//   and togglePip() awaits initPipElements() before requesting PiP.
//
// • PIP: REWORKED HOW THE MAIN CONTAINER BEHAVES WHILE ACTIVE
//   Old approach physically moved the <video> into the lyrics container,
//   stacked over hidden lyric lines - moving it after requestPictureInPicture()
//   was found to immediately kill the PiP session. New approach: pipVideo stays
//   permanently in document.body and is never reparented. enterPipInLyrics
//   Container() now just hides the lyric children and shows a new placeholder
//   message ("This video is playing in Picture-in-Picture mode") via a new
//   ensurePipNoticeShown() helper, mirroring the browser's native overlay text.
//   exitPipFromLyricsContainer(), pipVideoDetachIfInContainer() (now a no-op),
//   and rerenderLyrics() were all simplified to match this approach.
//
// • PIP: NON-LYRICS STATUS MESSAGES (LOADING/ERRORS/INSTRUMENTAL) FIXED DURING PIP
//   Previously, if PiP was active when a status like "Loading lyrics...", "No
//   lyrics found from any provider", or an instrumental notice appeared, the
//   container could show that raw text AND the PiP notice at once (a stray
//   text node wasn't hidden by the old child-hiding logic). Fix: new
//   setLyricsStatusMessage() helper centralizes every status-text assignment;
//   while PiP is active it stores the message and calls enterPipInLyrics
//   Container() (which now also strips stray text nodes) instead of writing
//   directly to the container. Every raw lyricsContainer.textContent = "..."
//   call site across the file (loading states, provider errors, cache errors,
//   "no lyrics found", manual provider selection, autodetect phases, track-
//   change resets) was switched to this helper. The PiP canvas (drawPipFrame())
//   now mirrors whatever status message the main container would show (via new
//   currentLyricsStatusMessage variable) instead of a generic "Waiting for
//   lyrics…" placeholder, including multi-line messages like the instrumental
//   notice. currentLyricsStatusMessage is reset to null whenever real lyrics
//   load or the track changes, so stale status text can't leak into a later
//   PiP frame.
//
// • PIP: RENDER LOOP HARDENING + DIAGNOSTICS
//   startPipRenderLoop()/stopPipRenderLoop() restructured: rendering pulled
//   into a standalone drawPipFrame() function, plus a new setInterval fallback
//   timer (pipFallbackTimer, every 500ms via PIP_FALLBACK_INTERVAL_MS) now also
//   drives frame draws alongside the requestAnimationFrame loop, as a backstop
//   in case rAF stalls while the tab isn't focused. Added diagnostic
//   console.info logging in togglePip(), the enter/leave PiP event handlers,
//   startPipRenderLoop(), stopPipRenderLoop(), and a throttled (every 2s) tick
//   log inside drawPipFrame() showing playback position, active line index,
//   and total line count. closePip() is now async and awaits
//   document.exitPictureInPicture() instead of fire-and-forget .catch().
//
// • PIP TOGGLE BUTTON NOW MATCHES SPOTIFY'S NATIVE MINIPLAYER ICON
//   Replaced the hand-drawn 24x24 rectangle-in-rectangle glyph with Spotify's
//   actual "Open Miniplayer" SVG markup (viewBox corrected to 0 0 16 16).
//   Added aria-label ("Open Miniplayer"/"Close Miniplayer"), aria-pressed, and
//   data-active attributes, kept in sync by updatePipButtonState(). Removed
//   the white ↔ #1db954 green color-swap that indicated active state - the
//   icon now always stays white, matching Spotify's own default button
//   styling; state is communicated only via ARIA/data attributes. Button
//   background changed from 'none' to 'transparent'; shape changed from a 4px
//   rounded square to a full circle (borderRadius: '50%') to match Spotify's
//   icon-only tertiary buttons. Existing hover-dim behavior is unchanged.
//
// • SYNCED LYRICS CAN NOW FULLY CENTER NEAR THE END OF A SONG
//   Added ensureLyricsBottomSpacer(), which appends/resizes an invisible
//   spacer <div> (roughly half the container's height) after the last lyric
//   line. Without it, scrollIntoView({block: "center"}) couldn't scroll far
//   enough to center lines near the very end of the lyrics - there wasn't
//   enough room below them - so the last few active lines sat below center
//   instead of centered. Wired into highlightSyncedLyrics(): the spacer is
//   created once and re-sized on every highlight tick so it stays correct if
//   the popup is resized.
//
// • MINOR LOGIC TIGHTENING
//   Re-showing the PiP notice after a lyrics update (updateLyricsContent,
//   loadLyricsFromCache, etc.) is now gated on actually having synced/
//   unsynced lyrics, rather than firing unconditionally whenever PiP happened
//   to be active - avoiding redundant/incorrect notice re-entry when there's
//   nothing to show yet.
//   A handful of dead/commented-out old code blocks (an
//   obsolete "OLD LOGIC: also trying backup servers on 404" block, an old
//   nowPlayingViewBtn || micBtn fallback comment) were deleted outright.

// RESOLVED (17.26.beta - merged to stable build of 17.26): CHINESE CONVERSION IS NOW ALSO REFLECTED IN THE PIP CANVAS
// Had to also fix an issue which made the lyrics+ popup's lyrics container flash despite being
// under the "This video is playing in Picture-in-Picture mode" overlay, upon applying chinese conversion to pip canvas.
// rerenderLyrics() (Chinese conversion toggle): when PiP is active, the video element is kept
// inside the lyrics container while the HTML lyric children are rebuilt silently behind it.
// Old non-video children are removed, new <p> elements are appended with display:none so they
// never become visible, and _pipSavedChildren is updated to point to the new elements.
// The canvas render loop reads the new text from the hidden DOM elements and the PiP window
// reflects the conversion immediately — with no visual flash in the lyrics container.

// RESOLVED (17.25.beta): FIX: PiP now remains open across song transitions by protecting lyricsContainer clears.

// RESOLVED (17.24.beta): ADDED PICTURE-IN-PICTURE (PiP) MODE
// • Toggle PiP button added to the Lyrics+ popup header button group.
// • Canvas+video approach: a hidden <canvas> renders lyrics; a <video> streams the canvas via
//   captureStream(). The video is inserted into the lyrics container when PiP is active.
// • When native PiP opens (requestPictureInPicture), the HTML lyric lines are hidden inside the
//   container and the video element shows the browser's "playing in PiP" placeholder — lyrics only
//   appear in the floating PiP window. When PiP closes, HTML lyrics are restored automatically.
// • Firefox-compatible: uses requestPictureInPicture when available; falls back to WebKit PiP
//   (Safari), then to an inline page-PiP that overlays the video on the lyrics container.
// • Canvas colors match the main lyrics container exactly: active line = #1db954 (Spotify green),
//   context lines = rgba(255,255,255,0.7), transliteration active = #1db954, context = #9a9a9a,
//   translation = rgba(160,160,160,0.9). Background respects AMOLED theme toggle.
// • Font size, transliteration, translation, and Chinese conversion settings all reflected live in
//   PiP via getPipLineGroupText() which reads from the live DOM.
// • PiP play/pause button sends command to Spotify's play/pause button (same mechanism as the
//   Lyrics+ popup's playback controls).
// • PiP volume/mute control correctly mutes/unmutes Spotify Web's volume slider.
// • Closing the Lyrics+ popup automatically closes the PiP window (closePip() in removePopup()).
// • Unsynced lyrics: canvas shows a "View full lyrics in the Lyrics+ popup" message (PiP cannot
//   scroll, so full unsynced display in PiP is not feasible).
// • No observer duplication: PiP resize tracking uses a single ResizeObserver or window resize
//   fallback, both cleaned up when PiP closes. All event listeners are named references.
// • data-lyrics-line-index attribute added to all <p> lyric elements in every rendering path so
//   getPipLineGroupText() can look up transliteration/translation sub-lines from the live DOM.

// RESOLVED (17.23): CONSISTENT SPOTIFY AND MUSIXMATCH TOKEN LOGGING; DETECT INVALID TOKEN AND CLEAR IT AUTOMATICALLY

// RESOLVED (17.22): FIX: CLOSE THE DOWNLOAD DROPDOWN MENU BY CLICKING ON THE DOWNLOAD BUTTON WHILE THE DROPDOWN IS OPENED/CLICKING OUTSIDE THE DROPDOWN MENU.

// RESOLVED (17.21): FIX MEMORY LEAKS IN DRAG AND RESIZE WINDOW EVENT LISTENERS
// • makeDraggable IIFE: the four window event listeners (mousemove, touchmove, mouseup, touchend)
//   were registered as anonymous functions with no way to remove them. Every popup open/close cycle
//   accumulated 4 more permanent window listeners. Fixed by extracting named handler functions,
//   storing them on the popup element as _dragHandlers, and removing them in removePopup().
// • makeResizable IIFE: the same pattern — four window event listeners (mousemove, touchmove,
//   mouseup, touchend) leaked on every popup open/close cycle. Fixed by extracting named handler
//   functions, storing them on the popup element as _resizeHandlers, and removing them in removePopup().

// RESOLVED (17.20): CODE IMPROVEMENTS
// • Added a missing flag initialisation: window.lyricsPlusPopupIsResizing = false;
// • Removed a comment referencing an old FIX_EXPLANATION.md file that's no longer relevant
// • Removed a stale "NEW" feature marker
// • Added line breaks: /n - to "Fetching lyrics from" console logs
// • Implemented automatic stripping of the Bearer prefix from the Spotify token: the user can now directly paste the raw Authorization header value without needing to delete the word "Bearer"

// RESOLVED (17.19): UPDATED CONSOLE LOG MESSAGES TO REFLECT NEW CHANGES
// • Providers LRCLIB, KPoe, Musixmatch, Spotify: Log now reads "Starting lyrics search (synced preferred)" - these providers support synced and unsynced lyrics, prefer synced.
// • Provider Genius: Log now reads "Starting lyrics search (unsynced only)" - Genius only supports unsynced lyrics.

// RESOLVED (17.18): UPDATED CONSOLE LOG MESSAGES TO REFLECT NEW CHANGES
// • "Phase 2" console log message removed
// • "Manual provider Phase 1" console log message added
// • "Autodetect Phase 1" console log message adjusted

// RESOLVED (17.17): FIX KPOE NONE TYPE LYRICS - UNSYNCED LYRIC TYPE (PREVIOUSLY TREATED AS SYNCED)
// •  In some cases, KPoe's Apple source returns lyrics with type: "None" and no timing fields.
//    parseKPoeFormat defaulted missing timestamps to 0, so every line got time: 0,
//    causing highlightLyrics to always land on the last line.
// •  Fix: ProviderKPoe.getSynced now returns null when body.type === "None",
//    causing the caller to fall back to getUnsynced() for correct static display.
// •  Fix: ProviderKPoe.findLyrics priority logic updated to Line > Word > None,
//    so a later attempt returning "Word" or "Line" now replaces a prior "None" result.

// RESOLVED (17.16): SINGLE PROVIDER CALL PER AUTODETECT SESSION
// •  Refactored autodetectProviderAndLoad: each provider (except Genius) is now called only once per track
// •  Phase 1 fetches both synced and unsynced in a single findLyrics call; unsynced results are stored
//    in memory (sessionResults) as a fallback if no provider returns synced lyrics
// •  Phase 2 reuses the stored unsynced result from the highest-priority provider instead of making a
//    second network request; Genius is still called in phase 2 as a last resort (unchanged behavior)
// •  Manual provider tab selection: updateLyricsContent already used a single findLyrics call; now also
//    skips the redundant call when invoked from autodetect by accepting a pre-fetched cachedResult param
// •  Updated Phase 1 log: "Fetching lyrics from providers (synced preferred). Unsynced lyrics will be
//    stored for fallback if needed." and Phase 2 log: "No synced lyrics found. Now displaying unsynced
//    lyrics cached from the highest-priority provider that returned them."
// •  Errors are logged only once per provider per session; all other logging, caching, instrumental and
//    race-condition handling preserved

// RESOLVED (17.15):
// •  Fixed KPoe on manual provider selection not checking for unsynced lyrics when synced fails

// RESOLVED (17.14):
// •  Fixed [KPoe Debug] separator length, added lyrics fetching phase logs (synced/unsynced) and improved console logs readability

// RESOLVED (17.13): DEBUG LOGGING SYSTEM
// • Removed GM_registerMenuCommand('Debug: Enable') and GM_registerMenuCommand('Debug: Disable')
//   and removed DEBUG.enabled flag; all five wrappers (error, warn, info, log, debug) now fire
//   unconditionally — no toggle needed
// • Only ERROR and WARN retain %c CSS styling with colors:
//     ERROR → console.error  color #F44336  Red            font-weight bold
//     WARN  → console.warn   color #FF9800  Amber/Orange   font-weight bold
// • INFO, LOG, DEBUG: drop %c styling entirely — all three route to console.info with the
//   format: emoji [Lyrics+ context] ...args
//   CONTEXT_EMOJI lookup maps each context string (Track, Cache, Provider, UI, …) to an emoji
// • Semantic intent per level (what each level is meant to log):
//     LOG   → song fetching and caching pipeline events only
//                (Cache hit/store/clear/load, Autodetect start/abort/success, Provider success,
//                 Track changed — events that directly represent the data-fetch lifecycle)
//     INFO  → application lifecycle events: UI, Playback, Settings
//                (Popup created/removed, Button injected, Song restarted, OpenCC initialized,
//                 ResourceManager cleanup — high-level state transitions, not raw data flow)
//     DEBUG → verbose low-level developer details
//                (DOM queries, timing, state changes, seekbar, cleanup intervals, observer ops)
// • Menu commands Get Cache Stats, Get Track Info, Get Repeat State: announcement console.log
//   color changed from #1db954 (Spotify green) to #64B5F6 (light blue)

// RESOLVED (17.12): FIX ReferenceError: savePopupState is not defined
// • savePopupState() was defined as a local function inside createPopup(), but
//   observePopupResize() lives at module scope and cannot access locals of createPopup().
//   The mouseupHandler inside observePopupResize() called savePopupState(popup) and threw
//   "ReferenceError: savePopupState is not defined" whenever the user finished resizing.
// • Fix: moved savePopupState() from inside createPopup() to module scope (just above
//   observePopupResize()). The function only reads window.innerWidth/Height and writes to
//   localStorage — it has no dependency on createPopup()'s closed-over variables — so the
//   move is safe. All existing callers inside createPopup() continue to work as before.

// RESOLVED (17.11): FIX DEBUG MESSAGE SPAM
// • Removed DEBUG calls from getCurrentTrackId() and getCurrentTrackInfo() which were
//   called on every interval tick (every 100ms by the progress interval and every 400ms
//   by the polling interval). These were the source of constant console spam when debug
//   mode was enabled via the menu command.
// • Removed: DEBUG.debug('Track', `Track ID extracted: ...`) from getCurrentTrackId()
// • Removed: DEBUG.dom.notFound(...) from getCurrentTrackId() - fired on every tick when element absent
// • Removed: DEBUG.dom.notFound(...) from getCurrentTrackInfo() - fired on every tick when element absent
// • Removed: DEBUG.track.detected(trackInfo) from getCurrentTrackInfo() - fired on every tick
// • Track change events are still properly logged via DEBUG.track.changed() in the polling loop
// • Removed observeSpotifyPlayPause/Shuffle/Repeat calls from the polling interval
//   (startPollingForTrackChange). These were called every 400ms, tearing down and
//   re-creating the three MutationObservers on each tick - causing constant
//   "[ResourceManager] Cleaned up/Registered observer: Play/pause/Shuffle/Repeat button state" spam.
//   The observers are already set up once when the popup controls are first created
//   (setupPlaybackControls), and they self-re-attach via setTimeout when the observed
//   Spotify button node is replaced - no periodic re-creation is needed.
// • Removed DEBUG.debug('Button', 'Lyrics+ button already exists, skipping injection')
//   from addButton(). This message fired on every DOM mutation (buttonInjectionObserver and
//   pageObserver both watch document.body/appRoot with subtree:true), making it extremely
//   chatty during normal Spotify navigation. The early-return itself is kept.
// • Added a guard at the top of observePopupResize(): skips re-attaching resize handlers
//   if popup._resizeMouseupHandler is already set, preventing "[PopupResize] Resize handlers
//   attached" from being logged on every DOM mutation while the popup is open.

// RESOLVED (17.10): IMPROVE KPOE PROVIDER'S "🔄 TRYING BACKUP SERVER X..." LOG POSITION IN CONSOLE
// • Removed the "Trying backup server X..." log from every retry site (429, 503, 500,
//   and catch block). Instead, added a single log at the top of fetchKPoeLyrics that fires
//   when serverIndex > 0 - right after the ━━━ separator and before "Starting lyrics search".
//   This means every backup-server attempt now has the separator FIRST, then the "Trying
//   backup server X..." message, then the standard search header - clear visual grouping.

// RESOLVED (17.9): FIX PREVIOUSLY-CACHED SONGS LOADING INSTANTLY AFTER "DEBUG: CLEAR CACHE"
// • Added cache: 'no-store' to the LRCLIB fetch() options so that provider
//   requests always bypass the browser HTTP cache, consistent with Musixmatch which already
//   used cache: 'no-store'.
// • Made cache: 'no-store' the default fetchOptions for KPoe (was only set for forceReload
//   mode before). The &forceReload=true server-side param is unchanged for force-reload mode.

// RESOLVED (17.8): BUG FIXES AND CODE QUALITY IMPROVEMENTS
// • Fix: translateLyricsInPopup() now uses 'try' and 'finally' to guarantee isTranslating is reset
//   and translateBtn is re-enabled even if an unexpected exception occurs during translation
// • Fix: Progress bar MutationObserver (attachProgressBarWatcher) is now stored on the popup
//   element and explicitly disconnected in removePopup(), preventing a memory leak on each
//   popup open/close cycle
// • Fix: LyricsCache.getStats() field renamed from misleading 'maxSize' (entry count safety
//   limit) to 'maxEntries' to avoid confusion with the byte-based 'maxBytes' field

// RESOLVED (17.7): IMPROVED KPOE'S CONSOLE LOGS FOR BETTER VISIBILITY (ADDED SEPARATORS)
// • KPoe provider: Added ━━━━ separator lines between each server attempt for clear visual grouping
// • KPoe provider: Fixed the 404 response (Track not found on server) to return null immediately instead of trying backup servers
// (backup servers use the same upstream data source so trying them after a 404 is pointless)

// RESOLVED (17.6): FIX 0-BASED INDEX IN "GET CACHE STATS" CONSOLE TABLE
// • Menu command "Debug: Get Cache Stats": Cached songs table now shows indices starting from 1 instead of 0

// RESOLVED (17.5): CONSOLE LOG IMPROVEMENTS
// • Kpoe provider: Console logs now also show which Kpoe server was used to fetch the lyrics
// • Menu command "Debug: Get Cache Stats": "Get Cache Stats" table now has a server info column which reveals from which provider server a certain cached song was fetched

// RESOLVED (17.4): ADDED TWO BACKUP SERVERS TO KPOE PROVIDER CONFIGURATION

// RESOLVED (17.3): FIX KPOE PROVIDER'S CACHED LYRICS NOT UPDATING SYNC STATE
// • Due to Kpoe's cached lyrics storing 'startTime' in seconds when the sync function expected 'time' in miliseconds)
// • Created a normalizeLyricsTimeFormat() helper function:
// • converts startTime (seconds) → time (milliseconds) when needed
// • applies normalization in two locations: in loadLyricsFromCache() - when loading from cache; and in rerenderLyrics() - when re-rendering cached lyrics

// RESOLVED (17.2): GENIUS PROVIDER FIX
// • For not transcribed patterns, return error to prevent caching the transcribed pattern as lyrics
// • return { error: "No lyrics available from Genius" };

// RESOLVED (17.1): ADDITION OF AMOLED THEME TOGGLE

// RESOLVED (17.0): ADJUSTED SPACING BETWEEN HEADER BUTTONS AND BETWEEN LYRIC SOURCE TABS (improves UI in cases of resizing)
// • REMOVED "ONMOUSEENTER" GRAY HOVER HIGHLIGHTING OF HEADER BUTTONS (of btnReset, downloadBtn, chineseConvBtn)

// RESOLVED (16.9): REMOVED AUDIO ELEMENT FALLBACKS (audio element doesn't exist in Spotify Web Player)
// • subsequently removed the getAudioElement command

// RESOLVED (16.8): MOVED DEBUG COMMANDS TO MENU COMMANDS
// • Debug commands now available only via userscript menu (getTrackInfo, getRepeatState, getAudioElement, getCacheStats, clearCache)
// • Removed console-based LyricsPlusDebug API to reduce global scope pollution
// • Fixed grammar: "Now 1 song cached" instead of "Now 1 songs cached"

// RESOLVED (16.7): IMPROVED LYRICS CACHE WITH BYTE-BASED EVICTION
// • Added 6 MB byte limit alongside entry count limit to prevent localStorage overflow
// • Increased safety limit to 1000 entries (actual limit 150-400 songs based on size)
// • Byte limit (6 MB) is now the primary constraint; entry limit is safety fallback
// • Added manual cache clear option in userscript manager menu
// • Renamed constant to CACHE_ENTRY_SAFETY_LIMIT for clarity
// • Cache now automatically evicts based on both entry count and total size
// • Users can cache significantly more songs without storage issues

// RESOLVED (16.6): FIXED THE @MATCH PATTERN (VIOLENT MONKEY DID NOT CONSIDER THE USERSCRIPT AS A MATCHED SCRIPT FOR THE SITE

// RESOLVED (16.5): SPLIT GENIUS FETCH ERROR MESSAGE INTO TWO (DUE TO CONNECTION ERROR/SERVICE UNAVAILABILITY AND DUE TO LACK OF LYRICS)

// RESOLVED (16.4): ABORT LYRICS AUTOFETCH WHEN MANUALLY SELECTING A PROVIDER + SIMPLIFIED ERROR MESSAGES

// RESOLVED (16.3): UPDATED HANDLING OF INSTRUMENTAL TRACKS FOR GENIUS PROVIDER

// RESOLVED (16.2): FIX LYRIC SOURCE TAB HIGHLIGHTING LOGIC AFTER LYRICS FROM CACHED PROVIDER

// RESOLVED (16.1): PREVENT LYRIC SEARCH WHEN ADVERTISEMENT DETECTED

// RESOLVED (16.0): LYRICS CACHING FEATURE + REPEAT ONE SUPPORT
// • Automatic caching of lyrics (up to 6 MB or 1000 songs, typically 150-400 songs)
// • Instant loading from cache (no network delay) for recently played songs
// • Repeat One detection: When song restarts, lyrics automatically scroll back to beginning
// • Smart LRU (Least Recently Used) eviction based on both byte size and entry count
// • User-friendly console logging for all cache operations
// • Debug menu commands for cache operations (getCacheStats and clearCache now available via userscript menu from v16.8 onwards)
// • Persists across page reloads and browser restarts via localStorage
// • Typical storage: 3-6 MB (actual songs cached depends on lyrics size)

// RESOLVED (15.9): FIXED REPLAY BUTTON ISSUE AT END OF SONG
// • Fixed issue where songs with replay enabled would get stuck at the last second
// • Added 200ms buffer when seeking near track end to prevent "ended" state
// • Added detailed debug logging to seekTo() function
// • Created debug helper for troubleshooting (menu commands available via userscrpt menu from v16.8 onwards)

// RESOLVED (15.9): FIXED MOBILE LYRICS MODAL POSITION

// RESOLVED (15.8): FIX "QUEUE" AND "CONNECT A DEVICE" PANELS

// RESOLVED (15.7): FIX HIDING "NOWPLAYINGVIEW" PANEL

// RESOLVED (15.6): POPUP RESTORED STATE FIX

// RESOLVED (15.5): YET ANOTHER KPOE PROVIDER FIX (MORE ACCURATE ERROR HANDLING)

// RESOLVED (15.4): UI TWEAKS (improved readability)

// RESOLVED (15.3): UPDATED TRANSLITERATION FUNCTIONS

// RESOLVED (15.2): ADDED TRANSLITERATION BUTTON AND FUNCTIONS
// Only shows up on KPoe provider, when the scraped lyrics contain transliteration

// RESOLVED (15.1): FIXED KPOE PROVIDER (I HOPE)
// NOTE: If a song previously had lyrics but now doesn't fetch them, it's possible that you exceeded the rate limit.
// Either try again sometime later or try turning on a VPN and refreshing the page. If it now loads the lyrics, your theory is right.

// RESOLVED (15.0): CODE QUALITY & BUG FIX RELEASE
// Duplicate IIFE patterns merged into a single scope (fixed the Reference Error in console)
// Improved code mantainability and reduced bloat
// Added comprehensive DEBUG system with 4 levels (ERROR, WARN, INFO, DEBUG)
// Added specialized loggers: provider, dom, track, ui, perf
// Performance timing for all provider operations
// Memory leak fixes: added a ResourceManager for observer/listener cleanup
// Fixed Genius provider failing to match songs with accented characters
// • Updated normalize() function to use NFD (Unicode Normalization Form Decomposed)
// • Now converts diacritics to base forms: ă→a, é→e, ñ→n, ö→o, etc.
// • Should work for Romanian, Spanish, French, German, Portuguese, and all Latin-script languages
// Fixed stale provider highlighting when reopening lyrics popup
// Fixed thick separator lines (2-5px) caused by collapsed wrapper borders stacking
// Fixed Musixmatch/LRCLIB returning "♪ Instrumental ♪" as synced lyrics
// Autodetect now tries all providers before giving up

// RESOLVED (14.9): FIXED THE ISSUE WHERE ANY ERROR FROM A PROVIDER WOULD SKIP THE REMAINING PROVIDERS AND BREAK THE LYRIC FETCHING LOOP

// RESOLVED (14.8): FIXED FALSE POSITIVE CAUSING GENIUS TO NOT LOAD LYRICS
// Genius provider was incorrectly flagging legitimate song lyrics as translation pages when artist names contained a "fan" substring
// e.g., "Ștefan Costea" matched the translation keyword "fan".

// RESOLVED (14.7): IMPROVED GENIUS LYRICS PROVIDER

// RESOLVED (14.6): UPDATED THE LOGIC FOR HIDNG THE NOWPLAYING VIEW PANEL

// RESOLVED (14.5): FIXED TRANSLATION STATE NOT RELOADING ON LYRICS RESET AND LYRICS DISAPPEARANCE BUG AFTER AN ALREADY SUCCESSFULL FETCH

// RESOLVED (14.4): UPDATED THE TUTORIAL INSIDE THE SPOTIFY MODAL

// RESOLVED (v14.3): GRAYISH GRADIENT STLYLING NOW ALSO APPLIED TO UNSYNCED LYRICS (more friendly to the eyes)

// RESOLVED (v14.2): IMPROVED CHINESE SCRIPT DETECTION - Use OpenCC conversion-based detection instead of regex pattern
// The new approach leverages OpenCC's comprehensive 10,000+ character dictionary for accurate script type identification
// Replaces manual regex pattern with conversion comparison logic (if T→CN changes text, it's Traditional; if CN→T changes text, it's Simplified)

// RESOLVED (v14.1): FIXED CHINESE CONVERSION - use full.js bundle instead of separate t2cn.js/cn2t.js
// The separate files were overwriting each other, causing conversion to fail

// RESOLVED (v14.0): KPOE PROVIDER AND LRCLIB PROVIDER FIXED (MAJOR DUB)

// RESOLVED (v13.6) ADDITION OF TRADITIONAL ⇄ SIMPLIFIED (BIDIRECTIONAL) CHINESE CONVERSION VIA OPEN.CC
// Reference: (https://greasyfork.org/en/scripts/555411-spotify-lyrics-trad-simplified/)

// RESOLVED (v12): ADDED A GITHUB LINK TO REPOSITORY (credits to greasyfork user jayxdcode)

// RESOLVED (v11): ADDITION OF SEEKBAR + COLLAPSING THE LYRIC SOURCE TAB GROUP + SETTINGS UI REVAMP

// RESOLVED (v10.9): PLAYBACK BUTTONS' CORRECT REFLECTION OF PAGE ACTION NO LONGER RESTRICTED TO ENGLISH LOCALE:
// Shuffle button and repeat button icons now clone directly from Spotify's visible DOM elements
// Language-independent detection using computed color (green = active) and SVG path structure
// Shuffle button found by SVG icon patterns instead of aria-label text
// Static SVGs are kept as fallbacks when DOM elements are not available

// NOTE:
// Improve google translation, currently only translates line by line (tho it outputs all lines instantly, line by line causes lack of content awareness = lower quality translation)
// Current id of Spotify advertisement object (we blocked it from getting detected as track in console)
// • Object { id: "Spotify-Advertisement", title: "Spotify", artist: "Advertisement", album: "", duration: 26000, uri: "", trackId: null }

// CONSIDER CONVERTING TO BROWSER EXTENSION:
// Converting the userscript into a browser extension would unlock two things:
// 1. Auto fetch spotify token for user when it expires and apply it --> tried, CSP prevents it. (plan was: maybe for Musixmatch too if user logged in inside browser)

// PROBABLY NOT:
// Add Deezer provider (synced and unsynced)
// deezer.js with api link > https://github.com/bertigert/Deezer-Lyrics-Sync/blob/main/lyrics_sync.user.js
// Fix and uncomment Netease provider; api implementation example: https://github.com/Natoune/SpotifyMobileLyricsAPI/blob/main/src%2Ffetchers.ts

(function () {
  'use strict';

  // ------------------------
  // Shared color constants
  // ------------------------

  // Single source of truth for the active-translation-line tint, used by both
  // highlightSyncedLyrics() (main popup, DOM) and flattenPipBlockRows() (PiP, canvas).
  // Keeping this in one place prevents the two renderers from drifting apart again.
  const TRANSLATION_ACTIVE_COLOR = 'rgba(60, 225, 120, 0.7)';

  // Same idea for the active-transliteration-line color, previously hardcoded as a plain
  // '#1db954' in both renderers. Tuned to sit visually between the solid lyric green
  // (#1db954, opacity 1) and the livelier translation tint above - brighter than
  // the lyric, less saturated/opaque than the translation - since transliteration
  // ranks just below the lyric itself but above translation in importance.
  const TRANSLITERATION_ACTIVE_COLOR = 'rgba(45, 205, 100, 0.85)';

  // ------------------------
  // State Variables
  // ------------------------

  let highlightTimer = null;
  let pollingInterval = null;
  let progressInterval = null; // interval for progress bar updates
  let currentTrackId = null;

  // Race Condition Prevention (fixes bug where advertisements overwrite song lyrics)
  let currentSearchId = null; // Tracks the ID of the currently active lyrics search
  let searchIdCounter = 0; // Monotonically increasing counter for guaranteed unique search IDs

  let currentSyncedLyrics = null;
  let currentUnsyncedLyrics = null;
  let currentLyricsContainer = null;
  let currentLyricsMetadata = null; // Store metadata (including server info for KPoe)
  let lastTranslatedLang = null;
  let translationPresent = false;
  let isTranslating = false;
  let transliterationPresent = false;
  let isShowingSyncedLyrics = false;
  let originalChineseScriptType = null; // 'traditional', 'simplified', or null
  let lastPlaybackPosition = 0;  // Track playback position for repeat detection
  let lastTrackDuration = 0;    // Track duration for repeat detection

  // PiP State
  let pipVideo = null;
  let pipCanvas = null;
  let pipCtx = null;
  let pipAnimationFrame = null;
  let isPipActive = false;
  let isPagePipActive = false;
  let pipResizeObserver = null;
  let pipResizeRafPending = false;
  let pipIgnoreMediaControlEvent = false;
  let pipLastFrameAt = 0;
  let pipWindowResizeFallbackActive = false;
  let pipFallbackTimer = null;
  let pipWorker = null;
  // Match TIMING.HIGHLIGHT_INTERVAL_MS so the PiP canvas redraws at the exact
  // same cadence as the main container's highlightSyncedLyrics(), instead of
  // the old 500ms fallback which was 10x coarser than main, independent of
  // any tab-throttling behavior.
  // Last non-lyrics status message shown in the lyrics container (e.g. "Loading
  // lyrics...", "No lyrics found from any provider", instrumental-track notice).
  // Mirrored into the PiP canvas by drawPipFrame() whenever there are no synced/
  // unsynced lyrics to display yet, so the PiP window always reflects whatever the
  // main container would be showing instead of a generic "Waiting for lyrics…".
  let currentLyricsStatusMessage = null;

  // ------------------------
  // Constants & Configuration
  // ------------------------
  const TIMING = {
    HIGHLIGHT_INTERVAL_MS: 50,        // How often to update synced lyrics highlighting
    POLLING_INTERVAL_MS: 400,         // How often to check for track changes
    OPENCC_RETRY_DELAY_MS: 100,       // Initial delay for OpenCC initialization retries
    BUTTON_ADD_RETRY_MS: 1000,        // Delay between button injection attempts
    DRAG_DEBOUNCE_MS: 1500,           // Debounce time after dragging before auto-resize
    PROGRESS_WATCH_DEBOUNCE_MS: 300,  // Debounce for progress bar watcher
  };

  const LIMITS = {
    OPENCC_MAX_RETRIES: 3,            // Max retries for OpenCC initialization
    BUTTON_ADD_MAX_RETRIES: 10,       // Max retries for button injection
  };

  const STORAGE_KEYS = {
    TRANSLITERATION_ENABLED: 'lyricsPlusTransliterationEnabled',
    TRANSLATION_LANG: 'lyricsPlusTranslationLang',
    TRANSLATOR_VISIBLE: 'lyricsPlusTranslatorVisible',
    FONT_SIZE: 'lyricsPlusFontSize',
    CHINESE_CONVERSION: 'lyricsPlusChineseConversion',
    LYRICS_CACHE: 'lyricsPlusCache_v1',
  };

  // ------------------------
  // PiP Configuration
  // ------------------------
  const PIP_CANVAS_H_PADDING = 60;
  const PIP_CANVAS_DEFAULT_SIZE = 640;
  const PIP_CANVAS_MIN_SIZE = 360;
  const PIP_CANVAS_MAX_SIZE = 1080;
  const PIP_FRAME_THROTTLE_MS = 33;
  const PIP_MEDIA_SYNC_GRACE_MS = 1200;
  const PIP_FALLBACK_INTERVAL_MS = 500;
  const PIP_SAFARI_SHOW_LETTER_STYLE = 'position:absolute;left:calc(100% - 1px);bottom:calc(100% - 1px)';
  const PIP_NOTICE_ID = 'lyrics-plus-pip-notice';
  const LYRICS_BOTTOM_SPACER_ID = 'lyrics-plus-bottom-spacer';
  // Shown while a real PiP window (native or WebKit) is open.
  const PIP_ACTIVE_NOTICE_TEXT = 'This video is playing in Picture-in-Picture mode';
  // Shown instead of the above when isPagePipActive is true, i.e. there is no
  // floating window at all - the browser either lacks PiP entirely or exposes
  // requestPictureInPicture but rejects it (e.g. Firefox on Android, which has
  // no native PiP implementation on that platform). Says so honestly instead of
  // reusing PIP_ACTIVE_NOTICE_TEXT's claim that a PiP window opened, and hints at
  // the toggle since the lyrics are hidden behind this message either way.
  const PIP_UNSUPPORTED_NOTICE_TEXT = "Picture-in-Picture mode isn't available in this browser";

  /**
   * Inserts (or updates) a small placeholder message in the lyrics container while
   * PiP/the PiP fallback is active, so the main container doesn't look blank/broken
   * with the lyric lines hidden. `message` distinguishes a genuine PiP session from
   * the unsupported fallback - see enterPipInLyricsContainer().
   */
  function ensurePipNoticeShown(lyricsContainer, message) {
    if (!lyricsContainer) return;
    let notice = lyricsContainer.querySelector(`#${PIP_NOTICE_ID}`);
    if (!notice) {
      notice = document.createElement('div');
      notice.id = PIP_NOTICE_ID;
      Object.assign(notice.style, {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: '15px',
        lineHeight: '1.5',
        padding: '24px 12px',
        textAlign: 'center',
      });
      lyricsContainer.appendChild(notice);
    }
    notice.textContent = message;
  }

  /**
   * Sets a transient, non-lyrics status message (e.g. "Loading lyrics...", "No lyrics
   * found from any provider", an instrumental-track notice) on the lyrics container.
   *
   * While PiP is active, the raw text is NOT written into the main container — it
   * would otherwise sit right next to (or, after a prior textContent wipe, get
   * orphaned alongside) the "This video is playing in Picture-in-Picture mode"
   * notice, showing two messages at once. Instead the main container shows only the
   * PiP notice, and the status text is stored so drawPipFrame() can mirror it inside
   * the PiP window itself, where it belongs while no synced/unsynced lyrics exist yet.
   */
  function setLyricsStatusMessage(lyricsContainer, message) {
    currentLyricsStatusMessage = message;
    if (!lyricsContainer) return;
    if (isPipActive || isPagePipActive) {
      enterPipInLyricsContainer();
    } else {
      lyricsContainer.textContent = message;
    }
  }

  /**
   * Resolves once the video has enough data (readyState > HAVE_NOTHING) to be handed to
   * requestPictureInPicture(). Needed because on the very first PiP toggle the canvas's
   * captureStream() hasn't delivered a frame yet, so requestPictureInPicture() throws
   * "Video readyState is HAVE_NOTHING".
   */
  function waitForPipVideoReady(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 1) { // HAVE_METADATA or higher
        resolve();
        return;
      }
      const onReady = () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        resolve();
      };
      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      setTimeout(resolve, 1000); // safety net
    });
  }

  // ------------------------
  // Lyrics Cache Module
  // ------------------------
  const LyricsCache = {
    // Safety limit for entry count (actual limit is typically 150-400 songs based on 6 MB size constraint)
    CACHE_ENTRY_SAFETY_LIMIT: 1000, // Generous safety limit; byte limit is primary constraint
    MAX_BYTES: 6 * 1024 * 1024, // Maximum cache size in bytes (6 MB) - PRIMARY LIMIT

    /**
     * Get all cached lyrics from localStorage
     * @returns {Object} Cache object with trackId keys
     */
    getAll() {
      try {
        const cached = localStorage.getItem(STORAGE_KEYS.LYRICS_CACHE);
        return cached ? JSON.parse(cached) : {};
      } catch (e) {
        console.warn('[Lyrics+] ⚠️ Could not load cached lyrics from storage:', e);
        return {};
      }
    },

    /**
     * Save cache to localStorage
     * @param {Object} cache - Cache object to save
     */
    saveAll(cache) {
      try {
        localStorage.setItem(STORAGE_KEYS.LYRICS_CACHE, JSON.stringify(cache));
      } catch (e) {
        console.warn('[Lyrics+] ⚠️ Could not save lyrics to cache:', e);
      }
    },

    /**
     * Get cached lyrics for a specific track
     * @param {string} trackId - Spotify track ID
     * @returns {Object|null} Cached lyrics data or null if not found
     */
    get(trackId) {
      if (!trackId) return null;
      const cache = this.getAll();
      const entry = cache[trackId];
      if (entry) {
        console.log(`💾 [Lyrics+] Found cached lyrics! Loading instantly without network request...`);
        DEBUG.log('Cache', `Found cached lyrics for track: ${trackId}`);
        // Update timestamp to mark as recently used (LRU)
        entry.timestamp = Date.now();
        this.saveAll(cache);
        return entry;
      }
      console.log(`🔍 [Lyrics+] No cached lyrics found for this song - fetching from providers...`);
      DEBUG.debug('Cache', `No cached lyrics found for track: ${trackId}`);
      return null;
    },

    /**
     * Save lyrics to cache with LRU eviction (count and byte-based)
     * @param {string} trackId - Spotify track ID
     * @param {Object} data - Lyrics data to cache
     */
    set(trackId, data) {
      if (!trackId || !data) return;

      const cache = this.getAll();

      // Add/update entry with timestamp
      cache[trackId] = {
        ...data,
        timestamp: Date.now()
      };

      // Build array of entries with their sizes
      const entriesWithSize = Object.entries(cache).map(([key, entry]) => {
        const size = new Blob([JSON.stringify(entry)]).size;
        return { key, entry, size };
      });

      // Sort by timestamp (oldest first)
      entriesWithSize.sort((a, b) => a.entry.timestamp - b.entry.timestamp);

      // Track total bytes and evict oldest entries if needed
      let totalBytes = 0;
      const remainingEntries = [];

      for (const item of entriesWithSize) {
        totalBytes += item.size;
        remainingEntries.push(item);
      }

      // Evict oldest entries while exceeding limits
      let evictedCount = 0;
      while (remainingEntries.length > this.CACHE_ENTRY_SAFETY_LIMIT || totalBytes > this.MAX_BYTES) {
        if (remainingEntries.length === 0) break;
        const evicted = remainingEntries.shift();
        totalBytes -= evicted.size;
        evictedCount++;
        DEBUG.debug('Cache', `Evicted old entry: ${evicted.key} (size: ${evicted.size} bytes)`);
      }

      // Reconstruct cache from remaining entries
      const newCache = {};
      for (const item of remainingEntries) {
        newCache[item.key] = item.entry;
      }

      this.saveAll(newCache);
      const cacheSize = Object.keys(newCache).length;
      const totalKB = Math.round(totalBytes / 1024);
      const maxKB = Math.round(this.MAX_BYTES / 1024);

      if (evictedCount > 0) {
        console.log(`💾 [Lyrics+] Removed ${evictedCount} oldest cached song(s) to stay within limits (max ${maxKB} KB)`);
      }
      const songWord = cacheSize === 1 ? 'song' : 'songs';
      console.log(`✅ [Lyrics+] Lyrics saved to cache! Now have ${cacheSize} ${songWord} (${totalKB} KB of ${maxKB} KB) cached for instant replay`);
      DEBUG.log('Cache', `Cached lyrics for track: ${trackId}, total size: ${totalKB} KB`);
    },

    /**
     * Clear all cached lyrics
     */
    clear() {
      try {
        localStorage.removeItem(STORAGE_KEYS.LYRICS_CACHE);
        console.log('🗑️ [Lyrics+] All cached lyrics cleared successfully');
        DEBUG.log('Cache', 'Cache cleared');
      } catch (e) {
        console.warn('[Lyrics+] ⚠️ Could not clear cache:', e);
      }
    },

    /**
     * Get cache statistics for debugging
     * @returns {Object} Cache statistics
     */
    getStats() {
      const cache = this.getAll();
      const entries = Object.entries(cache);

      // Calculate total bytes
      let totalBytes = 0;
      const entriesWithDetails = entries.map(([id, data]) => {
        const size = new Blob([JSON.stringify(data)]).size;
        totalBytes += size;

        // Extract server information from metadata
        let serverInfo = 'N/A';
        if (data.metadata?.server) {
          const serverUrl = data.metadata.server;
          // Determine server label for KPoe servers
          if (serverUrl.includes('lyricsplus.prjktla.my.id')) {
            serverInfo = 'Primary';
          } else if (serverUrl.includes('lyricsplus.atomix.one')) {
            serverInfo = 'Backup 1';
          } else if (serverUrl.includes('lyricsplus.binimum.org')) {
            serverInfo = 'Backup 2';
          } else if (serverUrl.includes('lyricsplus.prjktla.workers.dev')) {
            serverInfo = 'Backup 3';
          } else if (serverUrl.includes('lyricsplus-seven.vercel.app')) {
            serverInfo = 'Backup 4';
          } else if (serverUrl.includes('lyrics-plus-backend.vercel.app')) {
            serverInfo = 'Backup 5';
          } else {
            // For other servers, show abbreviated URL
            serverInfo = serverUrl.replace(/^https?:\/\//, '').substring(0, 40);
          }
        } else if (data.provider) {
          // For the rest of the providers (LRCLIB, Spotify, Musixmatch, Genius) that only use one server
          serverInfo = 'Primary';
        }

        return {
          trackId: id,
          provider: data.provider,
          server: serverInfo,
          hasSynced: !!data.synced,
          hasUnsynced: !!data.unsynced,
          timestamp: new Date(data.timestamp).toISOString(),
          sizeBytes: size
        };
      });

      return {
        size: entries.length,
        safetyLimit: this.CACHE_ENTRY_SAFETY_LIMIT,
        maxEntries: this.CACHE_ENTRY_SAFETY_LIMIT, // Entry count safety limit (primary constraint is maxBytes)
        totalBytes: totalBytes,
        maxBytes: this.MAX_BYTES,
        totalKB: Math.round(totalBytes / 1024),
        maxKB: Math.round(this.MAX_BYTES / 1024),
        entries: entriesWithDetails
      };
    }
  };

  // Context-to-emoji mapping for DEBUG wrapper labels
  const CONTEXT_EMOJI = {
    Track:           '🎵',
    Cache:           '💾',
    Provider:        '🔌',
    Autodetect:      '🔍',
    UI:              '💻',
    ResourceManager: '🔧',
    OpenCC:          '🔤',
    Button:          '🔘',
    DOM:             '📄',
    Performance:     '⚡',
    Cleanup:         '🧹',
    Seekbar:         '⏩',
    PopupResize:     '🔄',
    Translation:     '🌐',
  };

  // ------------------------
  // Debug Logging Infrastructure
  // ------------------------
  const DEBUG = {
    // Log levels with prefixes
    error: (context, ...args) => {
      console.error(`%c[Lyrics+ ERROR] [${context}]`, 'color: #F44336; font-weight: bold;', ...args);
    },
    warn: (context, ...args) => {
      console.warn(`%c[Lyrics+ WARN] [${context}]`, 'color: #FF9800; font-weight: bold;', ...args);
    },
    info: (context, ...args) => {
      console.info(`${CONTEXT_EMOJI[context] || '▸'} [Lyrics+ ${context}]`, ...args);
    },
    log: (context, ...args) => {
      console.info(`${CONTEXT_EMOJI[context] || '▸'} [Lyrics+ ${context}]`, ...args);
    },
    debug: (context, ...args) => {
      console.info(`${CONTEXT_EMOJI[context] || '▸'} [Lyrics+ ${context}]`, ...args);
    },

    // Specialized logging helpers
    provider: {
      start: (providerName, operation, trackInfo) => {
        const lyricsType = operation === 'getSynced' ? 'synced' : 'unsynced';
        DEBUG.debug('Provider', `Checking ${providerName} for ${lyricsType} lyrics:`, {
          track: trackInfo.title,
          artist: trackInfo.artist,
          album: trackInfo.album
        });
      },
      success: (providerName, operation, lyricsType, lineCount) => {
        DEBUG.log('Provider', `✓ ${providerName} ${operation} succeeded:`, {
          type: lyricsType,
          lines: lineCount
        });
      },
      failure: (providerName, operation, error) => {
        const lyricsType = operation === 'getSynced' ? 'synced' : 'unsynced';
        DEBUG.warn('Provider', `✗ ${providerName} (${lyricsType}) failed:`, error);
      },
      timing: (providerName, operation, durationMs) => {
        const lyricsType = operation === 'getSynced' ? 'synced' : 'unsynced';
        DEBUG.debug('Provider', `⚡ ${providerName} (${lyricsType}) took ${durationMs}ms`);
      }
    },

    dom: {
      notFound: (selector, context) => {
        DEBUG.warn('DOM', `Element not found: ${selector}`, context ? `Context: ${context}` : '');
      },
      found: (selector, element) => {
        DEBUG.debug('DOM', `Element found: ${selector}`, element);
      },
      query: (selector, count) => {
        DEBUG.debug('DOM', `Query "${selector}" returned ${count} elements`);
      }
    },

    track: {
      changed: (oldId, newId, trackInfo) => {
        DEBUG.log('Track', `Track changed: ${oldId || 'none'} → ${newId}`, trackInfo);
      },
      detected: (trackInfo) => {
        DEBUG.debug('Track', 'Track info detected:', trackInfo);
      }
    },

    ui: {
      popupCreated: () => {
        DEBUG.info('UI', 'Popup created');
      },
      popupRemoved: () => {
        DEBUG.info('UI', 'Popup removed');
      },
      buttonClick: (buttonName) => {
        DEBUG.debug('UI', `Button clicked: ${buttonName}`);
      },
      stateChange: (stateName, value) => {
        DEBUG.debug('UI', `State change: ${stateName} = ${value}`);
      }
    },

    perf: {
      start: (operation) => {
        const startTime = performance.now();
        return {
          end: () => {
            const duration = performance.now() - startTime;
            DEBUG.debug('Performance', `${operation} took ${duration.toFixed(2)}ms`);
            return duration;
          }
        };
      }
    }
  };

  // Global flags for popup state management (shared with resize observer in setupPopupAutoResize)
  window.lyricsPlusPopupIgnoreProportion = false;
  window.lastProportion = { w: null, h: null };
  window.lyricsPlusPopupIsDragging = false;
  window.lyricsPlusPopupIsResizing = false;

  // ------------------------
  // Resource Management & Cleanup System
  // ------------------------
  // Centralized tracking of all observers, listeners, and timers for proper cleanup
  const ResourceManager = {
    observers: [],
    windowListeners: [],

    // Register a MutationObserver, IntersectionObserver, or ResizeObserver
    registerObserver(observer, description) {
      this.observers.push({ observer, description });
      DEBUG.debug('ResourceManager', `Registered observer: ${description}`);
      return observer;
    },

    // Register a window event listener
    registerWindowListener(eventType, handler, description) {
      this.windowListeners.push({ eventType, handler, description });
      window.addEventListener(eventType, handler);
      DEBUG.debug('ResourceManager', `Registered window listener: ${eventType} (${description})`);
    },

    // Cleanup all registered resources
    cleanup() {
      DEBUG.info('ResourceManager', `Cleaning up ${this.observers.length} observers and ${this.windowListeners.length} window listeners`);

      // Disconnect all observers
      this.observers.forEach(({ observer, description }) => {
        try {
          observer.disconnect();
          DEBUG.debug('ResourceManager', `Disconnected observer: ${description}`);
        } catch (e) {
          DEBUG.error('ResourceManager', `Failed to disconnect observer ${description}:`, e);
        }
      });
      this.observers = [];

      // Remove all window listeners
      this.windowListeners.forEach(({ eventType, handler, description }) => {
        try {
          window.removeEventListener(eventType, handler);
          DEBUG.debug('ResourceManager', `Removed window listener: ${eventType} (${description})`);
        } catch (e) {
          DEBUG.error('ResourceManager', `Failed to remove listener ${description}:`, e);
        }
      });
      this.windowListeners = [];
    },

    // Cleanup specific observer
    cleanupObserver(observer) {
      const index = this.observers.findIndex(item => item.observer === observer);
      if (index !== -1) {
        const { description } = this.observers[index];
        try {
          observer.disconnect();
          this.observers.splice(index, 1);
          DEBUG.debug('ResourceManager', `Cleaned up observer: ${description}`);
        } catch (e) {
          DEBUG.error('ResourceManager', `Failed to cleanup observer ${description}:`, e);
        }
      }
    }
  };

// ------------------------
  // Pre-initialized OpenCC converters (created once at startup)
  // ------------------------
  // Using the full.js bundle, we initialize converters at startup to avoid
  // the issue of individual t2cn.js and cn2t.js files overwriting each other
  let openccT2CN = null; // Traditional to Simplified Chinese converter
  let openccCN2T = null; // Simplified Chinese to Traditional converter
  let openccInitialized = false; // Flag to prevent duplicate initialization attempts

  // Initialize OpenCC converters with retry mechanism
  // @require scripts should load before the userscript executes, but we add
  // a retry mechanism as a safety measure in case of any timing issues
  function initOpenCCConverters(retries = LIMITS.OPENCC_MAX_RETRIES, delay = TIMING.OPENCC_RETRY_DELAY_MS) {
    if (openccInitialized) return; // Already initialized, don't retry

    DEBUG.debug('OpenCC', `Initialization attempt (${LIMITS.OPENCC_MAX_RETRIES - retries + 1}/${LIMITS.OPENCC_MAX_RETRIES})`);

    try {
      if (typeof OpenCC !== 'undefined' && OpenCC.Converter) {
        // The full.js bundle exposes OpenCC.Converter which takes { from, to } options
        // Supported locales: 'cn' (Simplified), 't' (Traditional Taiwan), 'tw' (Traditional Taiwan with phrases),
        // 'twp' (Traditional Taiwan with phrases and idioms), 'hk' (Traditional Hong Kong), 'jp' (Japanese Shinjitai)
        openccT2CN = OpenCC.Converter({ from: 't', to: 'cn' });
        openccCN2T = OpenCC.Converter({ from: 'cn', to: 't' });
        openccInitialized = true;
        DEBUG.info('OpenCC', 'Converters initialized successfully (t↔cn)');
      } else if (retries > 0) {
        // OpenCC not available yet, retry after a short delay
        DEBUG.debug('OpenCC', `Not available yet, retrying in ${delay}ms (${retries} retries left)`);
        setTimeout(() => initOpenCCConverters(retries - 1, delay * 2), delay);
      } else {
        DEBUG.warn('OpenCC', 'Not available after all retries');
      }
    } catch (e) {
      DEBUG.error('OpenCC', 'Initialization error:', e);
    }
  }
  // Attempt initialization immediately
  initOpenCCConverters();

  // NowPlayingView is no longer hidden/managed here - handled entirely by
  // Spotifuck (used alongside this script) via its own npBtn/guard, which is
  // now the single source of truth for opening/closing/showing NPV. The old
  // permanent CSS-collapse here would have fought that: it forced the NPV
  // panel container to zero-width any time NPV was present in the DOM,
  // regardless of whether Spotifuck's guard had it open or closed - so even
  // a legitimate open via Spotifuck's button would render invisible.
  //
  // Track/lyrics fetching (ProviderSpotify) reads NPV's DOM structure
  // directly and was unaffected by that CSS either way - it never depended
  // on the panel being visually hidden or shown, only on it existing in the
  // DOM, which Spotify controls independently of this script's own styling.

  // ------------------------
  // Utils.js Functions
  // ------------------------

  // --- Translation Language List and Utilities ---
  const TRANSLATION_LANGUAGES = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
    ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', af: 'Afrikaans', sq: 'Albanian',
    am: 'Amharic', hy: 'Armenian', az: 'Azerbaijani', eu: 'Basque', be: 'Belarusian',
    bn: 'Bengali', bs: 'Bosnian', bg: 'Bulgarian', ca: 'Catalan', ceb: 'Cebuano',
    co: 'Corsican', hr: 'Croatian', cs: 'Czech', da: 'Danish', nl: 'Dutch',
    eo: 'Esperanto', et: 'Estonian', fi: 'Finnish', fy: 'Frisian', gl: 'Galician',
    ka: 'Georgian', el: 'Greek', gu: 'Gujarati', ht: 'Haitian Creole', ha: 'Hausa',
    haw: 'Hawaiian', he: 'Hebrew', hmn: 'Hmong', hu: 'Hungarian', is: 'Icelandic',
    ig: 'Igbo', id: 'Indonesian', ga: 'Irish', jv: 'Javanese', kn: 'Kannada',
    kk: 'Kazakh', km: 'Khmer', rw: 'Kinyarwanda', ku: 'Kurdish', ky: 'Kyrgyz',
    lo: 'Lao', la: 'Latin', lv: 'Latvian', lt: 'Lithuanian', lb: 'Luxembourgish',
    mk: 'Macedonian', mg: 'Malagasy', ms: 'Malay', ml: 'Malayalam', mt: 'Maltese',
    mi: 'Maori', mr: 'Marathi', mn: 'Mongolian', my: 'Myanmar (Burmese)',
    ne: 'Nepali', no: 'Norwegian', ny: 'Nyanja (Chichewa)', or: 'Odia (Oriya)',
    ps: 'Pashto', fa: 'Persian', pl: 'Polish', pa: 'Punjabi', ro: 'Romanian',
    sm: 'Samoan', gd: 'Scots Gaelic', sr: 'Serbian', st: 'Sesotho', sn: 'Shona',
    sd: 'Sindhi', si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali',
    su: 'Sundanese', sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog (Filipino)',
    tg: 'Tajik', ta: 'Tamil', tt: 'Tatar', te: 'Telugu', th: 'Thai', tk: 'Turkmen',
    uk: 'Ukrainian', ur: 'Urdu', ug: 'Uyghur', uz: 'Uzbek', vi: 'Vietnamese',
    cy: 'Welsh', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu'
  };

  function getSavedTranslationLang() {
    return localStorage.getItem('lyricsPlusTranslationLang') || 'en';
  }
  function saveTranslationLang(lang) {
    localStorage.setItem('lyricsPlusTranslationLang', lang);
  }

  // --- Chinese Conversion Settings (Traditional to Simplified) ---
  function isChineseConversionEnabled() {
    return localStorage.getItem('lyricsPlusChineseConversion') === 'true';
  }
  function setChineseConversionEnabled(enabled) {
    localStorage.setItem('lyricsPlusChineseConversion', enabled ? 'true' : 'false');
  }

  async function translateText(text, targetLang) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      return data[0][0][0];
    } catch (error) {
      DEBUG.error('Translation', 'Failed to translate text:', error);
      return '[Translation Error]';
    }
  }

  const Utils = {
    normalize(str) {
      if (!str) return "";
      // Remove full-width/half-width, accents, etc.
      return str.normalize("NFKC")
        .replace(/[’‘“”–]/g, "'")
        .replace(/[\u2018-\u201F]/g, "'")
        .replace(/[\u3000-\u303F]/g, "")
        .replace(/[^\w\s\-\.&!']/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    },
    removeExtraInfo(str) {
      return str.replace(/\(.*?\)|\[.*?]|\{.*?}/g, '').trim();
    },
    removeSongFeat(str) {
      // Remove "feat. ...", "ft. ...", etc.
      return str.replace(/\s*(?:feat\.?|ft\.?|featuring)\s+[^\-]+/i, '').trim();
    },
    containsHanCharacter(str) {
      return /[\u4e00-\u9fa5]/.test(str);
    },
    // Detect the Chinese script type using OpenCC converters
    // Uses conversion behavior to determine script type - more reliable than character lists
    // Returns 'traditional', 'simplified', or null if no Chinese
    detectChineseScriptType(str) {
      if (!str || !this.containsHanCharacter(str)) return null;

      // Use OpenCC converters to detect script type via conversion comparison
      // If T→CN conversion changes the text, it's Traditional Chinese
      // If CN→T conversion changes the text, it's Simplified Chinese
      // This approach leverages OpenCC's comprehensive character mappings
      try {
        if (!openccT2CN || !openccCN2T) {
          // Fallback if converters aren't initialized
          DEBUG.warn('OpenCC', 'Converters not initialized for script detection');
          return 'simplified'; // Default assumption
        }

        // Use full text for accurate detection (no sampling)
        // This ensures all characters are checked for proper script type identification
        const asSimplified = openccT2CN(str);
        const asTraditional = openccCN2T(str);

        const changedToSimplified = asSimplified !== str;
        const changedToTraditional = asTraditional !== str;

        // If converting T→CN changes text but CN→T doesn't, it's Traditional
        if (changedToSimplified && !changedToTraditional) {
          return 'traditional';
        }
        // If converting CN→T changes text but T→CN doesn't, it's Simplified
        else if (changedToTraditional && !changedToSimplified) {
          return 'simplified';
        }
        // If both change it, use length comparison (Traditional usually has fewer chars after T→CN)
        else if (changedToSimplified && changedToTraditional) {
          return asSimplified.length < str.length ? 'traditional' : 'simplified';
        }
        else {
          // If neither changes, characters are common to both - assume simplified
          return 'simplified';
        }
      } catch (e) {
        DEBUG.warn('OpenCC', 'Script type detection error:', e);
        return 'simplified'; // Default assumption on error
      }
    },
    capitalize(str, lower = false) {
      if (!str) return '';
      return (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
    },
    // Convert Traditional Chinese to Simplified Chinese using opencc-js
    // Uses pre-initialized converter from the full.js bundle
    toSimplifiedChinese(str) {
      if (!str) return str;
      try {
        // Use pre-initialized converter (created at startup from full.js bundle)
        if (openccT2CN) {
          return openccT2CN(str);
        }
        // Fallback: try to create converter on-the-fly if not initialized
        // Only attempt if not already initialized (prevents race conditions)
        if (!openccInitialized && typeof OpenCC !== 'undefined' && OpenCC.Converter) {
          const converter = OpenCC.Converter({ from: 't', to: 'cn' });
          openccT2CN = converter;
          return converter(str);
        }
        // Converter not available, return original
        DEBUG.warn('OpenCC', 'T→CN converter not available');
        return str;
      } catch (e) {
        DEBUG.error('OpenCC', 'Traditional to Simplified conversion error:', e);
        return str;
      }
    },
    // Convert Simplified Chinese to Traditional Chinese using opencc-js
    // Uses pre-initialized converter from the full.js bundle
    toTraditionalChinese(str) {
      if (!str) return str;
      try {
        // Use pre-initialized converter (created at startup from full.js bundle)
        if (openccCN2T) {
          return openccCN2T(str);
        }
        // Fallback: try to create converter on-the-fly if not initialized
        // Only attempt if not already initialized (prevents race conditions)
        if (!openccInitialized && typeof OpenCC !== 'undefined' && OpenCC.Converter) {
          const converter = OpenCC.Converter({ from: 'cn', to: 't' });
          openccCN2T = converter;
          return converter(str);
        }
        // Converter not available, return original
        DEBUG.warn('OpenCC', 'CN→T converter not available');
        return str;
      } catch (e) {
        DEBUG.error('OpenCC', 'Simplified to Traditional conversion error:', e);
        return str;
      }
    },
    parseLocalLyrics(plain) {
      if (!plain) return { unsynced: null, synced: null };
      const timeTagRegex = /\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;
      const synced = [];
      const unsynced = [];
      const lines = plain.split(/\r?\n/);
      for (const line of lines) {
        let matched = false;
        let lastIndex = 0;
        let text = line;
        const times = [];
        let m;
        while ((m = timeTagRegex.exec(line)) !== null) {
          matched = true;
          const min = parseInt(m[1], 10);
          const sec = parseInt(m[2], 10);
          const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
          const time = min * 60000 + sec * 1000 + ms;
          times.push(time);
          lastIndex = m.index + m[0].length;
        }
        if (matched) {
          text = line.substring(lastIndex).trim();
          times.forEach(time => {
            synced.push({ time, text });
          });
        } else {
          if (line.trim().length > 0) {
            unsynced.push({ text: line.trim() });
          }
        }
      }
      synced.sort((a, b) => a.time - b.time);
      return {
        synced: synced.length > 0 ? synced : null,
        unsynced: unsynced.length > 0 ? unsynced : null
      };
    }
  };

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function makeSafeFilename(str) {
    // Remove illegal Windows filename characters, collapse spaces
    return str.replace(/[\/\\:\*\?"<>\|]/g, '').replace(/\s+/g, ' ').trim();
  }

  // --- Download Synced Lyrics as LRC ---
  function downloadSyncedLyrics(syncedLyrics, trackInfo, providerName) {
    if (!syncedLyrics || !syncedLyrics.length) return;
    let lines = syncedLyrics.map(line => {
      let ms = Number(line.time) || 0;
      let min = String(Math.floor(ms / 60000)).padStart(2, '0');
      let sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
      let hundredths = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
      return `[${min}:${sec}.${hundredths}] ${line.text}`;
    }).join('\n');
    let title = makeSafeFilename(trackInfo?.title || "lyrics");
    let artist = makeSafeFilename(trackInfo?.artist || "unknown");
    let filename = `${artist} - ${title}.lrc`;

    // Try application/octet-stream for better compatibility (helps detect as .lrc in mobile browser)
    let blob = new Blob([lines], { type: "application/octet-stream" });

    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

   // --- Download Unsynced Lyrics as TXT ---
  function downloadUnsyncedLyrics(unsyncedLyrics, trackInfo, providerName) {
    if (!unsyncedLyrics || !unsyncedLyrics.length) return;
    let lines = unsyncedLyrics.map(line => line.text).join('\n');
    let title = makeSafeFilename(trackInfo?.title || "lyrics");
    let artist = makeSafeFilename(trackInfo?.artist || "unknown");
    let filename = `${artist} - ${title}.txt`;
    let blob = new Blob([lines], { type: "text/plain" });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const style = document.createElement('style');
  style.textContent = `
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { scrollbar-width: none !important; ms-overflow-style: none !important; }
  `;
  document.head.appendChild(style);

  const buttonGroupScrollStyle = document.createElement('style');
buttonGroupScrollStyle.textContent = `
  #lyrics-plus-button-group::-webkit-scrollbar {
    display: none;
    height: 0;
  }
  #lyrics-plus-button-group {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
`;
document.head.appendChild(buttonGroupScrollStyle);

  // ------------------------
  // Utility Functions
  // ------------------------

  function getCurrentTrackId() {
    const contextLink = document.querySelector('a[data-testid="context-link"][data-context-item-type="track"][href*="uri=spotify%3Atrack%3A"]');
    if (contextLink) {
      const href = contextLink.getAttribute('href');
      const match = decodeURIComponent(href).match(/spotify:track:([a-zA-Z0-9]{22})/);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  function getCurrentTrackInfo() {
    const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
    const durationEl = document.querySelector('[data-testid="playback-duration"]');
    const positionEl = document.querySelector('[data-testid="playback-position"]');
    const trackId = getCurrentTrackId();

    if (!titleEl || !artistEl) {
      return null;
    }

    const title = titleEl.textContent.trim();
    const artist = artistEl.textContent.trim();

    // Calculate duration properly - playback-duration may show remaining time (prefixed with '-')
    let duration = 0;
    if (durationEl) {
      const raw = durationEl.textContent.trim();
      if (raw.startsWith('-')) {
        // Remaining time format: add current position + remaining to get total duration
        const remainMs = timeStringToMs(raw);
        const posMs = positionEl ? timeStringToMs(positionEl.textContent) : 0;
        duration = posMs + remainMs;
      } else {
        // Direct duration format
        duration = timeStringToMs(raw);
      }
    }

    const trackInfo = {
      id: `${title}-${artist}`,
      title,
      artist,
      album: "",
      duration,
      uri: "",
      trackId
    };

    return trackInfo;
  }

  function timeStringToMs(str) {
    if (!str) return 0;
    // Remove leading minus for "-2:04" cases (Spotify shows remaining as -mm:ss)
    const cleaned = str.replace(/^-/, '').trim();
    const parts = cleaned.split(":").map((p) => parseInt(p));
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return 0;
  }

  /**
   * Detects if a track is a Spotify advertisement.
   * Advertisements typically have "Advertisement" in the artist field.
   * Examples: "Advertisement • 1 of 1", "Advertisement", etc.
   *
   * @param {Object} trackInfo - Track information object with artist field
   * @returns {boolean} - True if track is an advertisement
   */
  function isAdvertisement(trackInfo) {
    if (!trackInfo || !trackInfo.artist) return false;

    // Check if artist contains "Advertisement" (case-insensitive)
    const artist = trackInfo.artist.toLowerCase();
    return artist.includes('advertisement');
  }

  function timeoutPromise(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("Lyrics not found")), ms));
  }

  function getAnticipationOffset() {
    return Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 1000);
  }
  function setAnticipationOffset(val) {
    localStorage.setItem("lyricsPlusAnticipationOffset", val);
  }

  function isSpotifyPlaying() {
    // Try using Spotify's play/pause button aria-label (robust, language-universal)
    let playPauseBtn =
      document.querySelector('[data-testid="control-button-playpause"]') ||
      document.querySelector('[aria-label]');

    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    if (playPauseBtn && isVisible(playPauseBtn)) {
      const label = (playPauseBtn.getAttribute('aria-label') || '').toLowerCase();
      if (labelMeansPause(label)) return true; // "Pause" means music is playing
      if (labelMeansPlay(label)) return false; // "Play" means music is paused/stopped
    }

    // Default: assume not playing
    return false;
  }

  /**
   * findSpotifyRangeInput()
   * Attempts to find Spotify's native range input for playback progress.
   * Fallback order:
   *   1. Hidden numeric input[type=range] with max > 0 (preferred - most accurate)
   *   2. Visible range inputs with max > 0
   *   3. Any range input with numeric max/min/step
   * @returns {HTMLInputElement|null}
   */
  function findSpotifyRangeInput() {
    try {
      // Collect all range inputs in the document
      const allRanges = Array.from(document.querySelectorAll('input[type="range"]'));

      // Filter for hidden ranges with max > 0 (preferred - Spotify often uses hidden inputs)
      const hiddenRanges = allRanges.filter(inp => {
        const max = Number(inp.max);
        // Check if hidden: not visible in DOM (hidden-visually class, or offsetParent null)
        // Use specific class matching to avoid false positives like 'unhidden'
        const isHidden = inp.offsetParent === null ||
                         inp.closest('label.hidden-visually') !== null ||
                         inp.closest('.hidden-visually') !== null ||
                         inp.closest('[class~="hidden"]') !== null;
        return isHidden && max > 0;
      });
      if (hiddenRanges.length > 0) {
        // Prefer the one with the largest max value (likely the playback progress)
        hiddenRanges.sort((a, b) => Number(b.max) - Number(a.max));
        return hiddenRanges[0];
      }

      // Fallback: visible range inputs with max > 0
      const visibleRanges = allRanges.filter(inp => {
        const max = Number(inp.max);
        return inp.offsetParent !== null && max > 0;
      });
      if (visibleRanges.length > 0) {
        visibleRanges.sort((a, b) => Number(b.max) - Number(a.max));
        return visibleRanges[0];
      }

      // Last resort: any range with valid numeric attributes
      const anyValid = allRanges.find(inp =>
        inp.max && !isNaN(Number(inp.max)) && Number(inp.max) > 0 &&
        inp.step && !isNaN(Number(inp.step))
      );
      return anyValid || null;
    } catch (e) {
      console.warn('findSpotifyRangeInput error:', e);
      return null;
    }
  }

  /**
   * formatMs(ms)
   * Converts milliseconds to a human-readable time string (m:ss).
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted time string
   */
  function formatMs(ms) {
    if (!ms || isNaN(ms)) return "0:00";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * applySeekEndBuffer(ms, durationMs, bufferMs)
   * Prevents seeking to exact track end by applying a buffer.
   * This avoids the audio "ended" state that conflicts with repeat functionality.
   * @param {number} ms - Target seek position in milliseconds
   * @param {number} durationMs - Track duration in milliseconds
   * @param {number} bufferMs - Buffer size in milliseconds (default 200ms)
   * @returns {number} Safe seek position
   */
  function applySeekEndBuffer(ms, durationMs, bufferMs = 200) {
    if (ms >= durationMs - bufferMs) {
      DEBUG.debug('Seekbar', `Applied end buffer: ${ms}ms → ${durationMs - bufferMs}ms to prevent "ended" state`);
      return durationMs - bufferMs;
    }
    return ms;
  }

  /**
   * seekTo(ms)
   * Attempts to seek Spotify's playback to the specified position in milliseconds.
   * Fallback order:
   *   (a) Hidden/native range input value + dispatch input/change + pointer events
   *   (b) Emulate pointer/mouse events on CSS progress-bar handle (last resort)
   * @param {number} ms - Target position in milliseconds
   * @returns {boolean} Whether seeking was attempted
   *
   * NOTE (17.49): hoisted here from inside createPopup() (was private to that function's
   * scope) so PiP's MediaSession seekbackward/seekforward handlers - which can fire while
   * the lyrics popup isn't even open - can call the same real seek logic instead of
   * duplicating it. createPopup()'s own callers are unaffected: with the nested declarations
   * removed, they now resolve seekTo/findSpotifyRangeInput/formatMs/applySeekEndBuffer via
   * closure over this outer scope instead, same as before.
   */
  function seekTo(ms) {
    try {
      const SEEK_END_BUFFER_MS = 200;

      DEBUG.debug('Seekbar', `Seeking to ${ms}ms (${formatMs(ms)})`);

      // --- (a) Try hidden/native range input ---
      const spotifyRange = findSpotifyRangeInput();
      if (spotifyRange) {
        try {
          const max = Number(spotifyRange.max) || 0;
          if (max > 0) {
            const safeMs = applySeekEndBuffer(ms, max, SEEK_END_BUFFER_MS);
            // Set the value
            spotifyRange.value = String(clamp(safeMs, 0, max));

            // Dispatch input and change events
            spotifyRange.dispatchEvent(new Event('input', { bubbles: true }));
            spotifyRange.dispatchEvent(new Event('change', { bubbles: true }));

            // Also try pointer events for better compatibility
            // Note: We omit 'view' property as it can cause errors in Firefox extensions
            const rangeRect = spotifyRange.getBoundingClientRect();
            const percentage = clamp(safeMs, 0, max) / max;
            const clientX = rangeRect.left + rangeRect.width * percentage;
            const clientY = rangeRect.top + rangeRect.height / 2;

            try {
              const pointerDownEvent = new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0, buttons: 1
              });
              const pointerUpEvent = new PointerEvent('pointerup', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });

              spotifyRange.dispatchEvent(pointerDownEvent);
              spotifyRange.dispatchEvent(pointerUpEvent);
            } catch (pointerErr) {
              // Pointer events failed, try mouse events instead
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });
              const mouseUpEvent = new MouseEvent('mouseup', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });
              spotifyRange.dispatchEvent(mouseDownEvent);
              spotifyRange.dispatchEvent(mouseUpEvent);
            }

            DEBUG.debug('Seekbar', `✓ Seeked via range input to ${safeMs}ms`);
            return true;
          }
        } catch (e) {
          console.warn('seekTo: Failed to set range input', e);
        }
      }

      // --- (b) Emulate pointer events on CSS progress-bar handle (last resort) ---
      const progressBar = document.querySelector('[data-testid="progress-bar"]');
      if (progressBar) {
        try {
          const barRect = progressBar.getBoundingClientRect();
          if (barRect.width > 0) {
            // Determine duration to calculate percentage
            let durMs = 0;

            // Try range input max
            const range = findSpotifyRangeInput();
            if (range && Number(range.max) > 0) {
              durMs = Number(range.max);
            }

            // Fallback: visible text
            if (durMs <= 0) {
              const durEl = document.querySelector('[data-testid="playback-duration"]');
              const posEl = document.querySelector('[data-testid="playback-position"]');
              if (durEl) {
                const raw = durEl.textContent.trim();
                if (raw.startsWith('-')) {
                  const posMs = posEl ? timeStringToMs(posEl.textContent) : 0;
                  const remainMs = timeStringToMs(raw);
                  durMs = posMs + remainMs;
                } else {
                  durMs = timeStringToMs(raw);
                }
              }
            }

            // Fallback: track info
            if (durMs <= 0) {
              const trackInfo = getCurrentTrackInfo();
              if (trackInfo && trackInfo.duration > 0) {
                durMs = trackInfo.duration;
              }
            }

            if (durMs > 0) {
              const safeMs = applySeekEndBuffer(ms, durMs, SEEK_END_BUFFER_MS);
              const percentage = clamp(safeMs, 0, durMs) / durMs;
              const clientX = barRect.left + barRect.width * percentage;
              const clientY = barRect.top + barRect.height / 2;

              // Try the handle first, then the progress bar
              const handle = progressBar.querySelector('[data-testid="progress-bar-handle"]');
              const target = handle || progressBar;

              // Try pointer events first (without 'view' property to avoid Firefox extension issues)
              try {
                const downEvent = new PointerEvent('pointerdown', {
                  bubbles: true, cancelable: true,
                  clientX, clientY, button: 0, buttons: 1,
                  pointerType: 'mouse'
                });
                const moveEvent = new PointerEvent('pointermove', {
                  bubbles: true, cancelable: true,
                  clientX, clientY, button: 0, buttons: 1,
                  pointerType: 'mouse'
                });
                const upEvent = new PointerEvent('pointerup', {
                  bubbles: true, cancelable: true,
                  clientX, clientY, button: 0, buttons: 0,
                  pointerType: 'mouse'
                });

                target.dispatchEvent(downEvent);
                target.dispatchEvent(moveEvent);
                target.dispatchEvent(upEvent);
              } catch (pointerErr) {
                // Pointer events failed, continue to mouse events
              }

               // Also try mouse events as fallback
              const mouseDownEvent = new MouseEvent('mousedown', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });
              const mouseUpEvent = new MouseEvent('mouseup', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });
              const clickEvent = new MouseEvent('click', {
                bubbles: true, cancelable: true,
                clientX, clientY, button: 0
              });

              progressBar.dispatchEvent(mouseDownEvent);
              progressBar.dispatchEvent(mouseUpEvent);
              progressBar.dispatchEvent(clickEvent);

              DEBUG.debug('Seekbar', `✓ Seeked via progress-bar pointer events to ${safeMs}ms`);
              return true;
            }
          }
        } catch (e) {
          console.warn('seekTo: Failed to emulate pointer events on progress bar', e);
        }
      }

      return false;
    } catch (e) {
      console.warn('seekTo error:', e);
      return false;
    }
  }

  /**
   * getSpotifyPositionMs()
   * Best-effort current playback position in milliseconds, for callers (like the PiP
   * MediaSession seek handlers below) that need a starting point to offset from but
   * aren't already tracking position themselves.
   * Fallback order mirrors seekTo()/updateProgressUIFromSpotify(): visible position text,
   * then the native range input's current value.
   * @returns {number}
   */
  function getSpotifyPositionMs() {
    try {
      const posEl = document.querySelector('[data-testid="playback-position"]');
      if (posEl) {
        return timeStringToMs(posEl.textContent);
      }
      const range = findSpotifyRangeInput();
      if (range) {
        const val = Number(range.value);
        if (!isNaN(val)) return val;
      }
      return 0;
    } catch (e) {
      console.warn('getSpotifyPositionMs error:', e);
      return 0;
    }
  }

  // =============================================
  // Picture-in-Picture (PiP)
  // =============================================

  function isSafariBrowser() {
    const ua = navigator.userAgent || '';
    return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua);
  }

  function applyHiddenPipVideoStyle() {
    if (!pipVideo) return;
    Object.assign(pipVideo.style, {
      position: 'fixed',
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
  }

  function findSpotifyVolumeControl() {
    return document.querySelector('[data-testid="volume-bar"]') ||
           document.querySelector('[data-testid="volume-bar"] input[type="range"]') ||
           document.querySelector('input[aria-label*="Volume"]');
  }

  function setSpotifyVolumeLevel(level) {
    const volumeControl = findSpotifyVolumeControl();
    if (!volumeControl) return false;
    let input = null;
    if (volumeControl instanceof HTMLInputElement && volumeControl.type === 'range') {
      input = volumeControl;
    } else {
      input = volumeControl.querySelector('input[type="range"]');
    }
    if (!(input instanceof HTMLInputElement)) return false;
    const min = Number(input.min || 0);
    const max = Number(input.max || 1);
    const clamped = Math.min(1, Math.max(0, level));
    const rawValue = min + ((max - min) * clamped);
    input.value = String(rawValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function getSpotifyVolumeLevel() {
    const volumeControl = findSpotifyVolumeControl();
    let input = null;
    if (volumeControl instanceof HTMLInputElement && volumeControl.type === 'range') {
      input = volumeControl;
    } else if (volumeControl) {
      input = volumeControl.querySelector('input[type="range"]');
    }
    if (!(input instanceof HTMLInputElement)) return null;
    const min = Number(input.min || 0);
    const max = Number(input.max || 1);
    const current = Number(input.value || 0);
    if (!Number.isFinite(max - min) || max === min) return current > 0 ? 1 : 0;
    if (max < min) return null;
    return (current - min) / (max - min);
  }

  function syncPipMediaStateFromSpotify() {
    if (!pipVideo) return;
    const spotifyPlaying = isSpotifyPlaying();
    const spotifyVolume = getSpotifyVolumeLevel();
    pipIgnoreMediaControlEvent = true;
    try {
      if (spotifyPlaying && pipVideo.paused) {
        pipVideo.play().catch(() => {});
      } else if (!spotifyPlaying && !pipVideo.paused) {
        pipVideo.pause();
      }
      if (spotifyVolume !== null) {
        pipVideo.volume = Math.max(0, Math.min(1, spotifyVolume));
        pipVideo.muted = spotifyVolume <= 0.001;
      }
    } finally {
      queueMicrotask(() => { pipIgnoreMediaControlEvent = false; });
    }
  }

  function handlePipVideoPlay() {
    if (pipIgnoreMediaControlEvent) return;
    if (isSpotifyPlaying()) return;
    const btn = findSpotifyPlayPauseButton();
    if (!btn) return;
    pipIgnoreMediaControlEvent = true;
    btn.click();
    setTimeout(() => {
      pipIgnoreMediaControlEvent = false;
      syncPipMediaStateFromSpotify();
    }, PIP_MEDIA_SYNC_GRACE_MS);
  }

  function handlePipVideoPause() {
    if (pipIgnoreMediaControlEvent) return;
    if (!isSpotifyPlaying()) return;
    const btn = findSpotifyPlayPauseButton();
    if (!btn) return;
    pipIgnoreMediaControlEvent = true;
    btn.click();
    setTimeout(() => {
      pipIgnoreMediaControlEvent = false;
      syncPipMediaStateFromSpotify();
    }, PIP_MEDIA_SYNC_GRACE_MS);
  }

  function handlePipVideoVolumeChange() {
    if (pipIgnoreMediaControlEvent) return;
    if (pipVideo.muted || pipVideo.volume <= 0.001) {
      setSpotifyVolumeLevel(0);
    } else {
      setSpotifyVolumeLevel(pipVideo.volume);
    }
  }

  // =============================================
  // PiP MediaSession action handlers (Chromium seek buttons)
  // =============================================
  // Chromium's native video-PiP overlay draws its play/pause/seek buttons based on
  // registered navigator.mediaSession action handlers, independent of whether pipVideo
  // itself (a MediaStream via canvas.captureStream()) is actually seekable. Registering
  // 'play'/'pause' here also guarantees those buttons show up at all - by default Chromium
  // may hide them for a MediaStream-backed <video>. Firefox's native PiP overlay does not
  // consult MediaSession for its buttons (see pip-seek-controls-analysis.md), so this is a
  // Chromium-only enhancement; it's simply inert elsewhere, not harmful.

  const PIP_MEDIA_SESSION_SEEK_STEP_SEC = 10;

  function handleMediaSessionPlay() {
    if (!pipVideo) return;
    pipVideo.play().catch(() => {});
  }

  function handleMediaSessionPause() {
    if (!pipVideo) return;
    pipVideo.pause();
  }

  function handleMediaSessionSeekBackward(details) {
    const offsetMs = ((details && details.seekOffset) || PIP_MEDIA_SESSION_SEEK_STEP_SEC) * 1000;
    const target = Math.max(0, getSpotifyPositionMs() - offsetMs);
    seekTo(target);
  }

  function handleMediaSessionSeekForward(details) {
    const offsetMs = ((details && details.seekOffset) || PIP_MEDIA_SESSION_SEEK_STEP_SEC) * 1000;
    const trackInfo = getCurrentTrackInfo();
    const duration = (trackInfo && trackInfo.duration > 0) ? trackInfo.duration : Infinity;
    const target = Math.min(duration, getSpotifyPositionMs() + offsetMs);
    seekTo(target);
  }

  /**
   * setupPipMediaSessionHandlers()
   * Registers the action handlers that make Chromium's PiP overlay show play/pause/seek
   * buttons and wire them to Spotify's real controls. Called when the PiP window actually
   * opens (native enterpictureinpicture), not at script load, so we're not silently
   * hijacking OS/hardware media-key behavior for the rest of the page while PiP is closed.
   */
  function setupPipMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', handleMediaSessionPlay);
      navigator.mediaSession.setActionHandler('pause', handleMediaSessionPause);
      navigator.mediaSession.setActionHandler('seekbackward', handleMediaSessionSeekBackward);
      navigator.mediaSession.setActionHandler('seekforward', handleMediaSessionSeekForward);
    } catch (e) {
      console.warn('📺 [Lyrics+ PiP] Failed to register MediaSession action handlers:', e);
    }
  }

  /**
   * teardownPipMediaSessionHandlers()
   * Clears the action handlers above when the PiP window closes (leavepictureinpicture).
   * Some browsers throw when unsetting a handler for an action they don't support at all;
   * each call is wrapped individually so one unsupported action doesn't stop the rest from
   * being cleared.
   */
  function teardownPipMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    ['play', 'pause', 'seekbackward', 'seekforward'].forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch (e) {
        // Unsupported action on this browser; nothing to clear.
      }
    });
  }

  function updatePipCanvasSize() {
    if (!pipCanvas || !pipVideo) return;
    const rect = pipVideo.getBoundingClientRect();
    const side = Math.max(
      PIP_CANVAS_MIN_SIZE,
      Math.min(PIP_CANVAS_MAX_SIZE, Math.round(Math.max(rect.width || 0, rect.height || 0, PIP_CANVAS_DEFAULT_SIZE)))
    );
    if (pipCanvas.width !== side || pipCanvas.height !== side) {
      pipCanvas.width = side;
      pipCanvas.height = side;
      pipVideo.width = side;
      pipVideo.height = side;
    }
  }

  function setupPipResizeTracking() {
    if (!pipVideo || pipResizeObserver) return;
    if (typeof ResizeObserver === 'function') {
      pipResizeObserver = new ResizeObserver(() => {
        if (pipResizeRafPending) return;
        pipResizeRafPending = true;
        requestAnimationFrame(() => {
          pipResizeRafPending = false;
          updatePipCanvasSize();
        });
      });
      pipResizeObserver.observe(pipVideo);
    } else if (!pipWindowResizeFallbackActive) {
      window.addEventListener('resize', updatePipCanvasSize, { passive: true });
      pipWindowResizeFallbackActive = true;
    }
  }

  function cleanupPipResizeTracking() {
    if (pipResizeObserver) {
      try { pipResizeObserver.disconnect(); } catch {}
      pipResizeObserver = null;
    }
    if (pipWindowResizeFallbackActive) {
      window.removeEventListener('resize', updatePipCanvasSize);
      pipWindowResizeFallbackActive = false;
    }
    pipResizeRafPending = false;
  }

    /**
   * Gets the displayed text and sub-lines (transliteration / translation) for a given
   * lyric line index. Reads from the live DOM so Chinese conversion and other visual
   * changes are always reflected in the PiP canvas.
   */
  function getPipLineGroupText(lineIndex) {
    if (!currentLyricsContainer) return [];
    const base = currentLyricsContainer.querySelector(`p[data-lyrics-line-index="${lineIndex}"]`);
    if (!(base instanceof HTMLElement)) return [];
    const lines = [];
    const baseText = (base.textContent || '').trim();
    if (baseText) lines.push(baseText);
    let next = base.nextElementSibling;
    while (next && !(next.tagName.toUpperCase() === 'P' && next.hasAttribute('data-lyrics-line-index'))) {
      const isTransliteration = next.getAttribute('data-transliteration') === 'true';
      const isTranslation = next.getAttribute('data-translated') === 'true';
      if (isTransliteration || isTranslation) {
        const text = (next.textContent || '').trim();
        if (text) lines.push(isTranslation ? `~TL~${text}` : `~TR~${text}`);
      }
      next = next.nextElementSibling;
    }
    return lines;
  }

  function splitPipTextToLines(ctx, text, maxWidth) {
    const cleaned = (text || '').trim();
    if (!cleaned) return [];
    const words = cleaned.split(/\s+/);
    const out = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const candidate = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else if (line) {
        out.push(line);
        line = words[i];
      } else {
        out.push(words[i]);
      }
    }
    if (line) out.push(line);
    return out;
  }

  function flattenPipBlockRows(ctx, texts, maxWidth, primaryFont, primaryLineHeight, secondaryFont, secondaryLineHeight, color, blockKind) {
    const rows = [];
    texts.forEach((text, index) => {
      const isTranslation = typeof text === 'string' && text.startsWith('~TL~');
      const isTransliteration = typeof text === 'string' && text.startsWith('~TR~');
      const cleanText = isTranslation || isTransliteration ? text.slice(4) : text;
      // On the active line, the main container bolds the transliteration text to match
      // the highlighted lyric (see highlightSyncedLyrics(): nextEl.style.fontWeight =
      // "700"). Apply the same "bold" font prefix here so PiP matches - translation is
      // left as-is since the main container never bolds it either.
      const isActiveTransliteration = isTransliteration && blockKind === 'active';
      const rowFont = index === 0
        ? primaryFont
        : (isActiveTransliteration ? `bold ${secondaryFont}` : secondaryFont);
      const rowLineHeight = index === 0 ? primaryLineHeight : secondaryLineHeight;
      ctx.font = rowFont;
      splitPipTextToLines(ctx, cleanText, maxWidth).forEach(line => {
        let resolvedColor = color;
        if (isTranslation && blockKind === 'active') {
          resolvedColor = TRANSLATION_ACTIVE_COLOR;
        } else if (isTranslation) {
          resolvedColor = 'rgba(160, 160, 160, 0.9)';
        } else if (isTransliteration && blockKind === 'active') {
          resolvedColor = TRANSLITERATION_ACTIVE_COLOR;
        } else if (isTransliteration) {
          resolvedColor = '#9a9a9a';
        }
        rows.push({ text: line, font: rowFont, lineHeight: rowLineHeight, color: resolvedColor });
      });
    });
    return rows;
  }

  /**
   * Visually hides the HTML lyric children so the placeholder notice is what's seen in the lyrics container area.
   *
   * IMPORTANT: pipVideo must NOT be moved/reparented here. Moving the video node
   * after requestPictureInPicture() causes the browser to immediately fire
   * leavepictureinpicture, killing the session. We leave pipVideo in document.body
   * and just hide the lyric children so the container looks empty, then show a notice.
   */
  function enterPipInLyricsContainer() {
    const lyricsContainer = document.getElementById('lyrics-plus-content');
    if (!lyricsContainer) return;
    // Strip any stray text nodes (e.g. "Loading lyrics...", or other raw status text
    // left over from a plain textContent assignment). Only real lyric <p> elements
    // should be preserved/hidden below; loose text would otherwise sit right next to
    // the PiP notice and look like a duplicated message.
    Array.from(lyricsContainer.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    });
    // Exclude the PiP notice itself from the saved/hidden set. Otherwise, calling
    // this function again while PiP is already active (e.g. a status message
    // change like "Loading lyrics..." -> "No lyrics found from any provider")
    // would re-capture the existing notice as one of the "children to hide",
    // set it to display:none, and then ensurePipNoticeShown()'s existence check
    // below would see the (now-hidden) notice already in the DOM and skip
    // re-showing it -- leaving the container blank.
    const savedChildren = Array.from(lyricsContainer.children)
      .filter(el => el.id !== PIP_NOTICE_ID)
      .map(el => ({
        el,
        display: el.style.display,
      }));
    lyricsContainer._pipSavedChildren = savedChildren;
    savedChildren.forEach(({ el }) => { el.style.display = 'none'; });
    lyricsContainer.setAttribute('data-pip-active', 'true');
    // isPagePipActive here means the unsupported fallback (see
    // activatePipUnsupportedFallback()) - no floating window exists in that case,
    // so the notice must say so instead of claiming a PiP window opened.
    ensurePipNoticeShown(lyricsContainer, isPagePipActive ? PIP_UNSUPPORTED_NOTICE_TEXT : PIP_ACTIVE_NOTICE_TEXT);
  }

  /**
   * Restores the HTML lyric children hidden by enterPipInLyricsContainer().
   * pipVideo stays in document.body throughout — we never moved it.
   */
  function exitPipFromLyricsContainer() {
    const lyricsContainer = document.getElementById('lyrics-plus-content');
    if (lyricsContainer) {
      lyricsContainer.removeAttribute('data-pip-active');
      const notice = lyricsContainer.querySelector(`#${PIP_NOTICE_ID}`);
      if (notice) notice.remove(); // NEW in 17.28
      if (lyricsContainer._pipSavedChildren) {
        lyricsContainer._pipSavedChildren.forEach(({ el, display }) => {
          el.style.display = display;
        });
        delete lyricsContainer._pipSavedChildren;
      }
      // If PiP was hiding a non-lyrics status message (e.g. "Loading lyrics...", "No
      // lyrics found from any provider") rather than real lyric lines, there's no
      // saved <p> element to restore above — put the status text back now that the
      // PiP notice is gone, so the main container doesn't end up blank.
      if (currentLyricsStatusMessage && !currentSyncedLyrics && !currentUnsyncedLyrics) {
        lyricsContainer.textContent = currentLyricsStatusMessage;
      }
    }
    applyHiddenPipVideoStyle();
    if (document.body && pipVideo && !pipVideo.parentNode) document.body.appendChild(pipVideo);
  }

  /**
   * Translation/transliteration divs are inserted directly into
   * lyricsContainer by translateLyricsInPopup()/showTransliterationInPopup(),
   * *after* enterPipInLyricsContainer() has already hidden the existing lyric
   * lines and shown the PiP notice. Without this, those newly-inserted divs
   * are never hidden - the PiP window shows the translation correctly (it
   * reads the text via data attributes, independent of layout), but the same
   * divs also sit in the main container, visible right alongside/under the
   * "This video is playing in Picture-in-Picture mode" notice.
   *
   * Call this right after inserting any such element while PiP may be
   * active, so it gets hidden immediately and restored correctly (instead of
   * staying visible until PiP is exited) by exitPipFromLyricsContainer().
   */
  function hideElementWhilePipActive(lyricsContainer, el) {
    if (!lyricsContainer || !el) return;
    if (!(isPipActive || isPagePipActive)) return;
    if (!lyricsContainer._pipSavedChildren) lyricsContainer._pipSavedChildren = [];
    lyricsContainer._pipSavedChildren.push({ el, display: el.style.display });
    el.style.display = 'none';
  }

  /**
   * Counterpart to hideElementWhilePipActive(): call before/after removing an
   * element that may have been registered there (e.g. removeTranslatedLyrics()/
   * removeTransliterationLyrics()), so exitPipFromLyricsContainer() doesn't
   * later try to restore display on an element no longer in the DOM.
   */
  function unhideElementWhilePipActive(lyricsContainer, el) {
    if (!lyricsContainer || !lyricsContainer._pipSavedChildren) return;
    lyricsContainer._pipSavedChildren = lyricsContainer._pipSavedChildren.filter(entry => entry.el !== el);
  }

  /**
   * No-op guard kept for call-site compatibility.
   * pipVideo is never reparented into lyricsContainer in the new approach,
   * so there is nothing to detach before innerHTML/textContent wipes.
   */
  function pipVideoDetachIfInContainer() {
    // pipVideo stays in document.body for the entire PiP session lifetime.
    // Nothing to do here.
  }

  /**
   * Creates the hidden <canvas> and <video> elements used by the PiP feature.
   * Must be called (and awaited) once before requestPictureInPicture().
   * With version 17.27: this is now async and awaits waitForPipVideoReady() before returning,
   * so the video has actually received a frame (readyState >= HAVE_METADATA) by the time
   * togglePip() calls requestPictureInPicture(). Without this, the very first toggle could
   * throw "Video readyState is HAVE_NOTHING" because captureStream() hadn't delivered a
   * frame yet. On later toggles this resolves instantly since pipVideo already exists.
   */
  async function initPipElements() {
    if (pipVideo) return;

    pipCanvas = document.createElement('canvas');
    pipCanvas.width = PIP_CANVAS_DEFAULT_SIZE;
    pipCanvas.height = PIP_CANVAS_DEFAULT_SIZE;
    pipCtx = pipCanvas.getContext('2d');

    pipVideo = document.createElement('video');
    pipVideo.muted = true;
    pipVideo.autoplay = true;
    pipVideo.playsInline = true;
    pipVideo.width = pipCanvas.width;
    pipVideo.height = pipCanvas.height;
    applyHiddenPipVideoStyle();
    if (document.body) {
      document.body.appendChild(pipVideo);
    } else if (document.documentElement) {
      document.documentElement.appendChild(pipVideo);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (!pipVideo.parentNode && document.body) document.body.appendChild(pipVideo);
      }, { once: true });
    }
    setupPipResizeTracking();
    updatePipCanvasSize();

    pipCtx.fillRect(0, 0, 1, 1);
    pipVideo.srcObject = pipCanvas.captureStream(30);
    try { await pipVideo.play(); } catch {}

    // Wait for the stream to actually deliver metadata/a frame before this
    // function resolves, so requestPictureInPicture() won't be called on a video that isn't
    // ready yet.
    await waitForPipVideoReady(pipVideo);

    pipVideo.addEventListener('enterpictureinpicture', () => {
      isPipActive = true;
      updatePipButtonState(true);
      enterPipInLyricsContainer();
      syncPipMediaStateFromSpotify();
      startPipRenderLoop();
      setupPipMediaSessionHandlers();
      console.info('📺 [Lyrics+ PiP] Picture-in-Picture window opened (isPipActive=%s isPagePipActive=%s)', isPipActive, isPagePipActive);
    });

    pipVideo.addEventListener('leavepictureinpicture', () => {
      isPipActive = false;
      isPagePipActive = false;
      updatePipButtonState(false);
      stopPipRenderLoop();
      exitPipFromLyricsContainer();
      teardownPipMediaSessionHandlers();
      console.info('📺 [Lyrics+ PiP] Picture-in-Picture window closed (isPipActive=%s isPagePipActive=%s)', isPipActive, isPagePipActive);
    });

    // Safari/WebKit: uses webkitpresentationmodechanged instead of PiP events (need to test later)
    pipVideo.addEventListener('webkitpresentationmodechanged', () => {
      const mode = typeof pipVideo.webkitPresentationMode === 'string'
        ? pipVideo.webkitPresentationMode : 'inline';
      const active = mode === 'picture-in-picture';
      if (active && !isPipActive) {
        isPipActive = true;
        updatePipButtonState(true);
        enterPipInLyricsContainer();
        syncPipMediaStateFromSpotify();
        startPipRenderLoop();
      } else if (!active && isPipActive) {
        isPipActive = false;
        updatePipButtonState(false);
        stopPipRenderLoop();
        exitPipFromLyricsContainer();
      }
    });

    pipVideo.addEventListener('play', handlePipVideoPlay);
    pipVideo.addEventListener('pause', handlePipVideoPause);
    pipVideo.addEventListener('volumechange', handlePipVideoVolumeChange);
  }

  let pipLastDebugLogAt = 0;
  // Tracks the last lyrics array PiP rendered against, and the index it's
  // actually displaying (which may lag one step behind the computed target -
  // see pipRenderedIndex below).
  let pipRenderedLyricsRef = null;
  let pipRenderedIndex = -1;
  function drawPipFrame() {
      if (!pipCtx || !pipCanvas || !pipVideo) {
        console.warn('📺 [Lyrics+ PiP] drawPipFrame: bailing out, missing pipCtx/pipCanvas/pipVideo', { pipCtx: !!pipCtx, pipCanvas: !!pipCanvas, pipVideo: !!pipVideo });
        return;
      }
      updatePipCanvasSize();

      // Previously syncPipMediaStateFromSpotify() only ran once at PiP-open time
      // (enterpictureinpicture) and again right after the user clicked the PiP
      // button itself (handlePipVideoPlay/Pause). That kept clicking the PiP
      // button working, but the icon itself never got refreshed after a state
      // change that didn't originate from that click - e.g. pausing via a
      // keyboard media key, another device on the same Spotify Connect session,
      // or a track ending - so the overlay's play/pause icon could silently
      // drift out of sync with Spotify's actual state. drawPipFrame() already
      // runs on an ongoing, throttled loop for as long as PiP is active (see
      // startPipRenderLoop/PIP_FRAME_THROTTLE_MS), so it's a natural place to
      // keep re-checking and correcting pipVideo's paused state to match.
      syncPipMediaStateFromSpotify();

      const w = pipCanvas.width;
      const h = pipCanvas.height;
      const textMaxWidth = w - (PIP_CANVAS_H_PADDING * 2);
      const centerX = w / 2;
      const centerY = h / 2;

      const isAmoled = localStorage.getItem('lyricsPlusTheme') === 'true';
      pipCtx.fillStyle = isAmoled ? '#000000' : '#121212';
      pipCtx.fillRect(0, 0, w, h);

      const baseFontSize = parseInt(localStorage.getItem(STORAGE_KEYS.FONT_SIZE) || '22', 10);
      const sizeScale = Math.max(0.7, Math.min(1.5, w / 640));
      const activeFontSize = Math.max(18, Math.round(baseFontSize * 1.25 * sizeScale));
      const contextFontSize = Math.max(13, Math.round(activeFontSize * 0.72));
      const sublineFontSize = Math.max(11, Math.round(contextFontSize * 0.92));
      const activeLineHeight = Math.round(activeFontSize * 1.26);
      const contextLineHeight = Math.round(contextFontSize * 1.22);
      const sublineLineHeight = Math.round(sublineFontSize * 1.2);
      const blockGap = Math.max(8, Math.round(activeFontSize * 0.42));

      pipCtx.textAlign = 'center';
      pipCtx.textBaseline = 'top';

      if (currentSyncedLyrics && currentSyncedLyrics.length > 0) {
        const posEl = document.querySelector('[data-testid="playback-position"]');
        const curPosMs = posEl ? timeStringToMs(posEl.textContent) : 0;
        const anticipatedMs = curPosMs + getAnticipationOffset();

        let activeIndex = -1;
        for (let i = 0; i < currentSyncedLyrics.length; i++) {
          if (anticipatedMs >= (currentSyncedLyrics[i].time ?? currentSyncedLyrics[i].startTime)) activeIndex = i;
          else break;
        }

        // Reset the dwell-tracking state whenever the lyrics array itself
        // changes (new track / re-fetch), so we don't try to crawl forward
        // from a stale index left over from a previous song.
        if (currentSyncedLyrics !== pipRenderedLyricsRef) {
          pipRenderedLyricsRef = currentSyncedLyrics;
          pipRenderedIndex = activeIndex;
        }

        // Both drawPipFrame() and the main container's highlightSyncedLyrics()
        // derive activeIndex from the same source: Spotify's displayed
        // mm:ss position text, which only updates once per whole second. When
        // two lyric lines fall inside the same displayed second, activeIndex
        // can jump by 2 in a single read - the main container's CSS
        // transitions/smooth-scroll visually glide past the skipped line so
        // it's never noticeably missing, but PiP's flat canvas snapshot would
        // otherwise just cut straight past it. To match what the main
        // container effectively guarantees, advance the *rendered* index by
        // at most one step per tick on forward jumps, so every line gets
        // displayed for at least one redraw before moving on. Backward jumps
        // (rewind/seek) snap immediately - there's nothing to "catch up" on.
        if (activeIndex > pipRenderedIndex + 1) {
          pipRenderedIndex += 1;
        } else {
          pipRenderedIndex = activeIndex;
        }
        activeIndex = pipRenderedIndex;

        if (performance.now() - pipLastDebugLogAt > 2000) {
          pipLastDebugLogAt = performance.now();
          console.info('📺 [Lyrics+ PiP] drawPipFrame tick: posElFound=%s posText=%s curPosMs=%s activeIndex=%s of %s',
            !!posEl, posEl ? posEl.textContent : null, curPosMs, activeIndex, currentSyncedLyrics.length);
        }

        if (activeIndex !== -1) {
          const prevTexts = getPipLineGroupText(activeIndex - 1);
          const activeTexts = getPipLineGroupText(activeIndex);
          const nextTexts = getPipLineGroupText(activeIndex + 1);

          const fallbackActive = (currentSyncedLyrics[activeIndex]?.text || '').trim();
          const fallbackPrev = activeIndex > 0 ? (currentSyncedLyrics[activeIndex - 1]?.text || '').trim() : '';
          const fallbackNext = activeIndex < currentSyncedLyrics.length - 1
            ? (currentSyncedLyrics[activeIndex + 1]?.text || '').trim() : '';

          const blocks = [];
          if (activeIndex > 0) {
            blocks.push({
              texts: prevTexts.length ? prevTexts : (fallbackPrev ? [fallbackPrev] : []),
              color: 'rgba(255, 255, 255, 0.7)',
              primaryFont: `${contextFontSize}px sans-serif`,
              primaryLineHeight: contextLineHeight,
              kind: 'context',
            });
          }
          blocks.push({
            texts: activeTexts.length ? activeTexts : (fallbackActive ? [fallbackActive] : []),
            color: '#1db954',
            primaryFont: `bold ${activeFontSize}px sans-serif`,
            primaryLineHeight: activeLineHeight,
            kind: 'active',
          });
          if (activeIndex < currentSyncedLyrics.length - 1) {
            blocks.push({
              texts: nextTexts.length ? nextTexts : (fallbackNext ? [fallbackNext] : []),
              color: 'rgba(255, 255, 255, 0.7)',
              primaryFont: `${contextFontSize}px sans-serif`,
              primaryLineHeight: contextLineHeight,
              kind: 'context',
            });
          }

          const rows = [];
          blocks.forEach((block, idx) => {
            const blockTexts = block.texts.filter(Boolean);
            if (!blockTexts.length) return;
            const blockRows = flattenPipBlockRows(
              pipCtx, blockTexts, textMaxWidth,
              block.primaryFont, block.primaryLineHeight,
              `${sublineFontSize}px sans-serif`, sublineLineHeight,
              block.color, block.kind
            );
            rows.push(...blockRows);
            if (idx < blocks.length - 1 && blockRows.length > 0) {
              rows.push({ spacer: true, lineHeight: blockGap });
            }
          });

          const contentHeight = rows.reduce((sum, row) => sum + (row.lineHeight || 0), 0);
          let drawY = Math.round(centerY - (contentHeight / 2));
          rows.forEach(row => {
            if (row.spacer) { drawY += row.lineHeight; return; }
            pipCtx.font = row.font;
            pipCtx.fillStyle = row.color;
            pipCtx.fillText(row.text, centerX, drawY, textMaxWidth);
            drawY += row.lineHeight;
          });
        }
      } else if (currentUnsyncedLyrics && currentUnsyncedLyrics.length > 0) {
        pipCtx.font = `bold ${activeFontSize}px sans-serif`;
        pipCtx.fillStyle = 'white';
        pipCtx.fillText('Unsynced Lyrics', centerX, centerY - Math.round(activeFontSize * 1.2), textMaxWidth);
        pipCtx.font = `${Math.round(activeFontSize * 0.65)}px sans-serif`;
        pipCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        pipCtx.fillText('View full lyrics in the Lyrics+ popup', centerX, centerY + Math.round(activeFontSize * 0.2), textMaxWidth);
      } else {
        // Mirror whatever status message the main container would be
        // showing (e.g. "Loading lyrics...", "No lyrics found from any provider",
        // an instrumental-track notice), so the PiP window always reflects the
        // real state rather than just "waiting".
        // Split on newlines since some status messages (e.g. the instrumental
        // notice) span multiple lines.
        const statusText = currentLyricsStatusMessage || 'Waiting for lyrics\u2026';
        const statusParagraphs = statusText.split('\n').filter(Boolean);
        pipCtx.font = `bold ${activeFontSize}px sans-serif`;
        // Opaque gray (#b3b3b3 ≈ white at 70% alpha) instead of rgba(255,255,255,0.7):
        // keeps the same dimmed, grayish tone as before, but avoids the soft/blurry
        // anti-aliased edges that come from actually blending a transparent fill
        // over the dark background.
        pipCtx.fillStyle = '#b3b3b3';
        // Word-wrap each paragraph to textMaxWidth via splitPipTextToLines (the same
        // helper the lyrics rows use), rather than passing textMaxWidth straight into
        // fillText(). fillText's maxWidth argument doesn't wrap - it horizontally
        // squishes/compresses the glyphs to force a too-wide line into that width,
        // which is what produced the mangled/squashed look on long single-line
        // messages (e.g. the Spotify token-refresh notice) that contain no \n.
        const statusLines = statusParagraphs.flatMap(p => splitPipTextToLines(pipCtx, p, textMaxWidth));
        const statusLineHeight = Math.round(activeFontSize * 1.3);
        const statusTotalHeight = statusLines.length * statusLineHeight;
        let statusY = Math.round(centerY - (statusTotalHeight / 2));
        statusLines.forEach(line => {
          pipCtx.fillText(line, centerX, statusY);
          statusY += statusLineHeight;
        });
      }
  }

    /**
   * Lazily creates (or returns the existing) dedicated Worker that drives PiP
   * frame redraws via postMessage ticks instead of a main-thread setInterval.
   *
   * Why: window/document timers (rAF, setInterval) get aggressively throttled
   * by Chrome once the tab is hidden/backgrounded - exactly the situation a
   * user watching a floating PiP window is usually in. After a few minutes of
   * backgrounding, "intensive throttling" can drop setInterval to as rarely as
   * once a minute. Workers are not subject to that page-visibility throttling,
   * so a worker-driven tick keeps firing at a steady interval even while the
   * Spotify tab is fully backgrounded, which is what replaces pipFallbackTimer.
   */
  function getPipWorker() {
    if (pipWorker) return pipWorker;
    const workerCode = `
      let timer = null;
      self.onmessage = (e) => {
        if (e.data === 'start') {
          if (timer) return;
          timer = setInterval(() => self.postMessage('tick'), ${TIMING.HIGHLIGHT_INTERVAL_MS});
        } else if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
        }
      };
    `;
    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      pipWorker = new Worker(blobUrl);
      URL.revokeObjectURL(blobUrl); // only needed to construct the Worker, safe to release immediately
      pipWorker.onmessage = (e) => {
        if (e.data === 'tick' && (isPipActive || isPagePipActive)) {
          drawPipFrame();
        }
      };
      pipWorker.onerror = (err) => {
        console.warn('📺 [Lyrics+ PiP] worker error, falling back to setInterval', err);
        pipWorker.terminate();
        pipWorker = null;
        // The worker may have died mid-session (after start() already ran) -
        // arm the main-thread fallback so redraws don't just silently stop.
        if (isPipActive || isPagePipActive) armPipFallbackTimer();
      };
    } catch (err) {
      console.warn('📺 [Lyrics+ PiP] Worker unavailable, falling back to setInterval', err);
      pipWorker = null;
    }
    return pipWorker;
  }

  function armPipFallbackTimer() {
    if (pipFallbackTimer) clearInterval(pipFallbackTimer);
    pipFallbackTimer = setInterval(() => {
      if (!isPipActive && !isPagePipActive) {
        clearInterval(pipFallbackTimer);
        pipFallbackTimer = null;
        return;
      }
      pipLastFrameAt = performance.now();
      drawPipFrame();
    }, PIP_FALLBACK_INTERVAL_MS);
  }

  /**
   * Renders lyrics to the PiP canvas in a requestAnimationFrame loop.
   * Active line = Spotify green (#1db954), context lines = white/faded.
   * Transliteration / translation sub-lines use their own colour codes.
   * AMOLED theme, font size, and all lyric display settings are respected.
   */
  function startPipRenderLoop() {
    console.info('📺 [Lyrics+ PiP] startPipRenderLoop called');
    const rafTick = () => {
      if (!isPipActive && !isPagePipActive) return;
      const now = performance.now();
      if (now - pipLastFrameAt >= PIP_FRAME_THROTTLE_MS) {
        pipLastFrameAt = now;
        drawPipFrame();
      }
      pipAnimationFrame = requestAnimationFrame(rafTick);
    };

    pipLastFrameAt = 0;
    pipAnimationFrame = requestAnimationFrame(rafTick);

    // Worker-driven tick: keeps redrawing at a steady rate even while the tab
    // is backgrounded/hidden, since Workers escape rAF/setInterval throttling.
    const worker = getPipWorker();
    if (worker) {
      worker.postMessage('start');
    } else {
      // Worker unsupported/failed - fall back to the old main-thread backstop.
      armPipFallbackTimer();
    }

    drawPipFrame();
  }

  function stopPipRenderLoop() {
    console.info('📺 [Lyrics+ PiP] stopPipRenderLoop called');
    if (pipAnimationFrame) {
      cancelAnimationFrame(pipAnimationFrame);
      pipAnimationFrame = null;
    }
    if (pipWorker) {
      pipWorker.postMessage('stop');
    }
    if (pipFallbackTimer) {
      clearInterval(pipFallbackTimer);
      pipFallbackTimer = null;
    }
    pipLastFrameAt = 0;
  }

  function updatePipButtonState(active) {
    const btn = document.getElementById('lyrics-plus-pip-btn');
    if (!btn) return;
    btn.style.color = 'white';
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('data-active', String(active));
    btn.setAttribute('aria-label', active ? 'Close Miniplayer' : 'Open Miniplayer');
  }

  async function closePip() {
    if (!isPipActive && !isPagePipActive) return;
    if (pipVideo && document.pictureInPictureElement === pipVideo &&
        typeof document.exitPictureInPicture === 'function') {
      try { await document.exitPictureInPicture(); } catch {}
      return;
    }
    if (pipVideo &&
        typeof pipVideo.webkitPresentationMode === 'string' &&
        pipVideo.webkitPresentationMode === 'picture-in-picture' &&
        typeof pipVideo.webkitSetPresentationMode === 'function') {
      // Safari WebKit: webkitpresentationmodechanged event will handle cleanup
      pipVideo.webkitSetPresentationMode('inline');
      return;
    }
    // Page PiP or any remaining case: clean up synchronously
    isPipActive = false;
    isPagePipActive = false;
    updatePipButtonState(false);
    stopPipRenderLoop();
    exitPipFromLyricsContainer();
  }

  /**
   * Toggles Picture-in-Picture mode. Creates video/canvas elements on first call.
   * Browser priority: native requestPictureInPicture → WebKit PiP → page PiP fallback.
   *
   * With version 17.28: awaits initPipElements() so the video is confirmed ready
   * (readyState >= HAVE_METADATA) before requestPictureInPicture() is called, fixing the
   * "Video readyState is HAVE_NOTHING" error on the very first toggle.
   */
  async function togglePip() {
    console.info('📺 [Lyrics+ PiP] togglePip clicked. isPipActive=%s isPagePipActive=%s pictureInPictureElement===pipVideo=%s',
      isPipActive, isPagePipActive, pipVideo && document.pictureInPictureElement === pipVideo);
    if (isPipActive || isPagePipActive) {
      console.info('📺 [Lyrics+ PiP] togglePip: closing (state flags say active)');
      await closePip();
      return;
    }

    console.info('📺 [Lyrics+ PiP] togglePip: opening (state flags say inactive)');
    await initPipElements();

    // Each entry point below gets its OWN try/catch. Previously the whole native +
    // WebKit + fallback sequence shared one try/catch, so a rejection from
    // requestPictureInPicture() (e.g. Firefox on Android, which exposes the
    // function but always rejects with NotSupportedError since there's no native
    // PiP implementation on that platform) jumped straight past the WebKit check
    // and the fallback and landed in the outer catch - which just logged the error
    // and returned, leaving the button looking like it did nothing at all.
    if (typeof pipVideo.requestPictureInPicture === 'function') {
      try {
        if (isSafariBrowser() && document.body) {
          Object.assign(pipVideo.style, { position: 'absolute', left: 'calc(100% - 1px)', bottom: 'calc(100% - 1px)' });
          if (!pipVideo.parentNode) document.body.appendChild(pipVideo);
        }
        await pipVideo.requestPictureInPicture();
        // Chromium-based Android browsers (Chrome, Edge, Opera, Brave, Vivaldi - same
        // Blink engine as desktop Chrome) resolve this genuinely, including for
        // MediaStream/canvas.captureStream() sources like pipVideo here (supported
        // since Chrome 71). A real floating window exists; nothing more to do.
        return;
      } catch (err) {
        // Gecko-based Android browsers (Firefox and its forks) reject here with
        // NotSupportedError - confirmed via Mozilla's own "Intent to prototype &
        // ship" notice: Android has no native PiP implementation to back this API,
        // so it's rejected there by design, not a bug on their end. Fall through to
        // the remaining entry points below instead of stopping here.
        console.info('📺 [Lyrics+ PiP] requestPictureInPicture() rejected (%s) - trying next fallback', err && err.name);
      }
    }

    if (typeof pipVideo.webkitSupportsPresentationMode === 'function' &&
        pipVideo.webkitSupportsPresentationMode('picture-in-picture') &&
        typeof pipVideo.webkitSetPresentationMode === 'function') {
      try {
        pipVideo.webkitSetPresentationMode('picture-in-picture');
        return;
      } catch (err) {
        console.error('[Lyrics+] PiP error (webkit path):', err);
      }
    }

    activatePipUnsupportedFallback();
  }

  /**
   * Called when no real PiP mechanism worked: requestPictureInPicture doesn't
   * exist on pipVideo, or it exists but rejected (confirmed: Gecko-based Android
   * browsers - Firefox and forks - reject with NotSupportedError, since Android
   * has no native PiP implementation to back it); same for the WebKit path. There
   * is no floating window in this case - pipVideo/pipCanvas stay hidden off-screen
   * the whole time (applyHiddenPipVideoStyle keeps them at -9999px/1x1px/opacity
   * 0) - so, unlike a real PiP session, this must NOT set isPipActive and must NOT
   * start the render loop (nothing is visible to render to). It only sets
   * isPagePipActive, which enterPipInLyricsContainer() checks to show the honest
   * PIP_UNSUPPORTED_NOTICE_TEXT instead of claiming a PiP window opened.
   */
  function activatePipUnsupportedFallback() {
    isPagePipActive = true;
    updatePipButtonState(true);
    enterPipInLyricsContainer();
    console.info('📺 [Lyrics+ PiP] No working PiP mechanism found - showing unsupported fallback notice (isPipActive=%s isPagePipActive=%s)', isPipActive, isPagePipActive);
  }

  /**
   * Appends (or resizes) a trailing spacer element after the last synced lyric line,
   * roughly half the container's visible height. Without this, scrollIntoView({block:
   * "center"}) can't fully center lines near the end of the song: there's not enough
   * scrollable space below them, so the browser clamps the scroll position and the
   * final active lines end up sitting below center instead of centered — unlike the
   * PiP canvas, which draws the active line centered directly and isn't limited by
   * how much content there is to scroll. (NEW in 17.29)
   */
  function ensureLyricsBottomSpacer(container) {
    if (!container) return;
    const desiredHeight = Math.max(0, Math.round((container.clientHeight || 0) / 2));
    let spacer = container.querySelector(`#${LYRICS_BOTTOM_SPACER_ID}`);
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = LYRICS_BOTTOM_SPACER_ID;
      spacer.setAttribute('aria-hidden', 'true');
      spacer.style.pointerEvents = 'none';
      container.appendChild(spacer);
    } else if (spacer !== container.lastElementChild) {
      container.appendChild(spacer); // keep it as the last child after re-renders
    }
    spacer.style.height = `${desiredHeight}px`;
  }

  function highlightSyncedLyrics(lyrics, container) {
    if (!lyrics || lyrics.length === 0) return;
    const pElements = [...container.querySelectorAll("p")];
    if (pElements.length === 0) return;
    if (highlightTimer) {
      clearInterval(highlightTimer);
      highlightTimer = null;
    }
    ensureLyricsBottomSpacer(container);
    highlightTimer = setInterval(() => {
      // Skip all style/size changes while popup is being resized
      if (window.lyricsPlusPopupIsResizing) return;
      ensureLyricsBottomSpacer(container); // keep spacer sized to container as it resizes

      const posEl = document.querySelector('[data-testid="playback-position"]');
      const isPlaying = isSpotifyPlaying();

      if (isShowingSyncedLyrics) {
        if (isPlaying) {
          container.style.overflowY = "auto";
          container.style.pointerEvents = "none";
          container.style.scrollbarWidth = "none";  // Firefox
          container.style.msOverflowStyle = "none"; // IE 10+
          container.classList.add('hide-scrollbar');
        } else {
          container.style.overflowY = "auto";
          container.style.pointerEvents = "";
          container.classList.remove('hide-scrollbar');
          container.style.scrollbarWidth = "";
          container.style.msOverflowStyle = "";
        }
      } else {
        // Always allow scroll and show scrollbar for unsynced
        container.style.overflowY = "auto";
        container.style.pointerEvents = "";
        container.classList.remove('hide-scrollbar');
        container.style.scrollbarWidth = "";
        container.style.msOverflowStyle = "";
      }

      if (!posEl) return;
      const curPosMs = timeStringToMs(posEl.textContent);
      const anticipatedMs = curPosMs + getAnticipationOffset();
      let activeIndex = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (anticipatedMs >= (lyrics[i].time ?? lyrics[i].startTime)) activeIndex = i;
        else break;
      }

      // Walks the sub-line div(s) that follow a lyric <p> - transliteration, translation,
      // or both (in that order) - and gives each its own active/inactive look. Stops as
      // soon as it hits something that isn't a recognized sub-line (e.g. the next lyric's
      // <p>), so it doesn't matter whether one, both, or neither is present.
      function updateSubLines(p, active) {
        let el = p.nextElementSibling;
        while (el) {
          if (el.getAttribute('data-transliteration') === 'true') {
            // Transliteration is the same words as the lyric, just re-scripted - treat it
            // exactly like the lyric line: solid green, bold, when active.
            el.style.color = active ? TRANSLITERATION_ACTIVE_COLOR : "#9a9a9a";
            el.style.fontWeight = active ? "700" : "400";
            el.style.filter = active ? "none" : "blur(0.7px)";
            el.style.opacity = active ? "1" : "0.8";
          } else if (el.getAttribute('data-translated') === 'true') {
            // Translation is separate content, not the lyric itself - keep it subdued so it
            // doesn't compete with the lyric/transliteration, but still tint it green and
            // brighten it while active so it visibly tracks the current line.
            el.style.color = active ? TRANSLATION_ACTIVE_COLOR : "gray";
            el.style.fontWeight = "400";
            el.style.filter = active ? "none" : "blur(0.7px)";
            el.style.opacity = active ? "1" : "0.8";
          } else {
            break;
          }
          el = el.nextElementSibling;
        }
      }

      if (activeIndex === -1) {
        pElements.forEach(p => {
          p.style.color = "white";
          p.style.fontWeight = "400";
          p.style.filter = "blur(0.7px)";
          p.style.opacity = "0.8";
          p.style.transform = "scale(1.0)";
          p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";

          updateSubLines(p, false);
        });
        return;
      }
      pElements.forEach((p, idx) => {
        if (idx === activeIndex) {
          p.style.color = "#1db954";
          p.style.fontWeight = "700";
          p.style.filter = "none";
          p.style.opacity = "1";
          p.style.transform = "scale(1.10)";
          p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";

          updateSubLines(p, true);
        } else {
          p.style.color = "white";
          p.style.fontWeight = "400";
          p.style.filter = "blur(0.7px)";
          p.style.opacity = "0.8";
          p.style.transform = "scale(1.0)";
          p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";

          updateSubLines(p, false);
        }
      });

      // Always auto-center while playing (do NOT auto-center when stopped)
      const activeP = pElements[activeIndex];
      if (activeP && isPlaying) {
        activeP.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, TIMING.HIGHLIGHT_INTERVAL_MS);
  }

  function updateTabs(tabsContainer, noneSelected) {
    [...tabsContainer.children].forEach(btn => {
      if (noneSelected || !Providers.current) {
        btn.style.backgroundColor = "#333";
      } else {
        btn.style.backgroundColor = (btn.textContent === Providers.current) ? "#1aa34a" : "#333";
      }
    });
  }

  // --- Play/Pause Icon SVGs ---
  const playSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  playSVG.setAttribute("viewBox", "0 0 24 24");
  playSVG.setAttribute("width", "20");
  playSVG.setAttribute("height", "20");
  playSVG.setAttribute("fill", "white");
  playSVG.innerHTML = `<path d="M8 5v14l11-7z"/>`;

  const pauseSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pauseSVG.setAttribute("viewBox", "0 0 24 24");
  pauseSVG.setAttribute("width", "20");
  pauseSVG.setAttribute("height", "20");
  pauseSVG.setAttribute("fill", "white");
  pauseSVG.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;

  // --- Shuffle Icon SVGs ---
  const shuffleOffSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  shuffleOffSVG.setAttribute("viewBox", "0 0 16 16");
  shuffleOffSVG.setAttribute("width", "16");
  shuffleOffSVG.setAttribute("height", "16");
  shuffleOffSVG.setAttribute("fill", "currentColor");
  shuffleOffSVG.innerHTML = `<path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .39 3.5z"/><path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z"/>`;

  const shuffleSmartSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  shuffleSmartSVG.setAttribute("viewBox", "0 0 16 16");
  shuffleSmartSVG.setAttribute("width", "16");
  shuffleSmartSVG.setAttribute("height", "16");
  shuffleSmartSVG.setAttribute("fill", "currentColor");
  shuffleSmartSVG.innerHTML = `<path d="M4.502 0a.637.637 0 0 1 .634.58 4.84 4.84 0 0 0 .81 2.184c.515.739 1.297 1.356 2.487 1.486a.637.637 0 0 1 0 1.267c-1.19.13-1.972.747-2.487 1.487a4.8 4.8 0 0 0-.81 2.185.637.637 0 0 1-1.268 0 4.8 4.8 0 0 0-.81-2.185C2.543 6.265 1.76 5.648.57 5.518a.637.637 0 0 1 0-1.268c1.19-.13 1.972-.747 2.487-1.486a4.84 4.84 0 0 0 .81-2.185A.637.637 0 0 1 4.502 0m4.765 11.878c.056.065.126.15.198.236l.33.397.013.015A3 3 0 0 0 12.1 13.59h1.009l-.444.443a.75.75 0 0 0 1.061 1.06l2.254-2.253-2.254-2.254a.75.75 0 0 0-1.06 1.06l.443.444H12.1a1.5 1.5 0 0 1-1.146-.533l-.004-.005-.333-.4-.288-.343-.031-.035-.02-.021-.037-.037-.974 1.16Z"/><path d="M12.69 4.196a.75.75 0 0 1 1.06 0l2.254 2.254-2.254 2.254a.75.75 0 0 1-1.06-1.06l.443-.444h-1.008a1.5 1.5 0 0 0-1.15.536l-4.63 5.517c-.344.411-.982 1.021-1.822 1.021v-1.5c.122 0 .371-.124.674-.485l4.63-5.517A3 3 0 0 1 12.125 5.7h1.008l-.443-.443a.75.75 0 0 1 0-1.061"/>`;

  // --- Repeat Icon SVGs ---
  const repeatOffSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  repeatOffSVG.setAttribute("viewBox", "0 0 16 16");
  repeatOffSVG.setAttribute("width", "16");
  repeatOffSVG.setAttribute("height", "16");
  repeatOffSVG.setAttribute("fill", "currentColor");
  repeatOffSVG.innerHTML = `<path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75z"/>`;

  const repeatOneSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  repeatOneSVG.setAttribute("viewBox", "0 0 16 16");
  repeatOneSVG.setAttribute("width", "16");
  repeatOneSVG.setAttribute("height", "16");
  repeatOneSVG.setAttribute("fill", "currentColor");
  repeatOneSVG.innerHTML = `<path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h.75v1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75zM12.25 2.5a2.25 2.25 0 0 1 2.25 2.25v5A2.25 2.25 0 0 1 12.25 12H9.81l1.018-1.018a.75.75 0 0 0-1.06-1.06L6.939 12.75l2.829 2.828a.75.75 0 1 0 1.06-1.06L9.811 13.5h2.439A3.75 3.75 0 0 0 16 9.75v-5A3.75 3.75 0 0 0 12.25 1h-.75v1.5z"/><path d="m8 1.85.77.694H6.095V1.488q1.046-.077 1.507-.385.474-.308.583-.913h1.32V8H8z"/><path d="M8.77 2.544 8 1.85v.693z"/>`;

  // --- Previous/Next Icon SVGs ---
  const previousSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  previousSVG.setAttribute("viewBox", "0 0 16 16");
  previousSVG.setAttribute("width", "16");
  previousSVG.setAttribute("height", "16");
  previousSVG.setAttribute("fill", "currentColor");
  previousSVG.innerHTML = `<path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7z"/>`;

  const nextSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  nextSVG.setAttribute("viewBox", "0 0 16 16");
  nextSVG.setAttribute("width", "16");
  nextSVG.setAttribute("height", "16");
  nextSVG.setAttribute("fill", "currentColor");
  nextSVG.innerHTML = `<path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z"/>`;

  // --- Play/Pause SVG for later use (smaller 16x16 version) ---
  const playSmallSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  playSmallSVG.setAttribute("viewBox", "0 0 16 16");
  playSmallSVG.setAttribute("width", "16");
  playSmallSVG.setAttribute("height", "16");
  playSmallSVG.setAttribute("fill", "currentColor");
  playSmallSVG.innerHTML = `<path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288z"/>`;

  const pauseSmallSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pauseSmallSVG.setAttribute("viewBox", "0 0 16 16");
  pauseSmallSVG.setAttribute("width", "16");
  pauseSmallSVG.setAttribute("height", "16");
  pauseSmallSVG.setAttribute("fill", "currentColor");
  pauseSmallSVG.innerHTML = `<path d="M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z"/>`;

  // --- Language-universal play/pause root words for major Spotify UI languages (Aids Play/Pause button detection to reflect playback state inside gui)---
    const PAUSE_WORDS = [
  // English
  "pause",
  // Spanish, Italian, Portuguese, Galician, Filipino
  "pausa",
  // French
  "pause",
  // German
  "pause", "pausieren", "anhalten",
  // Dutch
  "pauze",
  // Polish, Czech, Slovak, Bosnian, Serbian, Croatian, Macedonian, Romanian
  "pauza",
  // Slovenian
  "pavza",
  // Hungarian
  "szünet",
  // Russian, Ukrainian, Bulgarian, Belarusian, Macedonian, Serbian
  "пауза",
  // Turkish
  "durdur",
  // Greek
  "παύση",
  // Japanese
  "一時停止",
  // Korean
  "일시정지",
  // Chinese (Simplified/Traditional)
  "暂停", "暫停",
  // Thai
  "หยุด", "หยุดชั่วคราว",
  // Arabic
  "إيقاف", "إيقاف مؤقت", "توقف",
  // Hebrew
  "השהה",
  // Hindi
  "रोकें",
  // Bengali
  "বিরতি",
  // Vietnamese
  "tạm dừng",
  // Indonesian, Malay
  "jeda",
  // Romanian
  "pauză",
  // Finnish
  "tauko",
  // Swedish, Norwegian, Danish
  "paus",
];

const PLAY_WORDS = [
  // English
  "play",
  // Spanish
  "reproducir",
  // French
  "lecture", "jouer",
  // Italian
  "riproduci",
  // Portuguese
  "reproduzir",
  // German
  "abspielen",
  // Dutch
  "afspelen",
  // Polish
  "odtwórz",
  // Czech, Slovak
  "přehrát",
  // Hungarian
  "lejátszás",
  // Russian, Ukrainian, Bulgarian, Belarusian, Macedonian, Serbian
  "играть", "воспроизвести", "відтворити",
  // Turkish
  "oynat",
  // Greek
  "αναπαραγωγή",
  // Japanese
  "再生",
  // Korean
  "재생",
  // Chinese (Simplified/Traditional)
  "播放",
  // Thai
  "เล่น",
  // Arabic
  "تشغيل",
  // Hebrew
  "נגן",
  // Hindi
  "चलाएं",
  // Bengali
  "বাজান",
  // Vietnamese
  "phát",
  // Indonesian, Malay
  "putar",
  // Finnish
  "toista",
  // Swedish, Norwegian, Danish
  "spela",
  // Romanian
  "redare",
];

  function labelMeansPause(label) {
    if (!label) return false;
    label = label.toLowerCase();
    return PAUSE_WORDS.some(word => label.includes(word));
  }
  function labelMeansPlay(label) {
    if (!label) return false;
    label = label.toLowerCase();
    return PLAY_WORDS.some(word => label.includes(word));
  }

  // --- Helper functions to clone SVG icons from Spotify's visible DOM buttons ---
  // This approach uses the actual visible elements from Spotify's DOM instead of maintaining custom SVG definitions
  // Benefits: Language-independent, automatically syncs with Spotify's UI updates, and shows exact icons Spotify uses

  /**
   * Clones an SVG element from a button, adjusts its size, and returns it.
   * @param {HTMLElement} sourceButton - The Spotify button to clone the SVG from
   * @param {number} width - Target width for the cloned SVG (default 16)
   * @param {number} height - Target height for the cloned SVG (default 16)
   * @returns {SVGElement|null} Cloned and resized SVG, or null if not found
   */
  function cloneSvgFromButton(sourceButton, width = 16, height = 16) {
    if (!sourceButton) return null;
    const svg = sourceButton.querySelector('svg');
    if (!svg) return null;

    const clonedSvg = svg.cloneNode(true);
    clonedSvg.setAttribute('width', String(width));
    clonedSvg.setAttribute('height', String(height));
    clonedSvg.style.setProperty('--encore-icon-width', `${width}px`);
    clonedSvg.style.setProperty('--encore-icon-height', `${height}px`);
    return clonedSvg;
  }

  // --- Constants for Spotify green color detection ---
  // Spotify's active button color is approximately rgb(30, 185, 84) = #1db954
  const SPOTIFY_GREEN_MIN_G_VALUE = 100;  // Minimum green channel value for active state
  const SPOTIFY_GREEN_RATIO_THRESHOLD = 1.5;  // Green must be this many times greater than R and B

  /**
   * Checks if an SVG has shuffle-icon-like structure.
   * Shuffle icons have 2 paths with diagonal arrow patterns.
   * @param {SVGElement} svg - The SVG element to check
   * @returns {boolean} True if the SVG appears to be a shuffle icon
   */
  function isShuffleSvg(svg) {
    if (!svg) return false;
    const paths = svg.querySelectorAll('path');
    // Shuffle icon typically has 2 paths (regular) or 3+ paths (smart shuffle)
    if (paths.length < 2) return false;

    // Check if viewBox is 16x16 (standard for these icons)
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox && viewBox.includes('16 16')) {
      return true;
    }

    // Fallback: check total path data length - shuffle icons are moderately complex
    const totalPathLength = Array.from(paths)
      .map(p => (p.getAttribute('d') || '').length)
      .reduce((a, b) => a + b, 0);
    // Shuffle icon paths are typically 200-800 characters total
    return totalPathLength > 150 && totalPathLength < 1000;
  }

   /**
   * Parses an RGB color string and checks if it represents Spotify green.
   * @param {string} colorStr - CSS color string (e.g., "rgb(30, 185, 84)")
   * @returns {boolean} True if the color is Spotify green
   */
  function isSpotifyGreenColor(colorStr) {
    if (!colorStr) return false;
    const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!rgbMatch) return false;
    const [, r, g, b] = rgbMatch.map(Number);
    // Spotify green has high G value relative to R and B
    return g > SPOTIFY_GREEN_MIN_G_VALUE &&
           g > r * SPOTIFY_GREEN_RATIO_THRESHOLD &&
           g > b * SPOTIFY_GREEN_RATIO_THRESHOLD;
  }

   /**
   * Finds the currently visible Spotify shuffle button.
   * The shuffle button doesn't have a data-testid, so we find it by looking at the
   * playback controls and finding a button with shuffle-like SVG structure.
   * @returns {HTMLElement|null} The visible shuffle button or null
   */
  function findSpotifyShuffleButton() {
    // Known playback control buttons by data-testid
    const knownTestIds = [
      'control-button-skip-back',
      'control-button-playpause',
      'control-button-skip-forward',
      'control-button-repeat'
    ];

    /**
     * Checks if a button is a shuffle button candidate.
     * @param {HTMLElement} btn - Button to check
     * @returns {boolean} True if button appears to be shuffle button
     */
    function isShuffleButtonCandidate(btn) {
      if (btn.offsetParent === null) return false;
      const testId = btn.getAttribute('data-testid');
      if (knownTestIds.includes(testId)) return false;
      const svg = btn.querySelector('svg');
      return isShuffleSvg(svg);
    }

    // Look for buttons in the playback controls area
    const playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]');
    if (playPauseBtn) {
      // Get the parent container of playback controls
      const controlsContainer = playPauseBtn.closest('[class*="player-controls"]') ||
                                 playPauseBtn.parentElement?.parentElement;
      if (controlsContainer) {
        const buttons = controlsContainer.querySelectorAll('button');
        for (const btn of buttons) {
          if (isShuffleButtonCandidate(btn)) {
            return btn;
          }
        }
      }
    }

    // Fallback: search all buttons
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      if (isShuffleButtonCandidate(btn)) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Finds the currently visible Spotify repeat button.
   * @returns {HTMLElement|null} The visible repeat button or null
   */
  function findSpotifyRepeatButton() {
    return document.querySelector('[data-testid="control-button-repeat"]');
  }

  /**
   * Finds the currently visible Spotify play/pause button.
   * @returns {HTMLElement|null} The visible play/pause button or null
   */
  function findSpotifyPlayPauseButton() {
    return document.querySelector('[data-testid="control-button-playpause"]');
  }

  /**
   * Finds the currently visible Spotify previous button.
   * @returns {HTMLElement|null} The visible previous button or null
   */
  function findSpotifyPreviousButton() {
    return document.querySelector('[data-testid="control-button-skip-back"]');
  }

  /**
   * Finds the currently visible Spotify next button.
   * @returns {HTMLElement|null} The visible next button or null
   */
  function findSpotifyNextButton() {
    return document.querySelector('[data-testid="control-button-skip-forward"]');
  }

  /**
   * Checks if an element or its SVG child has Spotify green color.
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if element appears to be in active (green) state
   */
  function isElementSpotifyGreen(element) {
    if (!element) return false;

    // Check the element's computed color
    const computedStyle = window.getComputedStyle(element);
    if (isSpotifyGreenColor(computedStyle.color)) {
      return true;
    }

    // Check SVG fill/color
    const svg = element.querySelector('svg');
    if (svg) {
      const svgStyle = window.getComputedStyle(svg);
      if (isSpotifyGreenColor(svgStyle.fill) || isSpotifyGreenColor(svgStyle.color)) {
        return true;
      }
    }

    // Check icon wrapper span
    const iconSpan = element.querySelector('span svg');
    if (iconSpan) {
      const spanStyle = window.getComputedStyle(iconSpan);
      if (isSpotifyGreenColor(spanStyle.fill) || isSpotifyGreenColor(spanStyle.color)) {
        return true;
      }
    }

    return false;
  }

   /**
   * Detects shuffle state based on visual indicators (language-independent).
   * Uses computed color to determine active state and SVG path count to detect smart shuffle.
   * @param {HTMLElement} shuffleBtn - The Spotify shuffle button
   * @returns {'off'|'on'|'smart'} The shuffle state
   */
  function getShuffleStateFromButton(shuffleBtn) {
    if (!shuffleBtn) return 'off';

    // Use computed color to detect active state
    const isActive = isElementSpotifyGreen(shuffleBtn);

    if (!isActive) {
      return 'off';
    }

    // Distinguish between regular shuffle and smart shuffle by checking SVG structure
    // Smart shuffle icon has more path elements (includes star/sparkle elements)
    const svg = shuffleBtn.querySelector('svg');
    if (svg) {
      const paths = svg.querySelectorAll('path');
      // Smart shuffle typically has 3 paths (star + two arrow parts)
      // Regular shuffle has 2 paths
      if (paths.length >= 3) {
        return 'smart';
      }
    }

    return 'on';
  }

  /**
   * Detects repeat state based on button attributes (language-independent).
   * Uses aria-checked attribute which is consistent across languages.
   * @param {HTMLElement} repeatBtn - The Spotify repeat button
   * @returns {'off'|'all'|'one'} The repeat state
   */
  function getRepeatStateFromButton(repeatBtn) {
    if (!repeatBtn) return 'off';

    const ariaChecked = repeatBtn.getAttribute('aria-checked');

    // aria-checked states: 'false' = off, 'true' = all, 'mixed' = one
    if (ariaChecked === 'false') {
      return 'off';
    }
    if (ariaChecked === 'true') {
      return 'all';
    }
    if (ariaChecked === 'mixed') {
      return 'one';
    }

    return 'off';
  }

  // --- Global Button Update Functions (new button-based detection, language-independent) ---
  function getShuffleState() {
    const shuffleBtn = findSpotifyShuffleButton();
    return getShuffleStateFromButton(shuffleBtn);
  }

  function getRepeatState() {
    const repeatBtn = findSpotifyRepeatButton();
    return getRepeatStateFromButton(repeatBtn);
  }

  function updateShuffleButton(button, iconWrapper) {
    const spotifyShuffleBtn = findSpotifyShuffleButton();
    const state = getShuffleStateFromButton(spotifyShuffleBtn);

    // Clear existing icon
    iconWrapper.innerHTML = "";

    // Clone SVG from Spotify's visible button, falling back to static SVGs
    const clonedSvg = cloneSvgFromButton(spotifyShuffleBtn, 16, 16);

    // Use Spotify's locale-specific aria-label when available, with English fallbacks
    // Fallback labels describe what clicking the button will do (next action)
    if (state === 'off') {
      button.setAttribute("aria-label", spotifyShuffleBtn?.getAttribute('aria-label') || "Enable shuffle");
      button.classList.remove("active");
      button.style.color = "rgba(255, 255, 255, 0.7)";
      iconWrapper.appendChild(clonedSvg || shuffleOffSVG.cloneNode(true));
    } else if (state === 'on') {
      button.setAttribute("aria-label", spotifyShuffleBtn?.getAttribute('aria-label') || "Enable smart shuffle");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(clonedSvg || shuffleOffSVG.cloneNode(true));
    } else if (state === 'smart') {
      button.setAttribute("aria-label", spotifyShuffleBtn?.getAttribute('aria-label') || "Disable shuffle");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(clonedSvg || shuffleSmartSVG.cloneNode(true));
    }
  }

  function updateRepeatButton(button, iconWrapper) {
    const spotifyRepeatBtn = findSpotifyRepeatButton();
    const state = getRepeatStateFromButton(spotifyRepeatBtn);

    // Clear existing icon
    iconWrapper.innerHTML = "";

    // Clone SVG from Spotify's visible button, falling back to static SVGs
    const clonedSvg = cloneSvgFromButton(spotifyRepeatBtn, 16, 16);

    // Use Spotify's locale-specific aria-label when available, with English fallbacks
    // Fallback labels describe what clicking the button will do (next action)
    if (state === 'off') {
      button.setAttribute("aria-label", spotifyRepeatBtn?.getAttribute('aria-label') || "Enable repeat");
      button.classList.remove("active");
      button.style.color = "rgba(255, 255, 255, 0.7)";
      iconWrapper.appendChild(clonedSvg || repeatOffSVG.cloneNode(true));
    } else if (state === 'all') {
      button.setAttribute("aria-label", spotifyRepeatBtn?.getAttribute('aria-label') || "Enable repeat one");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(clonedSvg || repeatOffSVG.cloneNode(true));
    } else if (state === 'one') {
      button.setAttribute("aria-label", spotifyRepeatBtn?.getAttribute('aria-label') || "Disable repeat");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(clonedSvg || repeatOneSVG.cloneNode(true));
    }
  }

  function updatePlayPauseButton(button, iconWrapper) {
    const isPlaying = isSpotifyPlaying();
    const spotifyPlayPauseBtn = findSpotifyPlayPauseButton();

    // Clear existing icon
    iconWrapper.innerHTML = "";

    // Clone SVG from Spotify's visible button, falling back to static SVGs
    const clonedSvg = cloneSvgFromButton(spotifyPlayPauseBtn, 16, 16);

    // Use Spotify's locale-specific aria-label when available, with English fallbacks
    if (isPlaying) {
      button.setAttribute("aria-label", spotifyPlayPauseBtn?.getAttribute('aria-label') || "Pause");
      iconWrapper.appendChild(clonedSvg || pauseSmallSVG.cloneNode(true));
    } else {
      button.setAttribute("aria-label", spotifyPlayPauseBtn?.getAttribute('aria-label') || "Play");
      iconWrapper.appendChild(clonedSvg || playSmallSVG.cloneNode(true));
    }
  }

  /**
   * Updates the previous button icon from Spotify's DOM.
   * @param {HTMLElement} iconWrapper - The icon wrapper element to update
   */
  function updatePreviousButtonIcon(iconWrapper) {
    const spotifyPrevBtn = findSpotifyPreviousButton();
    iconWrapper.innerHTML = "";

    const clonedSvg = cloneSvgFromButton(spotifyPrevBtn, 16, 16);
    iconWrapper.appendChild(clonedSvg || previousSVG.cloneNode(true));
  }

  /**
   * Updates the next button icon from Spotify's DOM.
   * @param {HTMLElement} iconWrapper - The icon wrapper element to update
   */
  function updateNextButtonIcon(iconWrapper) {
    const spotifyNextBtn = findSpotifyNextButton();
    iconWrapper.innerHTML = "";

    const clonedSvg = cloneSvgFromButton(spotifyNextBtn, 16, 16);
    iconWrapper.appendChild(clonedSvg || nextSVG.cloneNode(true));
  }

  // --- Update play/pause button state ---
  function updatePlayPauseIcon(btnPlayPause) {
    // Legacy function - now handled by updatePlayPauseButton
    if (btnPlayPause && btnPlayPause.button && btnPlayPause.iconWrapper) {
      updatePlayPauseButton(btnPlayPause.button, btnPlayPause.iconWrapper);
    }
  }

  // ------------------------
  // Providers and Fetchers
  // ------------------------

  async function fetchLRCLibLyrics(songInfo, tryWithoutAlbum = false, lyricsType = 'auto') {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[LRCLIB Debug] Starting lyrics search (synced preferred)`);
  console.log("[LRCLIB Debug] Input info:", {
    artist: songInfo.artist,
    title: songInfo.title,
    album: songInfo.album,
    duration: songInfo.duration
  });
  console.log(`[LRCLIB Debug] Searching ${tryWithoutAlbum ? 'WITHOUT' : 'WITH'} album parameter`);

  const params = [
    `artist_name=${encodeURIComponent(songInfo.artist)}`,
    `track_name=${encodeURIComponent(songInfo.title)}`
  ];

  // Only add album if available and not skipped
  if (songInfo.album && !tryWithoutAlbum) {
    params.push(`album_name=${encodeURIComponent(songInfo.album)}`);
    console.log("[LRCLIB Debug] Including album in search");
  } else if (tryWithoutAlbum) {
    console.log("[LRCLIB Debug] Retrying without album (fallback search)");
  }

  // Only include duration if it's a safe value
  if (songInfo.duration && songInfo.duration >= 10000) {
    const durationSec = Math.floor(songInfo.duration / 1000);
    params.push(`duration=${durationSec}`);
    console.log(`[LRCLIB Debug] Including duration: ${durationSec} seconds`);
  }

  const url = `https://lrclib.net/api/get?${params.join('&')}`;
  console.log("[LRCLIB Debug] Request URL:", url);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        // This header is okay to send — should not break anything
        "x-user-agent": "lyrics-plus-script"
      }
    });

    console.log(`[LRCLIB Debug] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.log("[LRCLIB Debug] ✗ Track not found in LRCLIB database");
      } else if (response.status === 429) {
        console.log("[LRCLIB Debug] ✗ Rate limit exceeded - too many requests");
      } else {
        console.log(`[LRCLIB Debug] ✗ Request failed: ${response.status} ${response.statusText}`);
      }
      return null;
    }

    const data = await response.json();
    console.log("[LRCLIB Debug] Response data:", {
      hasPlainLyrics: !!data.plainLyrics,
      hasSyncedLyrics: !!data.syncedLyrics,
      isInstrumental: !!data.instrumental,
      duration: data.duration
    });

    if (data.instrumental) {
      console.log("[LRCLIB Debug] ⚠ Track marked as instrumental (no lyrics)");
    } else if (data.syncedLyrics || data.plainLyrics) {
      console.log(`[LRCLIB Debug] ✓ Lyrics found! Type: ${data.syncedLyrics ? 'Synced' : 'Unsynced only'}`);
    } else {
      console.log("[LRCLIB Debug] ✗ No lyrics data in response");
    }

    return data;
  } catch (e) {
    console.error("[LRCLIB Debug] ✗ Fetch error:", e.message || e);
    return null;
  }
}
  const ProviderLRCLIB = {
    async findLyrics(info, lyricsType = 'auto') {
      try {
        let data = await fetchLRCLibLyrics(info, false, lyricsType);
        if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
          data = await fetchLRCLibLyrics(info, true, lyricsType); // try without album
        }
        if (!data) return { error: "No lyrics available from LRCLIB" };
        return data;
      } catch (e) {
        return { error: "LRCLIB request failed - connection error or service unreachable" };
      }
    },
    getUnsynced(body) {
      if (body?.instrumental) return null; // Skip to next provider for instrumental tracks
      if (!body?.plainLyrics) return null;
      return Utils.parseLocalLyrics(body.plainLyrics).unsynced;
    },
    getSynced(body) {
      if (body?.instrumental) return null; // Skip to next provider for instrumental tracks
      if (!body?.syncedLyrics) return null;
      return Utils.parseLocalLyrics(body.syncedLyrics).synced;
    }
  };

  // --- KPoe ---
  // KPoe server configuration with fallback support
  const KPOE_SERVERS = [
    "https://lyricsplus.prjktla.my.id",       // Primary server (youly's server)
    "https://lyricsplus.atomix.one/",         // Backup 1 (meow's mirror)
    "https://lyricsplus.binimum.org",         // Backup 2 (binimum's server)
    "https://lyricsplus.prjktla.workers.dev", // Backup 3 (ibra's cf worker)
    "https://lyricsplus-seven.vercel.app",    // Backup 4 (jigen's mirror)
    "https://lyrics-plus-backend.vercel.app"  // Backup 5 (ibra's vercel)
  ];

  async function fetchKPoeLyrics(songInfo, sourceOrder = '', forceReload = false, serverIndex = 0, lyricsType = 'auto', bestSoFar = null, deadServers = null) {
    // deadServers tracks, for this ENTIRE search (all 5 attempts in ProviderKPoe.findLyrics,
    // not just this one cascade), which server indices already failed for reasons that don't
    // depend on the query text (quota, rate limit, CDN/TLS misconfig, server error, network
    // error). Those reasons won't un-happen just because a later attempt sends a differently
    // normalized artist/title, so there's no point spending a request re-checking them. Lazily
    // created here so the function still works if ever called directly without one.
    if (!deadServers) deadServers = new Set();

    // If we've tried all servers, return whatever best candidate we accumulated along the way
    // (Word/None type from an earlier server), rather than discarding it just because no
    // later server had a Line (synced) result.
    if (serverIndex >= KPOE_SERVERS.length) {
      if (bestSoFar) {
        console.log(`[KPoe Debug] ✓ All servers checked, no Line type found - returning best available (${bestSoFar.type} type) from ${bestSoFar.metadata?.server}`);
        return bestSoFar;
      }
      console.log("[KPoe Debug] ✗ All servers exhausted");
      return { error: "All KPoe servers are currently unavailable or rate limited" };
    }

    // Skip servers already known dead for this search - no request made, just move on
    if (deadServers.has(serverIndex)) {
      console.log(`[KPoe Debug] ⏭ Skipping ${KPOE_SERVERS[serverIndex]} (already unavailable this search - no point re-checking with a different query)`);
      return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
    }

    const currentServer = KPOE_SERVERS[serverIndex];
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    // Primary server's serverIndex is 0. If attempting to fetch from a backup server (whose serverIndex is defined as higher than 0), the following log displays:
    if (serverIndex > 0) {
      console.log(`[KPoe Debug] 🔄 Trying backup server ${serverIndex}...`);
    }
    console.log(`[KPoe Debug] Starting lyrics search (synced preferred)`);
    console.log("[KPoe Debug] Using server:", currentServer, `(${serverIndex === 0 ? 'Primary' : 'Backup ' + serverIndex})`);
    console.log("[KPoe Debug] Input info:", {
      artist: songInfo.artist,
      title: songInfo.title,
      album: songInfo.album,
      duration: songInfo.duration,
      sourceOrder: sourceOrder || 'none',
      forceReload: forceReload
    });

    const albumParam = (songInfo.album && songInfo.album !== songInfo.title)
      ? `&album=${encodeURIComponent(songInfo.album)}`
      : '';
    const sourceParam = sourceOrder ? `&source=${encodeURIComponent(sourceOrder)}` : '';
    const forceReloadParam = forceReload ? `&forceReload=true` : '';
    const fetchOptions = { cache: 'no-store' };
    if (forceReload) {
      console.log("[KPoe Debug] Force reload enabled (bypassing server-side cache)");
    }

    const url = `${currentServer}/v2/lyrics/get?title=${encodeURIComponent(songInfo.title)}&artist=${encodeURIComponent(songInfo.artist)}${albumParam}&duration=${songInfo.duration}${sourceParam}${forceReloadParam}`;
    console.log("[KPoe Debug] Request URL:", url);

    try {
      const response = await fetch(url, fetchOptions);
      console.log(`[KPoe Debug] Response status: ${response.status} ${response.statusText}`);

      // Check cache status from headers
      const cacheStatus = response.headers.get('x-cache') || response.headers.get('cf-cache-status') || 'unknown';
      const cacheAge = response.headers.get('age');
      if (cacheStatus !== 'unknown' || cacheAge) {
        console.log(`[KPoe Debug] Cache info: Status=${cacheStatus}${cacheAge ? `, Age=${cacheAge}s` : ''}`);
      }

      // Check if response is ok before parsing
      if (!response.ok) {
        // Handle rate limiting and service unavailability by trying next server
        if (response.status === 429) {
          console.log(`[KPoe Debug] ✗ Rate limit exceeded on ${currentServer}`);
          deadServers.add(serverIndex); // session-wide, not query-dependent - won't clear up mid-search
          // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
        } else if (response.status === 421) {
          // Fastly/CDN routing error - the edge node's TLS cert doesn't cover the Host header
          // being requested (SAN mismatch). This is a misconfiguration on that specific server's
          // CDN, not something retrying the same server would fix, but a different backup server
          // isn't affected by it - so cascade to the next one same as other server errors.
          console.log(`[KPoe Debug] ✗ CDN routing/TLS mismatch (421) on ${currentServer}`);
          deadServers.add(serverIndex); // infra misconfig, unrelated to query - retrying later is pointless
          // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
        } else if (response.status === 402) {
          // "Payment Required" - seen on Vercel-hosted backups when that specific deployment
          // hits its free-tier usage quota. This is a per-deployment billing/quota issue, not
          // a real client error, and doesn't affect other backups (different deployments) -
          // so cascade to the next server same as other server-side errors.
          console.log(`[KPoe Debug] ✗ Payment required (402, likely deployment quota) on ${currentServer}`);
          deadServers.add(serverIndex); // quota won't reset mid-search - skip on later attempts
          // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
        } else if (response.status >= 500) {
          // Catch-all for server errors (500, 503, and Cloudflare edge codes like 502/520/521/522/524)
          console.log(`[KPoe Debug] ✗ Server error (${response.status}) on ${currentServer}`);
          deadServers.add(serverIndex); // not query-dependent - a different attempt won't fix a downed server
          // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);

   /*   FINDING (observed in real logs, prompted this fix): a 404 on one server does NOT reliably
        predict a 404 on the next. In one run, Primary (prjktla.my.id) 404'd on a query while
        Backup 2 (binimum.org) independently returned a 200 with Deezer-sourced lyrics for the
        same exact query. In a later run against the *same song*, that same Backup 2 also 404'd -
        meaning its earlier success was a cache hit that had since expired/evicted, not a
        guarantee, but it still proves the servers aren't just mirrors of one shared upstream
        with identical coverage. The old assumption written here ("backup servers use the same
        upstream data source so trying them after a 404 is pointless") does not hold - different
        KPoe servers can aggregate from different sources (Apple/Spotify/Deezer/etc.) and one
        server's miss says nothing about another's. So a 404 must now cascade like any other
        server-specific failure instead of aborting the whole search.
        IMPORTANT: unlike 429/421/402/5xx above, a 404 is query-dependent (it means "not found
        for THIS title/artist"), so the server is NOT added to deadServers here - a later attempt
        with a differently normalized query is a genuinely different lookup and deserves a real
        chance on this server, not a skip.
   */
        } else if (response.status === 404) {
          console.log(`[KPoe Debug] ✗ Track not found on ${currentServer}`);
          // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);

        } else if (response.status === 400) {
          // Bad request - could stem from how this specific attempt formatted its params, so
          // not marked dead either; a differently-normalized attempt might not hit the same issue.
          console.log("[KPoe Debug] ✗ Bad request - Invalid parameters");
          if (bestSoFar) return bestSoFar;
          return { error: "Bad request - Invalid parameters" };
        } else {
          // Any other 4xx not specifically diagnosed yet (401/403/405/409/418/etc). >=500 above
          // already catches every server-error code, known or not, so by elimination anything
          // reaching here is a 4xx. Every 4xx diagnosed so far (400, 404) is query/request-
          // specific, not server-down - so unknowns get the same treatment as 404: cascade,
          // don't blacklist (deadServers unchanged).
          console.log(`[KPoe Debug] ⚠ Unrecognized status (${response.status}) on ${currentServer}`);
          return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
        }
      }

      // Only parse response on successful status
      const data = await response.json();

      // Determine if from cache based on response headers and metadata
      const isCached = cacheStatus && (cacheStatus.toLowerCase().includes('hit') || cacheAge);
      // Only show cache/fresh indicator if we have actual cache information
      const hasActualCacheInfo = cacheStatus !== 'unknown' || cacheAge;
      const cacheInfo = hasActualCacheInfo ? (isCached ? ' (from cache)' : ' (fresh)') : '';

      console.log("[KPoe Debug] Response data:", {
        hasLyrics: !!(data && data.lyrics),
        lyricsType: data?.type,
        lyricsCount: data?.lyrics?.length || 0,
        source: data?.metadata?.source,
        server: currentServer,
        cached: isCached,
        cacheStatus: cacheStatus,
        cacheAge: cacheAge || 'N/A'
      });

      if (data && data.lyrics && data.lyrics.length > 0) {
        console.log(`[KPoe Debug] ✓ Lyrics found! Type: ${data.type}, Lines: ${data.lyrics.length}, Source: ${data.metadata?.source}`);
        console.log(`[KPoe Debug] ✓ Successfully fetched from: ${currentServer}${cacheInfo}`);
        // Store server info in metadata for later reference
        data.metadata = data.metadata || {};
        data.metadata.server = currentServer;
        data.metadata.cached = isCached;

        if (data.type === "Line") {
          // Best possible type (synced) - stop searching immediately
          return data;
        }

        // Word or None type (unsynced) - keep it as a candidate, but keep looking at
        // remaining servers in case one of them has a Line (synced) result instead.
        const typePriority = { "Line": 3, "Word": 2, "None": 1 };
        const newPriority = typePriority[data.type] ?? 0;
        const bestPriority = bestSoFar ? (typePriority[bestSoFar.type] ?? 0) : -1;
        const updatedBest = newPriority > bestPriority ? data : bestSoFar;
        console.log(`[KPoe Debug] ↳ ${data.type} type stored as candidate, continuing to check remaining servers for a synced result...`);
        return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, updatedBest, deadServers);
      }

      // FIX (parallels the 17.43 404 fix): a 200 OK with an empty/missing lyrics body means
      // THIS server doesn't have the song for this query - it does not mean no server does.
      // Some KPoe servers return 200+empty-array instead of a proper 404 for "not found", so
      // without this the search would previously give up on the whole cascade the moment one
      // server responded 200 with nothing, even though later servers (or even earlier ones,
      // via a different attempt's normalized query) might still have it. Treat it exactly like
      // 404: cascade to the next server, and don't mark this server dead since the outcome is
      // query-dependent, not a session-wide server failure.
      console.log("[KPoe Debug] ✗ No lyrics in response (empty body) - trying next server");
      return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
    } catch (e) {
      console.error("[KPoe Debug] ✗ Fetch error on", currentServer, ":", e.message || e);
      deadServers.add(serverIndex); // network/CORS/DNS-level failure - not query-dependent, won't fix itself mid-search
      // "🔄 Trying backup server X..." is logged at the top of the next fetchKPoeLyrics call (moved there so it leads its own log block)
      return await fetchKPoeLyrics(songInfo, sourceOrder, forceReload, serverIndex + 1, lyricsType, bestSoFar, deadServers);
    }
  }
  function parseKPoeFormat(data) {
    if (!Array.isArray(data.lyrics)) return null;

    // Log server and cache information (only show cache status if we have actual info)
    const serverInfo = data.metadata?.server || 'unknown';
    const hasActualCacheInfo = data.metadata?.cached !== undefined && data.metadata?.cached !== null;
    const cacheInfo = hasActualCacheInfo ? (data.metadata.cached ? ' (cached)' : ' (fresh)') : '';
    console.log(`[KPoe Debug] 📊 Parsing lyrics from: ${serverInfo}${cacheInfo}`);

    const metadata = {
      ...data.metadata,
      source: `${data.metadata?.source || 'Unknown'} (KPoe)`
    };
    return {
      type: data.type,
      data: data.lyrics.map(item => {
        const startTime = Number(item.time) || 0;
        const duration = Number(item.duration) || 0;
        const endTime = startTime + duration;
        const parsedSyllabus = (item.syllabus || []).map(syllable => ({
          text: syllable.text || '',
          time: Number(syllable.time) || 0,
          duration: Number(syllable.duration) || 0,
          isLineEnding: Boolean(syllable.isLineEnding),
          isBackground: Boolean(syllable.isBackground),
          element: syllable.element || {}
        }));
        return {
          text: item.text || '',
          startTime: startTime / 1000,
          duration: duration / 1000,
          endTime: endTime / 1000,
          syllabus: parsedSyllabus,
          element: item.element || {},
          transliteration: item.transliteration || null
        };
      }),
      metadata
    };
  }
  const ProviderKPoe = {
    async findLyrics(info, lyricsType = 'auto') {
      try {
        // Strategy: Try multiple combinations to maximize coverage
        // No source restriction - let API search all sources (Apple, Spotify, etc.)
        // 5 attempts with different data normalization strategies
        // Line-by-line lyrics are preferred over word-by-word, so check all attempts
        const duration = Math.floor(info.duration / 1000);

        const attempts = [
          {
            normalizeArtist: false,
            normalizeTitle: false,
            includeAlbum: true,
            description: "Raw data with album"
          },
          {
            normalizeArtist: false,
            normalizeTitle: false,
            includeAlbum: false,
            description: "Raw data without album (sometimes album metadata is wrong)"
          },
          {
            normalizeArtist: true,
            normalizeTitle: false,
            includeAlbum: false,
            description: "Normalized artist, raw title"
          },
          {
            normalizeArtist: false,
            normalizeTitle: true,
            includeAlbum: false,
            description: "Raw artist, normalized title"
          },
          {
            normalizeArtist: true,
            normalizeTitle: true,
            includeAlbum: false,
            description: "Fully normalized data"
          }
        ];

        let bestResult = null;
        let bestResultType = null;
        let lastError = null; // Track the last error for reporting
        // Shared across ALL 5 attempts (not reset per-attempt, unlike bestSoFar inside
        // fetchKPoeLyrics) - once a server fails for a session-wide, non-query-dependent
        // reason (quota/rate-limit/CDN misconfig/server error/network error), later attempts
        // skip it instantly instead of re-sending a request that's guaranteed to fail the
        // same way regardless of how the artist/title text is normalized.
        const deadServers = new Set();
        // Tracks the actual {artist, title, album} combo each attempt ends up producing.
        // Utils.normalize() is a no-op on text with no accents/punctuation to strip, and an
        // empty album makes includeAlbum:true/false identical - so multiple "attempts" can
        // resolve to the exact same query. No point re-running the whole server cascade for
        // a query already tried this search.
        const triedCombos = new Set();

        for (let i = 0; i < attempts.length; i++) {
          // FIX: once every server has been marked dead (quota/rate-limit/CDN/5xx/network
          // failure), there is no server left to check regardless of how a later attempt
          // normalizes the query - stop instead of burning the remaining attempts, each of
          // which would just recurse straight through every dead server to the same
          // "All KPoe servers unavailable" outcome for no benefit.
          if (deadServers.size >= KPOE_SERVERS.length) {
            console.log(`[KPoe Debug] ⏭ All ${KPOE_SERVERS.length} servers are dead for this search - stopping remaining attempts`);
            break;
          }
          const attempt = attempts[i];
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(`[KPoe Debug] Attempt ${i + 1}/${attempts.length}: ${attempt.description}`);

          let songInfo = {
            // GUARD: Utils.normalize() only keeps ASCII word chars plus a small punctuation
            // allowlist (see its regex) - it's meant to strip accents/diacritics from Latin
            // text (e.g. "café" -> "cafe"), but on text made entirely of non-Latin-script
            // characters (Japanese, Cyrillic, Arabic, etc.) there's nothing in that allowlist
            // for it to keep, so it silently deletes the whole field instead of "normalizing"
            // it. An empty title/artist then guarantees a 400 (missing required params: title
            // and artist, or isrc, or platformId) on every server this attempt touches - a
            // wasted request that couldn't ever have found anything. Rather than hardcode which
            // scripts count as "non-Latin", check normalize()'s own output: if it had real
            // input but returned nothing, the normalization was destructive, not useful - fall
            // back to the raw value instead.
            artist: attempt.normalizeArtist ? (Utils.normalize(info.artist) || info.artist || "") : (info.artist || ""),
            title: attempt.normalizeTitle ? (Utils.normalize(info.title) || info.title || "") : (info.title || ""),
            album: attempt.includeAlbum ? (info.album || "") : "",
            duration
          };

          // FIX: mirror fetchKPoeLyrics' own rule for when album is actually sent
          // (`songInfo.album && songInfo.album !== songInfo.title`). Without this, an
          // attempt with includeAlbum:true whose album happens to equal the title collapses
          // to the exact same request URL as an includeAlbum:false attempt, but the raw
          // comboKey below would still see them as different combos ("...|Album" vs "...|")
          // and re-run the whole server cascade for a request that was already made.
          const effectiveAlbum = (songInfo.album && songInfo.album !== songInfo.title) ? songInfo.album : "";
          const comboKey = `${songInfo.artist}|${songInfo.title}|${effectiveAlbum}`;
          if (triedCombos.has(comboKey)) {
            console.log(`[KPoe Debug] ⏭ Skipping attempt ${i + 1} - same query as an earlier attempt, no servers to re-check`);
            continue;
          }
          triedCombos.add(comboKey);

          // Start with primary server (serverIndex = 0)
          // fetchKPoeLyrics will automatically try backup servers on rate limit/errors,
          // skipping any already in deadServers from a previous attempt.
          let result = await fetchKPoeLyrics(songInfo, '', false, 0, lyricsType, null, deadServers);

          // Handle errors - log but continue trying other attempts
          if (result && result.error) {
            lastError = result.error; // Track the last error
            console.log(`[KPoe Debug] ✗ Error on attempt ${i + 1}: ${result.error}`);
            // FIX: the "All KPoe servers unavailable" string fires any time fetchKPoeLyrics's
            // recursion bottoms out with nothing found - including when a server only 404'd
            // (query-dependent, so it's deliberately NOT added to deadServers) rather than
            // actually being dead. Pattern-matching that string meant a single attempt where
            // every server either failed hard OR just 404'd on that specific query was enough
            // to abort the whole 5-attempt search, even though a live server that only 404'd
            // might still return something for a later attempt's differently-normalized query
            // (this is exactly what happened in practice: a manual retry moments later got a
            // 200 from a server that had 404'd during autofetch's only attempt). Check the real
            // signal instead - deadServers - and only give up early once every server is
            // actually, session-wide dead. Also still requires !bestResult: if a Word/None
            // candidate is already banked, keep trying remaining attempts regardless, since a
            // later query might upgrade it to Line even against a fully-dead server set (via
            // fetchKPoeLyrics's own bestSoFar fallback) - matches the 17.44 fix's intent.
            if (!bestResult && deadServers.size >= KPOE_SERVERS.length) {
              break;
            }
            // Continue to next attempt - sometimes one of them goes through
          } else if (result && result.lyrics && result.lyrics.length > 0) {
            console.log(`[KPoe Debug] ✓ Success on attempt ${i + 1}! Type: ${result.type}`);

            // Keep track of the best result (priority: Line > Word > None)
            const typePriority = { "Line": 3, "Word": 2, "None": 1 };
            const newPriority = typePriority[result.type] ?? 0;
            const bestPriority = typePriority[bestResultType] ?? 0;
            if (!bestResult) {
              // First successful result
              bestResult = result;
              bestResultType = result.type;
              console.log(`[KPoe Debug] Storing first result (${result.type} type)`);
            } else if (newPriority > bestPriority) {
              // Found a higher-priority type - upgrade
              bestResult = result;
              bestResultType = result.type;
              console.log(`[KPoe Debug] ✓ Upgraded to ${result.type} type lyrics!`);
            } else {
              console.log(`[KPoe Debug] Keeping previous result (current: ${bestResultType}, new: ${result.type})`);
            }

            // If we found Line type, we can stop early since that's the best
            if (bestResultType === "Line") {
              console.log(`[KPoe Debug] ✓ Found Line type lyrics, stopping search`);
              break;
            }
          }
        }

        if (bestResult) {
          console.log(`[KPoe Debug] ✓ Returning best result: ${bestResultType} type`);
          return parseKPoeFormat(bestResult);
        }

        console.log("[KPoe Debug] ✗ All 5 attempts failed");
        // If we have a specific error from the last attempt, return it
        if (lastError) {
          return { error: lastError };
        }
        return { error: "No lyrics available from KPoe" };
      } catch (e) {
        return { error: "KPoe request failed - connection error or service unreachable" };
      }
    },
    getUnsynced(body) {
      if (!body?.data || !Array.isArray(body.data)) return null;

      const isWordType = body.type === "Word";
      if (isWordType) {
        console.log("[KPoe Debug] Processing Word type unsynced lyrics");
      }

      return body.data.map(line => {
        let text = line.text;

        // For Word type, line.text might be empty - reconstruct from syllabus
        if ((!text || text.trim() === '') && line.syllabus && Array.isArray(line.syllabus)) {
          // Join syllables with intelligent spacing for word boundaries
          text = line.syllabus.map((s, index) => {
            const syllableText = s.text || '';
            // Add space after syllable if it's marked as line ending (word boundary)
            // or if the next syllable doesn't start with punctuation
            if (s.isLineEnding && index < line.syllabus.length - 1) {
              return syllableText + ' ';
            }
            return syllableText;
          }).join('').trim();

          if (isWordType) {
            console.log(`[KPoe Debug] Reconstructed unsynced line from ${line.syllabus.length} syllables: "${text}"`);
          }
        }

        return {
          text: text || '',
          transliteration: line.transliteration?.text || null
        };
      }).filter(line => line.text.trim() !== ''); // Filter out any empty lines
    },
    getSynced(body) {
      if (!body?.data || !Array.isArray(body.data)) return null;

      // "None" type means unsynced lyrics (no timing data from Apple source)
      // Returning null here causes the caller to fall back to getUnsynced()
      if (body.type === "None") return null;

      // Handle both Line-synced and Word-synced lyrics
      const isWordType = body.type === "Word";
      if (isWordType) {
        console.log("[KPoe Debug] Converting Word type lyrics to line-synced format");
      }

      return body.data.map(line => {
        let text = line.text;

        // For Word type, line.text might be empty - reconstruct from syllabus
        if ((!text || text.trim() === '') && line.syllabus && Array.isArray(line.syllabus)) {
          // Join syllables with intelligent spacing for word boundaries
          text = line.syllabus.map((s, index) => {
            const syllableText = s.text || '';
            // Add space after syllable if it's marked as line ending (word boundary)
            // or if the next syllable doesn't start with punctuation
            if (s.isLineEnding && index < line.syllabus.length - 1) {
              return syllableText + ' ';
            }
            return syllableText;
          }).join('').trim();

          if (isWordType) {
            console.log(`[KPoe Debug] Reconstructed line from ${line.syllabus.length} syllables: "${text}"`);
          }
        }

        return {
          time: Math.round(line.startTime * 1000),
          text: text || '',
          transliteration: line.transliteration?.text || null
        };
      }).filter(line => line.text.trim() !== ''); // Filter out any empty lines
    },
  };

  // --- Musixmatch ---

  // Musixmatch token prompt and storage
  function showMusixmatchTokenModal() {
  // Remove any existing modal
  const old = document.getElementById("lyrics-plus-musixmatch-modal");
  if (old) old.remove();

  // Inject style for the modal, only once
  if (!document.getElementById("lyrics-plus-musixmatch-modal-style")) {
    const style = document.createElement("style");
    style.id = "lyrics-plus-musixmatch-modal-style";
    style.textContent = `
      #lyrics-plus-musixmatch-modal {
        position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.7); z-index: 100001; display: flex;
        align-items: center; justify-content: center;
      }
      #lyrics-plus-musixmatch-modal-box {
        background: #181818; color: #fff; border-radius: 14px;
        padding: 30px 28px 22px 28px; min-width: 350px; max-width: 90vw;
        box-shadow: 0 2px 24px #000b;
        font-family: inherit;
        position: relative;
        box-sizing: border-box;
      }
      #lyrics-plus-musixmatch-modal-title {
        color: #1db954;
        font-size: 1.35em;
        font-weight: 700;
        margin-bottom: 13px;
        text-align: center;
        letter-spacing: 0.3px;
      }
      #lyrics-plus-musixmatch-modal .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 25px;
        margin-top: 18px;
        padding: 0;
      }
      #lyrics-plus-musixmatch-modal .lyrics-btn {
        background: #222;
        color: #fff;
        border: none;
        border-radius: 20px;
        padding: 8px 0;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 4px #0003;
        transition: background 0.13s, color 0.13s;
        outline: none;
        min-width: 90px;
        width: 90px;
        text-align: center;
        flex: 0 0 90px;
        margin: 0;
      }
      #lyrics-plus-musixmatch-modal .lyrics-btn:hover {
        background: #1db954;
        color: #181818;
      }
      #lyrics-plus-musixmatch-modal-close {
        background: #222;
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: 1.25em;
        font-weight: 700;
        width: 36px;
        height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 10px;
        right: 10px;
        cursor: pointer;
        transition: background 0.13s, color 0.13s;
        z-index: 1;
        line-height: 1;
        margin: 0;
      }
      #lyrics-plus-musixmatch-modal-close:hover {
        background: #1db954;
        color: #181818;
      }
      #lyrics-plus-musixmatch-modal a {
        color: #1db954;
        text-decoration: none;
        transition: color .12s;
        font-weight: 600;
      }
      #lyrics-plus-musixmatch-modal a:hover {
        color: #fff;
        text-decoration: underline;
      }
      #lyrics-plus-musixmatch-modal input[type="text"],
      #lyrics-plus-musixmatch-modal input[type="password"] {
        background: #222;
        color: #fff;
        border: 1px solid #333;
        border-radius: 5px;
        width: 100%;
        padding: 8px 10px;
        margin: 14px 0 8px 0;
        font-size: 1em;
        box-sizing: border-box;
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement("div");
  modal.id = "lyrics-plus-musixmatch-modal";

  const box = document.createElement("div");
  box.id = "lyrics-plus-musixmatch-modal-box";
  box.innerHTML = `
    <button id="lyrics-plus-musixmatch-modal-close" title="Close">&times;</button>
    <div id="lyrics-plus-musixmatch-modal-title">Set your Musixmatch User Token</div>
    <div style="font-size:14px;line-height:1.6;margin-bottom:12px">
      <b>How to retrieve your token:</b><br>
      1. Go to <a href="https://www.musixmatch.com/" target="_blank">Musixmatch</a> and click on Login.<br>
      2. Select [Community] as your product.<br>
      3. Open DevTools (Press F12 or Right click and Inspect). <br>
      4. Go to the Network tab &gt; Click on the www.musixmatch.com domain &gt; Cookies.<br>
      5. Right-click on the content of the musixmatchUserToken and select Copy value.<br>
      6. Go to <a href="https://jsonformatter.curiousconcept.com/" target="_blank">JSON Formatter</a> &gt; Paste the content &gt; Click Process.<br>
      7. Copy the value of web-desktop-app-v1.0 > Paste the token below and press Save.<br>
      <span style="color:#e57373;"><b>WARNING:</b> Keep your token private! Do not share it with others.</span>
    </div>
  `;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter your Musixmatch user token here";
  input.value = localStorage.getItem("lyricsPlusMusixmatchToken") || "";
  box.appendChild(input);

  // Footer with Save & Cancel
  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const btnSave = document.createElement("button");
btnSave.textContent = "Save";
btnSave.className = "lyrics-btn";
btnSave.onclick = () => {
  localStorage.setItem("lyricsPlusMusixmatchToken", input.value.trim());
  modal.remove();
  // Optionally: reload lyrics if popup open and provider is Musixmatch
  const popup = document.getElementById("lyrics-plus-popup");
  if (popup && Providers.current === "Musixmatch") {
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (lyricsContainer) setLyricsStatusMessage(lyricsContainer, "Loading lyrics...");
    updateLyricsContent(popup, getCurrentTrackInfo());
  }
};

  const btnCancel = document.createElement("button");
  btnCancel.textContent = "Cancel";
  btnCancel.className = "lyrics-btn";
  btnCancel.onclick = () => modal.remove();

  footer.appendChild(btnSave);
  footer.appendChild(btnCancel);
  box.appendChild(footer);

  // Close (X) button
  box.querySelector('#lyrics-plus-musixmatch-modal-close').onclick = () => modal.remove();

  modal.appendChild(box);
  document.body.appendChild(modal);

  // Focus input for fast paste
  input.focus();
}

function parseMusixmatchSyncedLyrics(subtitleBody) {
  // Split into lines
  const lines = subtitleBody.split(/\r?\n/);
  const synced = [];

  // Regex for [mm:ss.xx] or [mm:ss,xx]
  const timeRegex = /\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/;

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const frac = match[3] ? parseFloat(match[3].replace(',', '.')) : 0;
      const timeMs = (min * 60 + sec + frac) * 1000;

      // Remove all timestamps (sometimes multiple) to get clean lyric text
      const text = line.replace(/\[(\d{1,2}):(\d{2})([.,]\d{1,3})?\]/g, '').trim();

      synced.push({ time: timeMs, text: text || '♪' });
    }
  }
  return synced;
}


async function fetchMusixmatchLyrics(songInfo, lyricsType = 'auto') {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Musixmatch Debug] Starting lyrics search (synced preferred)`);
  console.log("[Musixmatch Debug] Input info:", {
    artist: songInfo.artist,
    title: songInfo.title
  });

  const token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    DEBUG.info('Provider', 'Musixmatch: No token found in localStorage.');
    console.log("[Musixmatch Debug] ✗ No token found - double click on the provider to  set it up.");
    return { error: "Double click on the Musixmatch provider to set up your token." };
  }
  console.log("[Musixmatch Debug] ✓ Token found (length:", token.length, "characters)");

  // Step 1: Get track info
  const trackUrl = `https://apic-desktop.musixmatch.com/ws/1.1/matcher.track.get?` +
      `q_track=${encodeURIComponent(songInfo.title)}&` +
      `q_artist=${encodeURIComponent(songInfo.artist)}&` +
      `format=json&usertoken=${encodeURIComponent(token)}&app_id=web-desktop-app-v1.0`;
  console.log("[Musixmatch Debug] Step 1: Fetching track info");
  console.log("[Musixmatch Debug] Track URL:", trackUrl.replace(token, '***TOKEN***'));

  try {
    const trackResponse = await fetch(trackUrl, {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    });

    console.log(`[Musixmatch Debug] Track response status: ${trackResponse.status}`);

    if (!trackResponse.ok) {
      if (trackResponse.status === 401) {
        localStorage.removeItem("lyricsPlusMusixmatchToken");
        DEBUG.info('Provider', 'Musixmatch 401: Token expired or invalid. Cleared from storage.');
        console.log("[Musixmatch Debug] ✗ Authentication failed - token expired or invalid. Cleared from storage.");
        return { error: "Double click on the Musixmatch provider to set up your token." };
      } else if (trackResponse.status === 404) {
        console.log("[Musixmatch Debug] ✗ Track not found in Musixmatch database");
        return { error: "Track not found in Musixmatch database" };
      }
      console.log(`[Musixmatch Debug] ✗ Track request failed: ${trackResponse.status}`);
      return { error: `Track lookup failed (HTTP ${trackResponse.status})` };
    }

    const trackBody = await trackResponse.json();
    const bodyStatusCode = trackBody?.message?.header?.status_code;
    if (bodyStatusCode === 401) {
      localStorage.removeItem("lyricsPlusMusixmatchToken");
      DEBUG.info('Provider', 'Musixmatch 401: Token expired or invalid. Cleared from storage.');
      console.log("[Musixmatch Debug] ✗ Authentication failed - token expired or invalid. Cleared from storage.");
      return { error: "Double click on the Musixmatch provider to set up your token." };
    }
    const track = trackBody?.message?.body?.track;

    if (!track) {
      console.log("[Musixmatch Debug] ✗ No track data in response");
      return { error: "Track not found in Musixmatch database" };
    }

    console.log("[Musixmatch Debug] ✓ Track found:", {
      trackId: track.track_id,
      trackName: track.track_name,
      artistName: track.artist_name,
      hasLyrics: track.has_lyrics,
      instrumental: track.instrumental
    });

    if (track.instrumental) {
      console.log("[Musixmatch Debug] ⚠ Track marked as instrumental (no lyrics)");
      return { instrumental: true };
    }

    // Step 2: Fetch synced lyrics via subtitles.get
    const subtitleUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitles.get?` +
        `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`;
    console.log("[Musixmatch Debug] Step 2: Fetching synced lyrics (subtitles)");

    const subtitleResponse = await fetch(subtitleUrl, {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    });

    console.log(`[Musixmatch Debug] Subtitle response status: ${subtitleResponse.status}`);

    if (subtitleResponse.ok) {
      const subtitleBody = await subtitleResponse.json();
      const subtitleList = subtitleBody?.message?.body?.subtitle_list;
      if (subtitleList && subtitleList.length > 0) {
        const subtitleObj = subtitleList[0]?.subtitle;
        if (subtitleObj?.subtitle_body) {
          console.log("[Musixmatch Debug] ✓ Synced lyrics found!");
          const synced = parseMusixmatchSyncedLyrics(subtitleObj.subtitle_body);
          console.log(`[Musixmatch Debug] Parsed ${synced.length} synced lyric lines`);
          if (synced.length > 0) return { synced };
        }
      }
      console.log("[Musixmatch Debug] No synced lyrics in subtitle response");
    } else {
      console.log(`[Musixmatch Debug] Subtitle request failed: ${subtitleResponse.status}`);
    }

    // Step 3: fallback to unsynced lyrics
    const lyricsUrl = `https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?` +
        `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`;
    console.log("[Musixmatch Debug] Step 3: Fetching unsynced lyrics (fallback)");

    const lyricsResponse = await fetch(lyricsUrl, {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    });

    console.log(`[Musixmatch Debug] Lyrics response status: ${lyricsResponse.status}`);

    if (!lyricsResponse.ok) {
      console.log(`[Musixmatch Debug] ✗ Lyrics request failed: ${lyricsResponse.status}`);
      return { error: `Lyrics fetch failed (HTTP ${lyricsResponse.status})` };
    }

    const lyricsBody = await lyricsResponse.json();
    const unsyncedRaw = lyricsBody?.message?.body?.lyrics?.lyrics_body;
    if (unsyncedRaw) {
      const unsynced = unsyncedRaw.split("\n").map(line => ({ text: line }));
      console.log(`[Musixmatch Debug] ✓ Unsynced lyrics found! (${unsynced.length} lines)`);
      return { unsynced };
    }

    console.log("[Musixmatch Debug] ✗ No lyrics found in any format");
    return { error: "No lyrics available from Musixmatch" };
  } catch (e) {
    console.error("[Musixmatch Debug] ✗ Fetch error:", e.message || e);
    return { error: "Musixmatch request failed - connection error or service unreachable" };
  }
}

// Extract synced lyrics from the fetchMusixmatchLyrics result
function musixmatchGetSynced(body) {
  if (!body || !body.synced) {
    return null;
  }
  return body.synced.map(line => ({
    text: line.text,
    time: Math.round(line.time ?? line.startTime ?? 0),
  }));
}

// Extract unsynced lyrics from the fetchMusixmatchLyrics result
function musixmatchGetUnsynced(body) {
  if (!body || !body.unsynced) {
    return null;
  }
  return body.unsynced.map(line => ({ text: line.text }));
}

const ProviderMusixmatch = {
  async findLyrics(info, lyricsType = 'auto') {
    try {
      const data = await fetchMusixmatchLyrics(info, lyricsType);
      if (!data) {
  return { error: "No lyrics available from Musixmatch" };
}
if (data.error) {
  // If the error is about missing token, show that instead
  if (data.error.includes("Double click on the Musixmatch provider")) {
    return { error: data.error };
  }
  return { error: "No lyrics available from Musixmatch" };
}
return data;
    } catch (e) {
      return { error: "Musixmatch request failed - connection error or service unreachable" };
    }
  },
  getUnsynced: musixmatchGetUnsynced,
  getSynced: musixmatchGetSynced,
};

// --- Genius ---
async function fetchGeniusLyrics(info, lyricsType = 'auto') {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[Genius Debug] Starting lyrics search (unsynced only)`);
  console.log("[Genius Debug] Input info:", {
    artist: info.artist,
    title: info.title,
    album: info.album,
    duration: info.duration
  });

  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);
  console.log("[Genius Debug] Title variants to try:", Array.from(titles));

  function generateNthIndices(start = 1, step = 4, max = 25) {
    const arr = [];
    for (let i = start; i <= max; i += step) arr.push(i);
    return arr;
  }

  function cleanQuery(title) {
  return title
    .replace(/\b(remastered|explicit|deluxe|live|version|edit|remix|radio edit|radio|bonus track|bonus|special edition|expanded|edition)\b/gi, '')
    .replace(/\b(radio|spotify|lyrics|calendar|release|singles|top|annotated|playlist)\b/gi, '')
    .replace(/\b\d{4}\b/g, '')
    .replace(/[-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

  function normalize(str) {
    // Use NFD (Canonical Decomposition) to decompose diacritics into base + combining marks
    // Then remove the combining marks (Unicode range \u0300-\u036f)
    // This converts: ă→a, é→e, ñ→n, ö→o, etc.
    // Finally, remove all remaining non-alphanumeric characters
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
      .replace(/[^a-z0-9]/gi, '');
  }

  function normalizeArtists(artist) {
    return artist
      .toLowerCase()
      // Universal normalization: remove all types of additions/metadata
      // Handles: (ROU), [UK], {Producer}, etc.
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]/g, '')
      // Remove common suffixes that don't help matching
      .replace(/\s*(?:& the [a-z]+|and friends?|& co\.?)$/i, '')
      // Normalize "The" prefix for better matching
      .replace(/^the\s+/i, '')
      .split(/,|&|feat|ft|\band\b/gi)
      .map(s => s.trim())
      .filter(Boolean)
      .map(normalize);
  }

    /**
   * Check if one artist name contains another (fuzzy matching).
   * Helps match "Swisher" with "Swisher ROU" even if normalization missed something.
   * @param {string} artistA - First artist name (normalized)
   * @param {string} artistB - Second artist name (normalized)
   * @returns {boolean} True if names overlap significantly
   */
  function artistNameContains(artistA, artistB) {
    if (artistA === artistB) return true;
    // Minimum 3 chars to avoid false matches on very short names
    if (artistA.length < 3 || artistB.length < 3) return false;
    // Require 70% overlap to prevent false positives like "Art" matching "Artist"
    // and at least 4 characters must overlap
    if (artistA.includes(artistB)) {
      return artistB.length >= Math.max(artistA.length * 0.7, 4);
    }
    if (artistB.includes(artistA)) {
      return artistA.length >= Math.max(artistB.length * 0.7, 4);
    }
    return false;
  }

    /**
   * Calculate artist overlap with fuzzy matching support.
   * Tracks both exact and fuzzy matches to weight them differently in scoring.
   * @param {Set<string>} targetArtists - Artists from Spotify track
   * @param {Set<string>} resultArtists - Artists from Genius result
   * @returns {{exactMatches: number, fuzzyMatches: number, totalMatches: number}}
   */
  function calculateArtistOverlap(targetArtists, resultArtists) {
    let exactMatches = 0;
    let fuzzyMatches = 0;
    const matchedResults = new Set(); // Track to avoid double-counting

    for (const target of targetArtists) {
      // First try exact match
      if (resultArtists.has(target)) {
        exactMatches++;
        matchedResults.add(target);
      } else {
        // Try fuzzy match (substring matching)
        for (const result of resultArtists) {
          if (!matchedResults.has(result) && artistNameContains(target, result)) {
            fuzzyMatches++;
            matchedResults.add(result);
            break;
          }
        }
      }
    }

    return { exactMatches, fuzzyMatches, totalMatches: exactMatches + fuzzyMatches };
  }

  function extractFeaturedArtistsFromTitle(title) {
    const matches = title.match(/\((?:feat\.?|ft\.?|with)\s+([^)]+)\)/i);
    if (!matches) return [];
    return matches[1].split(/,|&|and/).map(s => normalize(s.trim()));
  }

  function hasVersionKeywords(title) {
  // Covers single words and phrases (bonus track, deluxe edition, etc.)
  return /\b(remix|deluxe|version|edit|live|explicit|remastered|bonus track|bonus|edition|expanded|special edition)\b/i.test(title);
}
  // Scoring constants for artist matching
  const SCORE_PERFECT_MATCH = 10;        // All artists matched
  const SCORE_EXACT_BONUS = 2;           // Bonus when all matches are exact (not fuzzy)
  const SCORE_ALMOST_PERFECT = 8;        // Missing only 1 artist
  const SCORE_ALMOST_EXACT_BONUS = 1;    // Bonus for mostly exact matches
  const SCORE_PARTIAL_BASE = 4;          // Base score for partial matches
  const SCORE_PARTIAL_RANGE = 4;         // Additional points based on match ratio (4-8 range)
  const SCORE_EXACT_MATCH_BONUS = 0.5;   // Small bonus per exact match in partial scenarios
  const PENALTY_MISSING_ARTIST = 0.3;    // Reduced penalty since Genius metadata may be incomplete
  const SCORE_MIN_ARTIST_THRESHOLD = 3;  // Minimum score to continue evaluation

  // Scoring constants for title matching
  const SCORE_TITLE_PERFECT = 7;         // Exact title match
  const SCORE_TITLE_GOOD_OVERLAP = 5;    // Good substring overlap (≥70%)
  const SCORE_TITLE_PARTIAL = 3;         // Partial overlap (<70%)
  const SCORE_TITLE_SHORT = 2;           // Very short title (< MIN_TITLE_LENGTH)
  const SCORE_TITLE_NO_MATCH = 1;        // No overlap
  const SCORE_VERSION_ADJUSTMENT = 1;    // Bonus/penalty for version keyword match/mismatch
  const PENALTY_NO_TITLE_OVERLAP = 2;    // Penalty when titles don't overlap at all
  const MIN_TITLE_LENGTH = 5;            // Minimum title length for reliable matching
  const MIN_TITLE_OVERLAP_RATIO = 0.7;   // Minimum overlap ratio for good score

  // True for translations, covers, etc (not original lyric pages!)
  const translationKeywords = [
    "translation", "übersetzung", "перевод", "çeviri", "traducción", "traduções", "traduction",
    "traductions", "traduzione", "traducciones-al-espanol", "fordítás", "fordítások", "tumaczenie",
    "tłumaczenie", "polskie tłumaczenie", "magyar fordítás", "turkce çeviri", "russian translations",
    "deutsche übersetzung", "genius users", "official translation", "genius russian translations",
    "genius deutsche übersetzungen", "genius türkçe çeviriler", "polskie tłumaczenia genius",
    "genius magyar fordítások", "genius traducciones al espanol", "genius traduzioni italiane",
    "genius traductions françaises", "genius turkce ceviriler",
  ];
  function containsTranslationKeyword(s) {
    if (!s) return false;
    const lower = s.toLowerCase();
    return translationKeywords.some(k => lower.includes(k));
  }
  function isTranslationPage(result) {
    return (
      containsTranslationKeyword(result.primary_artist?.name) ||
      containsTranslationKeyword(result.title) ||
      containsTranslationKeyword(result.url)
    );
  }
  function isSimpleOriginalUrl(url) {
    try {
      const path = new URL(url).pathname.toLowerCase();
      if (/^\/[a-z0-9-]+-lyrics$/.test(path)) return true;
      const parts = path.split('/').pop().split('-');
      if (parts.length >= 3 && parts.slice(-1)[0] === "lyrics") {
        if (parts.some(part => translationKeywords.some(k => part.includes(k)))) return false;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  const includedNthIndices = generateNthIndices();

  // Try up to 5 pages of results for each title variant
  const maxPages = 5;

  for (const title of titles) {
    const cleanTitle = cleanQuery(title);
    console.log(`[Genius Debug] Trying title variant: "${title}" → cleaned: "${cleanTitle}"`);

    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const searchUrl = `https://genius.com/api/search/multi?per_page=5&page=${page}&q=${query}`;
      console.log(`[Genius Debug] Page ${page}: Searching with query: "${info.artist} ${cleanTitle}"`);
      console.log(`[Genius Debug] URL: ${searchUrl}`);

      try {
        const searchRes = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: searchUrl,
            headers: {
              Accept: "application/json",
              "User-Agent": navigator.userAgent,
            },
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
            timeout: 5000,
          });
        });

        const searchJson = JSON.parse(searchRes.responseText);
        const hits = searchJson?.response?.sections?.flatMap(s => s.hits) || [];
        const songHits = hits.filter(h => h.type === "song");

        console.log(`[Genius Debug] Page ${page}: Received ${songHits.length} song results`);
        songHits.forEach((hit, idx) => {
          const result = hit.result;
          console.log(`[Genius Debug]   Result ${idx + 1}:`, {
            title: result.title,
            artist: result.primary_artist?.name,
            url: result.url
          });
        });

        for (const hit of songHits) {
          const result = hit.result;
        }

        const targetArtists = new Set(normalizeArtists(info.artist));
        const targetTitleNorm = normalize(Utils.removeExtraInfo(info.title));
        const targetHasVersion = hasVersionKeywords(info.title);

        console.log("[Genius Debug] Target (Spotify) normalization:", {
          originalArtist: info.artist,
          normalizedArtists: Array.from(targetArtists),
          originalTitle: info.title,
          cleanedTitle: Utils.removeExtraInfo(info.title),
          normalizedTitle: targetTitleNorm,
          hasVersionKeywords: targetHasVersion
        });

        // Dynamic threshold based on artist count (calculated once, used consistently)
        // Single artist: need strong match (≥8) to prevent false positives
        // Multi-artist: more lenient (≥6) since metadata may be incomplete
        const matchThreshold = targetArtists.size === 1 ? 8 : 6;
        console.log(`[Genius Debug] Match threshold for ${targetArtists.size} artist(s): ${matchThreshold}`);

        let bestScore = -Infinity;
        let fallbackScore = -Infinity;
        let song = null;
        let fallbackSong = null;

        for (const hit of songHits) {
          const result = hit.result;
          // Only consider original (non-translation) Genius lyrics pages
          if (isTranslationPage(result) || !isSimpleOriginalUrl(result.url)) {
            console.log(`[Genius Debug]     ⊗ Skipping "${result.title}" - translation page or non-simple URL`);
            continue;
          }

          const primary = normalizeArtists(result.primary_artist?.name || '');
          const featured = extractFeaturedArtistsFromTitle(result.title || '');

          // Also extract artists from Genius metadata arrays if available
          // This helps match songs where featured/producer artists are in the Spotify credits
          const featuredFromAPI = (result.featured_artists || [])
            .map(a => a.name)
            .flatMap(name => normalizeArtists(name));
          const producersFromAPI = (result.producer_artists || [])
            .map(a => a.name)
            .flatMap(name => normalizeArtists(name));

          const resultArtists = new Set([...primary, ...featured, ...featuredFromAPI, ...producersFromAPI]);
          const resultTitleNorm = normalize(Utils.removeExtraInfo(result.title || ''));
          const resultHasVersion = hasVersionKeywords(result.title || '');

          console.log(`[Genius Debug]     Candidate: "${result.title}" by ${result.primary_artist?.name}`);
          console.log(`[Genius Debug]       Genius normalization:`, {
            originalArtist: result.primary_artist?.name,
            normalizedArtists: Array.from(resultArtists),
            originalTitle: result.title,
            cleanedTitle: Utils.removeExtraInfo(result.title),
            normalizedTitle: resultTitleNorm,
            hasVersionKeywords: resultHasVersion
          });

          // Use enhanced fuzzy artist matching
          const overlap = calculateArtistOverlap(targetArtists, resultArtists);
          const totalArtists = targetArtists.size;

          console.log(`[Genius Debug]       Artist matching:`, {
            targetArtists: Array.from(targetArtists),
            resultArtists: Array.from(resultArtists),
            exactMatches: overlap.exactMatches,
            fuzzyMatches: overlap.fuzzyMatches,
            totalMatches: overlap.totalMatches,
            totalArtists: totalArtists
          });

          // Guard against empty artist set (should not happen in practice)
          if (totalArtists === 0) continue;

          const artistOverlapCount = overlap.totalMatches;
          const exactMatchCount = overlap.exactMatches;

          // Dynamic artist scoring based on match quality and artist count
          let artistScore = 0;
          if (artistOverlapCount === 0) {
            artistScore = 0; // no artist overlap, reject
          } else if (artistOverlapCount === totalArtists) {
            // Perfect match - all artists found
            artistScore = SCORE_PERFECT_MATCH;
            // Bonus for exact matches vs fuzzy
            if (exactMatchCount === totalArtists) artistScore += SCORE_EXACT_BONUS;
          } else if (artistOverlapCount >= totalArtists - 1) {
            // Almost perfect (missing only 1 artist)
            artistScore = SCORE_ALMOST_PERFECT;
            if (exactMatchCount >= totalArtists - 1) artistScore += SCORE_ALMOST_EXACT_BONUS;
          } else if (artistOverlapCount >= 1) {
            // Partial match - score based on percentage matched
            const matchRatio = artistOverlapCount / totalArtists;
            artistScore = SCORE_PARTIAL_BASE + (matchRatio * SCORE_PARTIAL_RANGE);
            // Bonus for exact matches
            artistScore += exactMatchCount * SCORE_EXACT_MATCH_BONUS;
            // Reduced penalty for missing artists (metadata may be incomplete)
            const missingArtists = totalArtists - artistOverlapCount;
            artistScore -= missingArtists * PENALTY_MISSING_ARTIST;
          }

          console.log(`[Genius Debug]       Artist score: ${artistScore} (threshold: ${SCORE_MIN_ARTIST_THRESHOLD})`);

          // Minimum artist threshold - must have at least some artist match
          if (artistScore < SCORE_MIN_ARTIST_THRESHOLD) {
            console.log(`[Genius Debug]       ⊗ Rejected: artist score below threshold`);
            continue;
          }

          // Title scoring with better substring validation to prevent false positives
          let titleScore = 0;
          if (resultTitleNorm === targetTitleNorm) {
            // Perfect title match
            titleScore = SCORE_TITLE_PERFECT;
          } else if (resultTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(resultTitleNorm)) {
            // Substring match - validate it's significant
            const shorter = resultTitleNorm.length < targetTitleNorm.length ? resultTitleNorm : targetTitleNorm;
            const longer = resultTitleNorm.length >= targetTitleNorm.length ? resultTitleNorm : targetTitleNorm;
            const overlapRatio = shorter.length / longer.length;

            // Penalize short titles that might be common words ("Yesterday" vs "Yesterday's Dream")
            if (shorter.length < MIN_TITLE_LENGTH) {
              titleScore = SCORE_TITLE_SHORT;
            } else if (overlapRatio >= MIN_TITLE_OVERLAP_RATIO) {
              titleScore = SCORE_TITLE_GOOD_OVERLAP;
            } else {
              titleScore = SCORE_TITLE_PARTIAL;
            }
          } else {
            titleScore = SCORE_TITLE_NO_MATCH;
          }

          // Version keywords adjustment (remix, live, etc.)
          if (targetHasVersion) {
            if (resultHasVersion) titleScore += SCORE_VERSION_ADJUSTMENT;
            else titleScore -= SCORE_VERSION_ADJUSTMENT;
          } else {
            if (!resultHasVersion) titleScore += SCORE_VERSION_ADJUSTMENT;
            else titleScore -= SCORE_VERSION_ADJUSTMENT;
          }

          console.log(`[Genius Debug]       Title comparison:`, {
            targetNorm: targetTitleNorm,
            resultNorm: resultTitleNorm,
            exactMatch: resultTitleNorm === targetTitleNorm,
            titleScore: titleScore
          });

          // Calculate final score with weighted components
          let score = artistScore + titleScore;

          // Apply penalty for poor matches (no title overlap at all)
          if (!resultTitleNorm.includes(targetTitleNorm) && !targetTitleNorm.includes(resultTitleNorm)) {
            score -= PENALTY_NO_TITLE_OVERLAP;
          }

          console.log(`[Genius Debug]       Final score: ${score} (artistScore: ${artistScore} + titleScore: ${titleScore})`);
          console.log(`[Genius Debug]       Threshold: ${matchThreshold}, Current best: ${bestScore}`);

          // Check if this result meets the threshold and is better than current best
          if (score > bestScore && score >= matchThreshold && (!targetHasVersion || resultHasVersion)) {
            console.log(`[Genius Debug]       ✓ NEW BEST MATCH!`);
            bestScore = score;
            song = result;
          } else if (
            score > fallbackScore &&
            score >= matchThreshold - 1 && // Slightly lower threshold for fallback
            (!resultHasVersion || !targetHasVersion)
          ) {
            console.log(`[Genius Debug]       ✓ New fallback candidate`);
            fallbackScore = score;
            fallbackSong = result;
          } else {
            console.log(`[Genius Debug]       ⊗ Not selected (score too low or version mismatch)`);
          }
        }

        if (!song && fallbackSong) {
          console.log(`[Genius Debug]   Using fallback song: "${fallbackSong.title}"`);
          song = fallbackSong;
          bestScore = fallbackScore;
        }

        // Final check: ensure we have a song that meets the minimum threshold
        if (bestScore < matchThreshold || !song?.url) {
          console.log(`[Genius Debug]   No suitable match found on page ${page} (bestScore: ${bestScore}, threshold: ${matchThreshold})`);
          continue;
        }

        console.log(`[Genius Debug] ✓✓✓ SELECTED: "${song.title}" by ${song.primary_artist?.name}`);
        console.log(`[Genius Debug] Fetching lyrics from: ${song.url}`);


        const htmlRes = await new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: song.url,
            headers: {
              Accept: "text/html",
              "User-Agent": navigator.userAgent,
            },
            onload: resolve,
            onerror: reject,
            ontimeout: reject,
            timeout: 5000,
          });
        });

        const doc = new DOMParser().parseFromString(htmlRes.responseText, "text/html");

        const lyricsRoot = [...doc.querySelectorAll('div')].find(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Root'))
        );

        if (!lyricsRoot) {
          console.warn("[Genius] No .Lyrics__Root found");
          continue;
        }

        const containers = [...lyricsRoot.querySelectorAll('div')].filter(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Container'))
        );

        if (containers.length === 0) {
          console.warn("[Genius] No .Lyrics__Container found inside .Lyrics__Root");
          continue;
        }

        const relevantContainersSet = new Set();

        containers.forEach(container => {
          const parent = container.parentElement;
          const siblings = [...parent.children];
          const nthIndex = siblings.indexOf(container) + 1;

          if (includedNthIndices.includes(nthIndex)) {
            relevantContainersSet.add(container);
          }
        });

        containers.forEach(container => {
          if (relevantContainersSet.has(container)) return;

          const classList = [...container.classList].map(c => c.toLowerCase());
          const text = container.textContent.trim().toLowerCase();

          if (
            classList.some(cls =>
              cls.includes('header') ||
              cls.includes('readmore') ||
              cls.includes('annotation') ||
              cls.includes('credit') ||
              cls.includes('footer')
            ) ||
            !text || text.length < 10 ||
            text.includes('read more') || text.includes('lyrics') || text.includes('©')
          ) {
            return;
          }

          relevantContainersSet.add(container);
        });

        const relevantContainers = Array.from(relevantContainersSet);

        let lyrics = '';
        function walk(node) {
          for (const child of node.childNodes) {
            if (child.nodeType === Node.ELEMENT_NODE) {
              const classList = [...child.classList].map(c => c.toLowerCase());
              if (classList.some(cls =>
                cls.includes('header') ||
                cls.includes('readmore') ||
                cls.includes('annotation') ||
                cls.includes('credit') ||
                cls.includes('footer')
              )) continue;
            }

            if (child.nodeType === Node.TEXT_NODE) {
              lyrics += child.textContent;
            } else if (child.nodeName === "BR") {
              lyrics += "\n";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              walk(child);
              if (/div|p|section/i.test(child.nodeName)) lyrics += "\n";
            }
          }
        }

        relevantContainers.forEach(container => {
          walk(container);
          lyrics += "\n";
        });

        lyrics = lyrics.replace(/\n{2,}/g, "\n").trim();

        if (!lyrics) {
          console.warn("[Genius] Extracted lyrics are empty");
          continue;
        }

        return { plainLyrics: lyrics };

      } catch (e) {
        console.error("[Genius Debug] Fetch or parse error:", e);
        continue;
      }
    }
  }

  console.log("[Genius Debug] ✗✗✗ No lyrics found after trying all title variants and pages");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return { error: "No lyrics available from Genius" };
}

function parseGeniusLyrics(raw) {
  if (!raw) return { unsynced: null };
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^(\[.*\])$/.test(line)); // skip pure section headers

  return {
    unsynced: lines.map(text => ({ text })),
  };
}

const ProviderGenius = {
  async findLyrics(info, lyricsType = 'auto') {
    try {
      const data = await fetchGeniusLyrics(info, lyricsType);
      if (!data) {
        return { error: "Genius request failed - connection error or service unreachable" };
      }
      // If data has an error from the fetch function aka was unable to parse or fetch from Genius, return as is ("No lyrics available from Genius")
      if (data.error) {
        return data;
      }

      // Check if lyrics indicate no lyrics available or instrumental track
      if (data.plainLyrics) {
        const lines = parseGeniusLyrics(data.plainLyrics).unsynced;

        // Patterns for tracks where lyrics aren't transcribed yet
        const notTranscribedPatterns = [
          /lyrics for this song have yet to be transcribed/i,
          /we do not have the lyrics for/i,
          /be the first to add the lyrics/i,
          /please check back once the song has been released/i,
          /add lyrics on genius/i
        ];

        // Patterns for instrumental tracks
        const instrumentalTrackPatterns = [
          /this song is an instrumental/i
        ];

        if (lines.length === 1) {
          // Check for instrumental tracks first
          const instrumentalMatch = instrumentalTrackPatterns.find(rx => rx.test(lines[0].text));
          if (instrumentalMatch) {
            console.log(`[Genius Debug] ⚠ Track is instrumental - matched pattern: ${instrumentalMatch} in text: "${lines[0].text}"`);
            return { instrumental: true };
          }

          // Check for not transcribed patterns
          const notTranscribedMatch = notTranscribedPatterns.find(rx => rx.test(lines[0].text));
          if (notTranscribedMatch) {
            console.log(`[Genius Debug] ⚠ No lyrics available for this track - matched pattern: ${notTranscribedMatch} in text: "${lines[0].text}"`);
            // For not transcribed patterns, return error to prevent caching the transcribed pattern as lyrics
            return { error: "No lyrics available from Genius" };
          }
        }
      }

      return data;
    } catch (e) {
      return { error: "Genius request failed - connection error or service unreachable" };
    }
  },
  getUnsynced(body) {
  if (!body?.plainLyrics) return null;
  const lines = parseGeniusLyrics(body.plainLyrics).unsynced;
  return lines;
},
  getSynced() {
    return null;
  },
};

  // --- Spotify ---
  function showSpotifyTokenModal() {
  // Remove any existing modal
  const old = document.getElementById("lyrics-plus-spotify-modal");
  if (old) old.remove();
  // Inject style for the modal, only once
  if (!document.getElementById("lyrics-plus-spotify-modal-style")) {
    const style = document.createElement("style");
    style.id = "lyrics-plus-spotify-modal-style";
    style.textContent = `
      #lyrics-plus-spotify-modal {
        position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.7); z-index: 100001; display: flex;
        align-items: center; justify-content: center;
      }
      #lyrics-plus-spotify-modal-box {
        background: #181818; color: #fff; border-radius: 14px;
        padding: 30px 28px 22px 28px; min-width: 350px; max-width: 90vw;
        box-shadow: 0 2px 24px #000b;
        font-family: inherit;
        position: relative;
        box-sizing: border-box;
      }
      #lyrics-plus-spotify-modal-title {
        color: #1db954;
        font-size: 1.35em;
        font-weight: 700;
        margin-bottom: 13px;
        text-align: center;
        letter-spacing: 0.3px;
      }
      #lyrics-plus-spotify-modal .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 25px;
        margin-top: 18px;
        padding: 0;
      }
      #lyrics-plus-spotify-modal .lyrics-btn {
        background: #222;
        color: #fff;
        border: none;
        border-radius: 20px;
        padding: 8px 0;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 4px #0003;
        transition: background 0.13s, color 0.13s;
        outline: none;
        min-width: 90px;
        width: 90px;
        text-align: center;
        flex: 0 0 90px;
        margin: 0;
      }
      #lyrics-plus-spotify-modal .lyrics-btn:hover {
        background: #1db954;
        color: #181818;
      }
      #lyrics-plus-spotify-modal-close {
        background: #222;
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: 1.25em;
        font-weight: 700;
        width: 36px;
        height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 10px;
        right: 10px;
        cursor: pointer;
        transition: background 0.13s, color 0.13s;
        z-index: 1;
        line-height: 1;
        margin: 0;
      }
      #lyrics-plus-spotify-modal-close:hover {
        background: #1db954;
        color: #181818;
      }
      #lyrics-plus-spotify-modal a {
        color: #1db954;
        text-decoration: none;
        transition: color .12s;
        font-weight: 600;
      }
      #lyrics-plus-spotify-modal a:hover {
        color: #fff;
        text-decoration: underline;
      }
      #lyrics-plus-spotify-modal input[type="text"],
      #lyrics-plus-musixmatch-modal input[type="password"] {
        background: #222;
        color: #fff;
        border: 1px solid #333;
        border-radius: 5px;
        width: 100%;
        padding: 8px 10px;
        margin: 14px 0 8px 0;
        font-size: 1em;
        box-sizing: border-box;
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement("div");
  modal.id = "lyrics-plus-spotify-modal";

  const box = document.createElement("div");
  box.id = "lyrics-plus-spotify-modal-box";
  box.innerHTML = `
    <button id="lyrics-plus-spotify-modal-close" title="Close">&times;</button>
    <div id="lyrics-plus-spotify-modal-title">Set your Spotify User Token</div>
    <div style="font-size:14px;line-height:1.6;margin-bottom:12px">
      <b>How to retrieve your token:</b><br>
      1. Go to <a href="https://open.spotify.com/" target="_blank">Spotify Web Player</a> and log in. Play a song.<br>
      2. Open DevTools (Press F12 or Right click and Inspect).<br>
      3. Go to the Network tab and search for "spclient".<br>
      4. You may have to wait a little for it to load.<br>
      5. Click on one of the spclient domains and go to the Headers section.<br>
      6. Under Response Headers, locate the authorization request header.<br>
      7. If there isn't one, try a different spclient domain.<br>
      8. Right-click on the content of the authorization request header and select Copy value.<br>
      9. Paste the token below and press Save.<br>
      <span style="color:#e57373;"><b>WARNING:</b> Keep your token private! Do not share it with others.</span>
    </div>
  `;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter your Spotify user token here";
  input.value = localStorage.getItem("lyricsPlusSpotifyToken") || "";
  box.appendChild(input);

  // Footer with Save & Cancel
  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const btnSave = document.createElement("button");
  btnSave.textContent = "Save";
  btnSave.className = "lyrics-btn";
  btnSave.onclick = () => {
    const rawValue = input.value.trim();
    const bearerPrefix = "Bearer ";
    const tokenValue = rawValue.startsWith(bearerPrefix) ? rawValue.slice(bearerPrefix.length) : rawValue;
    localStorage.setItem("lyricsPlusSpotifyToken", tokenValue);
    modal.remove();
  // Optionally: reload lyrics if popup open and provider is Spotify
  const popup = document.getElementById("lyrics-plus-popup");
  if (popup && Providers.current === "Spotify") {
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (lyricsContainer) setLyricsStatusMessage(lyricsContainer, "Loading lyrics...");
    updateLyricsContent(popup, getCurrentTrackInfo());
  }
};

  const btnCancel = document.createElement("button");
  btnCancel.textContent = "Cancel";
  btnCancel.className = "lyrics-btn";
  btnCancel.onclick = () => modal.remove();

  footer.appendChild(btnSave);
  footer.appendChild(btnCancel);
  box.appendChild(footer);

  // Close (X) button
  box.querySelector('#lyrics-plus-spotify-modal-close').onclick = () => modal.remove();

  modal.appendChild(box);
  document.body.appendChild(modal);

  // Focus input for fast paste
  input.focus();
}

const ProviderSpotify = {
  async findLyrics(info, lyricsType = 'auto') {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`[Spotify Debug] Starting lyrics search (synced preferred)`);
    console.log("[Spotify Debug] Input info:", {
      trackId: info.trackId,
      title: info.title,
      artist: info.artist
    });

    const token = localStorage.getItem("lyricsPlusSpotifyToken");

    if (!token) {
      DEBUG.info('Provider', 'Spotify: No token found in localStorage.');
      console.log("[Spotify Debug] ✗ No token found - double click on the provider to  set it up.");
      return { error: "Double click on the Spotify provider to set up your token.\n" + "A fresh token is required every hour/upon page reload for security." };
    }
    console.log("[Spotify Debug] ✓ Token found (length:", token.length, "characters)");

    if (!info.trackId) {
      console.log("[Spotify Debug] ✗ No trackId provided in song info");
      return { error: "Cannot fetch Spotify lyrics - track ID not available" };
    }

    const endpoint = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${info.trackId}?format=json&vocalRemoval=false&market=from_token`;
    console.log("[Spotify Debug] Request endpoint:", endpoint);
    console.log("[Spotify Debug] Using Authorization: Bearer ***TOKEN***");

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "app-platform": "WebPlayer",
          "User-Agent": navigator.userAgent,
          "Authorization": "Bearer " + token,
        },
      });

      console.log(`[Spotify Debug] Response status: ${res.status} ${res.statusText}`);

      if (!res.ok) {
        const text = await res.text();
        console.log("[Spotify Debug] Response body:", text.substring(0, 200));

        if (res.status === 401) {
          localStorage.removeItem("lyricsPlusSpotifyToken");
          DEBUG.info('Provider', 'Spotify 401: Token expired or invalid. Cleared from storage.');
          console.log("[Spotify Debug] ✗ Authentication failed - token expired or invalid. Cleared from storage.");
          return { error: "Double click on the Spotify provider and follow the instructions. Spotify requires a fresh token every hour/upon page reload for security." };
        }
        if (res.status === 404) {
          console.log("[Spotify Debug] ✗ Track not found or no lyrics available");
          return { error: "Track not found or no lyrics available from Spotify" };
        }
        if (res.status === 403) {
          console.log("[Spotify Debug] ✗ Access forbidden - check token permissions");
          return { error: "Access denied by Spotify - please refresh your token" };
        }
        console.log(`[Spotify Debug] ✗ Request failed: ${res.status} ${res.statusText}`);
        return { error: `Spotify lyrics request failed (HTTP ${res.status})` };
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const text = await res.text();
        console.error("[Spotify Debug] ✗ Failed to parse JSON. Raw response:", text.substring(0, 200));
        return { error: "Invalid response format from Spotify" };
      }

      console.log("[Spotify Debug] Response data:", {
        hasLyrics: !!(data && data.lyrics),
        hasLines: !!(data && data.lyrics && data.lyrics.lines),
        lineCount: data?.lyrics?.lines?.length || 0,
        syncType: data?.lyrics?.syncType,
        language: data?.lyrics?.language
      });

      // Adapt to your UI's expected data shape:
      if (!data || !data.lyrics || !data.lyrics.lines || !data.lyrics.lines.length) {
        console.log("[Spotify Debug] ✗ No lyric lines in API response");
        return { error: "No lyrics available from Spotify" };
      }

      console.log(`[Spotify Debug] ✓ Lyrics found! Type: ${data.lyrics.syncType}, Lines: ${data.lyrics.lines.length}, Language: ${data.lyrics.language || 'unknown'}`);
      return data.lyrics;
    } catch (e) {
      console.error("[Spotify Debug] ✗ Fetch error:", e.message || e);
      return { error: "Spotify request failed - connection error or service unreachable" };
    }
  },

  getSynced(data) {
  if (Array.isArray(data.lines) && data.syncType === "LINE_SYNCED") {
    return data.lines.map(line => ({
      time: line.startTimeMs,
      text: line.words
    }));
  }
  return null;
},

getUnsynced(data) {
  // Accept both unsynced and fallback if lines exist
  if (Array.isArray(data.lines) && (data.syncType === "UNSYNCED" || data.syncType !== "LINE_SYNCED")) {
    return data.lines.map(line => ({ text: line.words }));
  }
  return null;
},
};

// --- Providers List ---
const Providers = {
  list: ["LRCLIB", "Spotify", "KPoe", "Musixmatch", "Genius"],
  map: {
    "LRCLIB": ProviderLRCLIB,
    "Spotify": ProviderSpotify,
    "KPoe": ProviderKPoe,
    "Musixmatch": ProviderMusixmatch,
    "Genius": ProviderGenius,
  },
  current: "LRCLIB",
  getCurrent() { return this.map[this.current]; },
  setCurrent(name) { if (this.map[name]) this.current = name; }
};

  // ------------------------
  // UI and Popup Functions
  // ------------------------

  function removePopup() {
    DEBUG.ui.popupRemoved();

    // Clear all intervals
    if (highlightTimer) {
      clearInterval(highlightTimer);
      highlightTimer = null;
      DEBUG.debug('Cleanup', 'highlightTimer cleared');
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      DEBUG.debug('Cleanup', 'pollingInterval cleared');
    }
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
      DEBUG.debug('Cleanup', 'progressInterval cleared');
    }

    // Clean up popup-specific observers
    const existing = document.getElementById("lyrics-plus-popup");
    if (existing) {
      // Disconnect all popup-attached observers
      if (existing._playPauseObserver) {
        ResourceManager.cleanupObserver(existing._playPauseObserver);
        existing._playPauseObserver = null;
      }
      if (existing._shuffleObserver) {
        ResourceManager.cleanupObserver(existing._shuffleObserver);
        existing._shuffleObserver = null;
      }
      if (existing._repeatObserver) {
        ResourceManager.cleanupObserver(existing._repeatObserver);
        existing._repeatObserver = null;
      }
      if (existing._headerScrollResizeObserver) {
        try { existing._headerScrollResizeObserver.disconnect(); } catch (e) {}
        existing._headerScrollResizeObserver = null;
      }
      if (existing._headerScrollDragHandlers) {
        const { onHeaderScrollDragMove, onHeaderScrollDragEnd } = existing._headerScrollDragHandlers;
        window.removeEventListener("mousemove", onHeaderScrollDragMove);
        window.removeEventListener("touchmove", onHeaderScrollDragMove);
        window.removeEventListener("mouseup", onHeaderScrollDragEnd);
        window.removeEventListener("touchend", onHeaderScrollDragEnd);
        window.removeEventListener("touchcancel", onHeaderScrollDragEnd);
        existing._headerScrollDragHandlers = null;
      }
      if (existing._headerWheelHandler) {
        // The listener is attached to headerWrapper, not the popup itself -
        // look it up by id rather than calling removeEventListener on the
        // wrong element (previously a harmless no-op, masked by the whole
        // subtree being removed/GC'd right after anyway).
        const headerWrapperEl = existing.querySelector("#lyrics-plus-header-wrapper");
        headerWrapperEl?.removeEventListener("wheel", existing._headerWheelHandler);
        existing._headerWheelHandler = null;
      }
      if (existing._headerArrowScrollHandlers) {
        const { onHeaderArrowUp } = existing._headerArrowScrollHandlers;
        window.removeEventListener("mouseup", onHeaderArrowUp);
        window.removeEventListener("touchend", onHeaderArrowUp);
        window.removeEventListener("touchcancel", onHeaderArrowUp);
        existing._headerArrowScrollHandlers = null;
      }
      // Stop any in-flight arrow auto-repeat immediately, rather than letting
      // its interval keep firing against a now-detached buttonGroup until GC.
      if (existing._clearHeaderArrowRepeat) {
        existing._clearHeaderArrowRepeat();
        existing._clearHeaderArrowRepeat = null;
      }
      // Remove window mouseup handler for resize
      if (existing._resizeMouseupHandler) {
        window.removeEventListener("mouseup", existing._resizeMouseupHandler);
        DEBUG.debug('Cleanup', 'Removed mouseup handler for resize');
        existing._resizeMouseupHandler = null;
      }

      // Remove drag window event listeners
      if (existing._dragHandlers) {
        const { onDragMouseMove, onDragTouchMove, onDragMouseUp, onDragTouchEnd } = existing._dragHandlers;
        window.removeEventListener("mousemove", onDragMouseMove);
        window.removeEventListener("touchmove", onDragTouchMove);
        window.removeEventListener("mouseup", onDragMouseUp);
        window.removeEventListener("touchend", onDragTouchEnd);
        existing._dragHandlers = null;
        DEBUG.debug('Cleanup', 'Removed drag window event listeners');
      }

      // Remove resize window event listeners
      if (existing._resizeHandlers) {
        const { onResizeMouseMove, onResizeTouchMove, onResizeMouseUp, onResizeTouchEnd } = existing._resizeHandlers;
        window.removeEventListener("mousemove", onResizeMouseMove);
        window.removeEventListener("touchmove", onResizeTouchMove);
        window.removeEventListener("mouseup", onResizeMouseUp);
        window.removeEventListener("touchend", onResizeTouchEnd);
        existing._resizeHandlers = null;
        DEBUG.debug('Cleanup', 'Removed resize window event listeners');
      }

      // Disconnect progress bar watcher observer
      if (existing._progressBarWatcher) {
        try {
          existing._progressBarWatcher.disconnect();
        } catch (e) {
          DEBUG.error('Cleanup', 'Failed to disconnect progress bar watcher:', e);
        }
        existing._progressBarWatcher = null;
        DEBUG.debug('Cleanup', 'Progress bar watcher disconnected');
      }

      // Clear popup references
      existing._playPauseBtn = null;
      existing._shuffleBtn = null;
      existing._repeatBtn = null;
      existing._prevBtn = null;
      existing._nextBtn = null;
      existing._lyricsTabs = null;

      // Close PiP if active — the popup is required for PiP to function
      closePip();

      // The download dropdown now lives on document.body (not inside the
      // popup) so it can escape buttonGroup's overflow clipping - it won't
      // be removed by existing.remove() below, so clean it up explicitly.
      const orphanedDownloadDropdown = document.getElementById("lyrics-plus-download-dropdown");
      if (orphanedDownloadDropdown) orphanedDownloadDropdown.remove();

      existing.remove();
      DEBUG.debug('Cleanup', 'Popup element and all observers removed from DOM');
    }
  }

  function observeSpotifyShuffle(popup) {
    if (!popup || !popup._shuffleBtn) return;
    if (popup._shuffleObserver) {
      ResourceManager.cleanupObserver(popup._shuffleObserver);
    }

    // Use the new language-independent function to find the shuffle button
    const shuffleBtn = findSpotifyShuffleButton();
    if (!shuffleBtn) return;

    const observer = new MutationObserver(() => {
      updateShuffleButton(popup._shuffleBtn.button, popup._shuffleBtn.iconWrapper);
      // Re-attach observer if the node is replaced
      setTimeout(() => observeSpotifyShuffle(popup), 0);
    });
    observer.observe(shuffleBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style'] });
    popup._shuffleObserver = ResourceManager.registerObserver(observer, 'Shuffle button state');
  }

  function observeSpotifyRepeat(popup) {
    if (!popup || !popup._repeatBtn) return;
    if (popup._repeatObserver) {
      ResourceManager.cleanupObserver(popup._repeatObserver);
    }

    // Use the new language-independent function to find the repeat button
    const repeatBtn = findSpotifyRepeatButton();
    if (!repeatBtn) return;

    const observer = new MutationObserver(() => {
      updateRepeatButton(popup._repeatBtn.button, popup._repeatBtn.iconWrapper);
      // Re-attach observer if the node is replaced
      setTimeout(() => observeSpotifyRepeat(popup), 0);
    });
    observer.observe(repeatBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style', 'aria-checked'] });
    popup._repeatObserver = ResourceManager.registerObserver(observer, 'Repeat button state');
  }

  function observeSpotifyPlayPause(popup) {
    if (!popup || !popup._playPauseBtn) return;
    if (popup._playPauseObserver) {
      ResourceManager.cleanupObserver(popup._playPauseObserver);
    }

    // Use the new language-independent function to find the play/pause button
    const spBtn = findSpotifyPlayPauseButton();
    if (!spBtn) return;
    const observer = new MutationObserver(() => {
      if (popup._playPauseBtn) {
        updatePlayPauseButton(popup._playPauseBtn.button, popup._playPauseBtn.iconWrapper);
      }
    });
    observer.observe(spBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style'] });
    popup._playPauseObserver = ResourceManager.registerObserver(observer, 'Play/pause button state');
  }

  function createPopup() {
    DEBUG.ui.popupCreated();
    removePopup();

    // Clear current provider so no provider is highlighted while searching for lyrics
    Providers.current = null;

    // Load saved proportion from localStorage (stored as ratios of window size)
    const savedProportion = localStorage.getItem('lyricsPlusPopupProportion');
    let pos = null;
    let shouldSaveDefaultPosition = false;
    if (savedProportion) {
      try {
        const proportion = JSON.parse(savedProportion);
        // Convert proportions to absolute pixel values for initial positioning
        if (proportion.w !== undefined && proportion.h !== undefined && proportion.x !== undefined && proportion.y !== undefined) {
          pos = {
            left: window.innerWidth * proportion.x,
            top: window.innerHeight * proportion.y,
            width: window.innerWidth * proportion.w,
            height: window.innerHeight * proportion.h
          };
          DEBUG.debug('UI', 'Loaded saved popup proportion and converted to pixels', pos);
        }
      } catch {
        pos = null;
        DEBUG.warn('UI', 'Failed to parse saved popup proportion');
      }
    }

    const popup = document.createElement("div");
    popup.id = "lyrics-plus-popup";

    function getSpotifyLyricsContainerRect() {
      const el = document.querySelector('.main-view-container');
      if (!el || !el.getBoundingClientRect) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      return rect;
    }

    // Usage:
    if (pos && pos.left !== null && pos.top !== null && pos.width && pos.height) {
      Object.assign(popup.style, {
        position: "fixed",
        left: pos.left + "px",
        top: pos.top + "px",
        width: pos.width + "px",
        height: pos.height + "px",
        minWidth: "360px",
        minHeight: "240px",
        backgroundColor: "#121212",
        color: "white",
        borderRadius: "12px",
        boxShadow: "0 0 20px rgba(0, 0, 0, 0.9)",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        zIndex: 100000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "0",
        userSelect: "none",
        right: "auto",
        bottom: "auto"
      });
    } else {
      // fallback to container or default
      shouldSaveDefaultPosition = true;
      let rect = getSpotifyLyricsContainerRect();
      if (rect) {
        Object.assign(popup.style, {
          position: "fixed",
          left: rect.left + "px",
          top: rect.top + "px",
          width: rect.width + "px",
          height: rect.height + "px",
          minWidth: "360px",
          minHeight: "240px",
          backgroundColor: "#121212",
          color: "white",
          borderRadius: "12px",
          boxShadow: "0 0 20px rgba(0, 0, 0, 0.9)",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          zIndex: 100000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "0",
          userSelect: "none",
          right: "auto",
          bottom: "auto"
        });
      } else {
        // fallback
        Object.assign(popup.style, {
          position: "fixed",
          bottom: "87px",
          right: "0px",
          left: "auto",
          top: "auto",
          width: "360px",
          height: "79.5vh",
          minWidth: "360px",
          minHeight: "240px",
          backgroundColor: "#121212",
          color: "white",
          borderRadius: "12px",
          boxShadow: "0 0 20px rgba(0, 0, 0, 0.9)",
          fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
          zIndex: 100000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "0",
          userSelect: "none",
        });
      }
    }

    // Header with title and close button - drag handle
    const headerWrapper = document.createElement("div");
    headerWrapper.id = "lyrics-plus-header-wrapper";
    Object.assign(headerWrapper.style, {
      padding: "12px",
      borderBottom: "1px solid #333",
      backgroundColor: "#121212",
      zIndex: 10,
      cursor: "move",
      userSelect: "none",
    });

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("h3");
    title.textContent = "Lyrics+";
    title.style.margin = "0";
    title.style.fontWeight = "600";
    title.style.color = "#cfcfcf"; // similar to github icon background color

    // Restore Default Position and Size button for the header
    const btnReset = document.createElement("button");
    btnReset.title = "Restore Default Position and Size";
    Object.assign(btnReset.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      borderRadius: "5px",
      width: "28px",
      height: "28px",
      color: "#fff",
      fontWeight: "bold",
      fontSize: "18px",
      display: "inline-flex",
      justifyContent: "center",
      alignItems: "center",
      userSelect: "none",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    btnReset.addEventListener('mouseenter', () => {
      btnReset.style.color = "rgba(255, 255, 255, 0.7)";
    });
    btnReset.addEventListener('mouseleave', () => {
      btnReset.style.color = "#fff";
    });
    console.info("✅ [Lyrics+ UI] Restore default position button created");
    btnReset.innerHTML = `
  <svg width="21" height="21" viewBox="0 0 24 24" style="display:block;">
    <g transform="rotate(-90 12 12)">
      <path fill="currentColor" d="M17.65,6.35 C16.2,4.9 14.21,4 12,4 C7.58,4 4,7.58 4,12 C4,16.42 7.58,20 12,20 C15.31,20 18.23,17.69 19.42,14.61 L17.65,13.97 C16.68,16.36 14.54,18 12,18 C8.69,18 6,15.31 6,12 C6,8.69 8.69,6 12,6 C13.66,6 15.14,6.69 16.22,7.78 L13,11 L20,11 L20,4 L17.65,6.35 Z"/>
    </g>
  </svg>
`;

    // Default Position and Size of the Popup Gui
    btnReset.onclick = () => {
      console.info("🔄 [Lyrics+ UI] Restore default position button clicked");
      const rect = getSpotifyLyricsContainerRect();
      if (rect) {
        Object.assign(popup.style, {
          position: "fixed",
          left: rect.left + "px",
          top: rect.top + "px",
          width: rect.width + "px",
          height: rect.height + "px",
          right: "auto",
          bottom: "auto",
          zIndex: 100000
        });
        savePopupState(popup);
        console.info("✅ [Lyrics+ UI] Position restored to Spotify lyrics container position");
      } else {
        Object.assign(popup.style, {
          position: "fixed",
          bottom: "87px",
          right: "0px",
          left: "auto",
          top: "auto",
          width: "360px",
          height: "79.5vh",
          zIndex: 100000
        });
        savePopupState(popup);
        console.info("✅ [Lyrics+ UI] Position restored to default position (bottom-right corner)");
      }
    };

    // --- Translation controls dropdown, translate button, and remove translation button ---
    const translationControls = document.createElement('div');
    translationControls.style.display = 'flex';
    translationControls.style.alignItems = 'center';
    translationControls.style.justifyContent = 'space-between';
    translationControls.style.width = '100%';
    translationControls.style.gap = '8px';

    console.info("✅ [Lyrics+ UI] Translation controls container created");

    const controlHeight = '28px';
    const fontSize = '13px';

    // Language selector (dropdown)
    const langSelect = document.createElement('select');
    for (const [code, name] of Object.entries(TRANSLATION_LANGUAGES)) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      langSelect.appendChild(opt);
    }
    langSelect.value = getSavedTranslationLang();
    langSelect.title = 'Select translation language';
    langSelect.style.flex = '1';
    langSelect.style.minWidth = '0';
    langSelect.style.height = controlHeight;
    langSelect.style.background = '#333';
    langSelect.style.color = '#e0e0e0';
    langSelect.style.border = 'none';
    langSelect.style.borderRadius = '5px';
    langSelect.style.fontSize = fontSize;
    langSelect.style.fontWeight = '400';
    langSelect.style.boxSizing = 'border-box';
    console.info("✅ [Lyrics+ UI] Translation language dropdown created, current language:", getSavedTranslationLang());
    langSelect.onchange = () => {
      saveTranslationLang(langSelect.value);
      console.info("📝 [Lyrics+ UI] Translation language changed to:", langSelect.value);
      removeTranslatedLyrics();
      lastTranslatedLang = null;
    };

    // Translate button
    const translateBtn = document.createElement('button');
    translateBtn.textContent = 'Translate';
    translateBtn.style.flex = '1';
    translateBtn.style.minWidth = '0';
    translateBtn.style.height = controlHeight;
    translateBtn.style.background = '#1aa34a';
    translateBtn.style.color = '#e0e0e0';
    translateBtn.style.border = 'none';
    translateBtn.style.borderRadius = '5px';
    translateBtn.style.fontSize = fontSize;
    translateBtn.style.fontWeight = '600';
    translateBtn.style.cursor = 'pointer';
    translateBtn.style.boxSizing = 'border-box';
    console.info("✅ [Lyrics+ UI] Translate button created");
    translateBtn.onclick = translateLyricsInPopup;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Original'; // Remove Translation Button
    removeBtn.style.flex = '1';
    removeBtn.style.minWidth = '0';
    removeBtn.style.height = controlHeight;
    removeBtn.style.background = '#333';
    removeBtn.style.color = '#e0e0e0';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '5px';
    removeBtn.style.fontSize = fontSize;
    removeBtn.style.fontWeight = '600';
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.boxSizing = 'border-box';
    console.info("✅ [Lyrics+ UI] Remove translation button ('Original') created");
    removeBtn.onclick = () => {
      console.info("🌐 [Lyrics+ Translation] Remove translation button clicked - showing original lyrics");
      removeTranslatedLyrics();
      lastTranslatedLang = null;
    };

    // Append controls in order: left, center, right
    translationControls.appendChild(langSelect);
    translationControls.appendChild(translateBtn);
    translationControls.appendChild(removeBtn);

    const closeBtn = document.createElement("button");
    closeBtn.title = "Close Lyrics+";
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" style="display:block"><path d="M6,6 L18,18 M18,6 L6,18"/></svg>`;
    Object.assign(closeBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      lineHeight: "1",
      userSelect: "auto",
      width: "28px",
      height: "28px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = "white";
    });
    closeBtn.onclick = () => {
      savePopupState(popup);
      removePopup();
      stopPollingForTrackChange();
    };

    // --- Translation Toggle Button ---
    const translationToggleBtn = document.createElement("button");
    translationToggleBtn.title = "Show/hide translation controls";
    translationToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="display:block"><path d="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z"/></svg>`;
    Object.assign(translationToggleBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      lineHeight: "1",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    translationToggleBtn.addEventListener('mouseenter', () => {
      translationToggleBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    translationToggleBtn.addEventListener('mouseleave', () => {
      translationToggleBtn.style.color = "white";
    });

    // --- Transliteration Toggle Button ---
    const transliterationToggleBtn = document.createElement("button");
    transliterationToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="display:block"><path fill-rule="evenodd" d="M 1.17,11.3 L 5.11,0.8 L 6.99,0.8 L 10.93,11.3 L 9.12,11.3 L 8.19,8.63 L 3.94,8.63 L 2.98,11.3 L 1.17,11.3 M 4.49,7.1 L 7.61,7.1 L 6.09,2.76 L 5.99,2.76 L 4.49,7.1"/><path d="M 22.03,10.13 L 22.03,7.8 Q 22.03,7.07 21.52,6.56 Q 21.01,6.05 20.28,6.05 L 14.93,6.05 L 17.03,8.15 L 16.2,8.97 L 12.7,5.47 L 16.2,1.97 L 17.03,2.78 L 14.93,4.88 L 20.28,4.88 Q 21.49,4.88 22.35,5.74 Q 23.2,6.59 23.2,7.8 L 23.2,10.13 L 22.03,10.13"/><path d="M 1.97,13.87 L 1.97,16.2 Q 1.97,16.93 2.48,17.44 Q 2.99,17.95 3.72,17.95 L 9.07,17.95 L 6.97,15.85 L 7.8,15.03 L 11.3,18.53 L 7.8,22.03 L 6.97,21.22 L 9.07,19.12 L 3.72,19.12 Q 2.51,19.12 1.65,18.26 Q 0.8,17.41 0.8,16.2 L 0.8,13.87 L 1.97,13.87"/><path d="M13.91 12.53V14.67H12.74V15.92H13.91V17.93L12.56 18.27L12.85 19.57L13.91 19.26V21.53C13.91 21.67 13.87 21.72 13.73 21.72C13.6 21.72 13.19 21.72 12.79 21.71C12.96 22.09 13.12 22.68 13.17 23.03C13.89 23.03 14.4 22.99 14.76 22.76C15.11 22.54 15.23 22.17 15.23 21.53V18.88L16.19 18.59L16.02 17.36L15.23 17.59V15.92H16.15V14.67H15.23V12.53ZM20.43 16.09V17.84H19.22V16.09ZM21.35 12.5C21.14 13.21 20.76 14.14 20.41 14.81H18.54L19.41 14.45C19.24 13.93 18.82 13.13 18.44 12.56L17.27 13.01C17.6 13.57 17.94 14.3 18.12 14.81H16.72V16.09H17.9V17.84H16.37V19.14H17.84C17.71 20.25 17.33 21.46 16.11 22.24C16.41 22.46 16.84 22.92 17.02 23.2C18.48 22.14 19.0 20.6 19.16 19.14H20.43V23.11H21.77V19.14H23.14V17.84H21.77V16.09H22.88V14.81H21.77C22.09 14.25 22.44 13.6 22.77 12.98Z"/></svg>`;
    transliterationToggleBtn.title = "Show transliteration";
    Object.assign(transliterationToggleBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      lineHeight: "1",
      display: "none", // Hidden by default, shown when transliteration data is available
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    transliterationToggleBtn.addEventListener('mouseenter', () => {
      transliterationToggleBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    transliterationToggleBtn.addEventListener('mouseleave', () => {
      transliterationToggleBtn.style.color = "white";
    });

    console.info("✅ [Lyrics+ UI] Transliteration button created (hidden by default, shows when transliteration data available)");

    // --- Chinese Conversion Button (Traditional ⇄ Simplified) ---
    // Styled to match other header buttons
    const chineseConvBtn = document.createElement("button");
    chineseConvBtn.id = "lyrics-plus-chinese-conv-btn";
    chineseConvBtn.textContent = "繁→简"; // Default, will be updated based on detected script
    chineseConvBtn.title = "Convert Chinese script";
    Object.assign(chineseConvBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      fontSize: "16px",
      lineHeight: "1",
      display: "none", // Hidden by default, shown when Chinese lyrics are present
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    // Now that every header icon shares the same 28x28 box + a real `gap` on
    // buttonGroup, the old manual right-padding hack for spacing is no longer needed.
    chineseConvBtn.addEventListener('mouseenter', () => {
      chineseConvBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    chineseConvBtn.addEventListener('mouseleave', () => {
      chineseConvBtn.style.color = "white";
    });

    // Helper to update button text based on original script type and conversion state
    // For Traditional lyrics (繁): "繁→简" (convert) / "繁←简" (revert)
    // For Simplified lyrics (简): "简→繁" (convert) / "简←繁" (revert)
    function updateChineseConvBtnText() {
      const isConverted = isChineseConversionEnabled();
      if (originalChineseScriptType === 'traditional') {
        chineseConvBtn.textContent = isConverted ? "简" : "繁";
        chineseConvBtn.title = isConverted
          ? "Revert to Traditional Chinese"
          : "Convert to Simplified Chinese";
      } else {
        // Simplified lyrics
        chineseConvBtn.textContent = isConverted ? "繁" : "简";
        chineseConvBtn.title = isConverted
          ? "Revert to Simplified Chinese"
          : "Convert to Traditional Chinese";
      }
    }
    popup._updateChineseConvBtnText = updateChineseConvBtnText;

    chineseConvBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const newState = !isChineseConversionEnabled();
      setChineseConversionEnabled(newState);
      // Update button text to show new conversion direction
      updateChineseConvBtnText();
      // Re-render cached lyrics with new conversion setting (no provider reload)
      rerenderLyrics(popup);
    };
    // Store reference on popup for access in updateLyricsContent
    popup._chineseConvBtn = chineseConvBtn;
    popup._transliterationToggleBtn = transliterationToggleBtn;

    // --- Download Synced Lyrics Button ---
    const downloadBtnWrapper = document.createElement("div");
    downloadBtnWrapper.style.position = "relative"; // For dropdown positioning
    downloadBtnWrapper.style.display = "inline-flex";
    downloadBtnWrapper.style.alignItems = "center";
    downloadBtnWrapper.style.flexShrink = "0";
    // Pushes the whole icon row to the right when there's slack space (visually
    // identical to justify-content:flex-end), but unlike flex-end this collapses
    // to 0 on overflow instead of shoving content off the unreachable left side -
    // so scrollLeft:0 correctly shows the download button and scrolling right
    // reveals the rest.
    downloadBtnWrapper.style.marginLeft = "auto";

    const downloadBtn = document.createElement("button");
    downloadBtn.title = "Download lyrics";
    Object.assign(downloadBtn.style, {
      background: "none",
      color: "#fff",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      width: "28px",
      height: "28px",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      transition: "none",
      position: "relative",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    downloadBtn.addEventListener('mouseenter', () => {
      downloadBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    downloadBtn.addEventListener('mouseleave', () => {
      downloadBtn.style.color = "#fff";
    });

    downloadBtn.innerHTML = `
  <svg id="lyrics-download-svg" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
    <path d="M12 5v9"></path>
    <polyline points="8 13 12 17 16 13"></polyline>
    <rect x="4" y="19" width="16" height="2" rx="1"></rect>
  </svg>
`;

    // Dropdown menu for download types
    // NOTE: positioned as "fixed" (not "absolute") and appended to document.body
    // rather than downloadBtnWrapper. Since buttonGroup now scrolls horizontally
    // on narrow/mobile widths (overflow-x: auto), it also clips overflow on the
    // y-axis as an unavoidable side effect of that - which was silently clipping
    // this dropdown invisible even though it was opening correctly. Moving it to
    // body sidesteps that ancestor clipping entirely; position is computed fresh
    // each time it's opened, in downloadBtn.onclick below.
    const downloadDropdown = document.createElement("div");
    downloadDropdown.id = "lyrics-plus-download-dropdown";
    downloadBtn._dropdown = downloadDropdown;
    Object.assign(downloadDropdown.style, {
      position: "fixed",
      top: "0",
      left: "0",
      minWidth: "90px",
      backgroundColor: "#121212",
      border: "1px solid #444",
      borderRadius: "8px",
      boxShadow: "0 2px 12px #0009",
      zIndex: 100001, // must exceed the popup's own zIndex (100000) now that it's a body-level sibling
      display: "none",
      flexDirection: "column",
      padding: "4px 4px"
    });
    downloadDropdown.tabIndex = -1;

    const syncOption = document.createElement("button");
    syncOption.id = "lyrics-plus-download-sync";
    syncOption.textContent = "Synced";
    Object.assign(syncOption.style, {
      background: "#121212",
      color: "#fff",
      border: "none",
      padding: "8px 10px",
      cursor: "pointer",
      textAlign: "left",
      fontSize: "14px",
      borderRadius: "5px"
    });
    syncOption.onmouseenter = () => { syncOption.style.background = "#333"; syncOption.style.color = "#fff"; };
    syncOption.onmouseleave = () => { syncOption.style.background = "#121212"; syncOption.style.color = "#fff"; };

    const unsyncOption = document.createElement("button");
    unsyncOption.id = "lyrics-plus-download-unsync";
    unsyncOption.textContent = "Unsynced";
    Object.assign(unsyncOption.style, {
      background: "#121212",
      color: "#fff",
      border: "none",
      padding: "8px 10px",
      cursor: "pointer",
      textAlign: "left",
      fontSize: "14px",
      borderRadius: "5px"
    });
    unsyncOption.onmouseenter = () => { unsyncOption.style.background = "#333"; unsyncOption.style.color = "#fff"; };
    unsyncOption.onmouseleave = () => { unsyncOption.style.background = "#121212"; unsyncOption.style.color = "#fff"; };

    downloadDropdown.appendChild(syncOption);
    downloadDropdown.appendChild(unsyncOption);

    downloadBtnWrapper.appendChild(downloadBtn);
    document.body.appendChild(downloadDropdown);

    console.info("✅ [Lyrics+ UI] Download button created and added to DOM");

    // Logic for showing/hiding the dropdown and downloading
    let currentHideHandler = null;
    const removeHideHandler = () => {
      if (currentHideHandler) {
        document.removeEventListener("mousedown", currentHideHandler, { capture: true });
        document.removeEventListener("contextmenu", currentHideHandler, { capture: true });
        currentHideHandler = null;
      }
    };

    downloadBtn.onclick = (e) => {
      // Always show dropdown if at least one download option is available
      let hasSynced = !!currentSyncedLyrics;
      let hasUnsynced = !!currentUnsyncedLyrics;

      // Show/hide options
      syncOption.style.display = hasSynced ? "" : "none";
      unsyncOption.style.display = hasUnsynced ? "" : "none";

      if (hasSynced || hasUnsynced) {
        if (downloadDropdown.style.display === "flex") {
          downloadDropdown.style.display = "none";
          removeHideHandler();
          return;
        }
        const btnRect = downloadBtn.getBoundingClientRect();
        downloadDropdown.style.top = (btnRect.bottom + 4) + "px";
        downloadDropdown.style.left = btnRect.left + "px";
        downloadDropdown.style.display = "flex";
        setTimeout(() => {
          removeHideHandler();
          const hide = (ev) => {
            if (!downloadDropdown.contains(ev.target) && !downloadBtn.contains(ev.target)) {
              downloadDropdown.style.display = "none";
              removeHideHandler();
            }
          };
          currentHideHandler = hide;
          document.addEventListener("mousedown", hide, { capture: true });
          document.addEventListener("contextmenu", hide, { capture: true });
        }, 1);
      } else {
        // Fallback: try to extract from DOM as plain
        const popup = document.getElementById("lyrics-plus-popup");
        if (!popup) return;
        const lyricsContainer = popup.querySelector("#lyrics-plus-content");
        if (!lyricsContainer) return;
        const lines = Array.from(lyricsContainer.querySelectorAll('p')).map(p => ({ text: p.textContent }));
        if (lines.length) downloadUnsyncedLyrics(lines, getCurrentTrackInfo(), Providers.current);
      }
    };

    // Set up dropdown options
    syncOption.onclick = (e) => {
      downloadDropdown.style.display = "none";
      console.info("💾 [Lyrics+ UI] Download synced lyrics clicked");
      if (currentSyncedLyrics) downloadSyncedLyrics(currentSyncedLyrics, getCurrentTrackInfo(), Providers.current);
    };
    unsyncOption.onclick = (e) => {
      downloadDropdown.style.display = "none";
      console.info("💾 [Lyrics+ UI] Download unsynced lyrics clicked");
      if (currentUnsyncedLyrics) downloadUnsyncedLyrics(currentUnsyncedLyrics, getCurrentTrackInfo(), Providers.current);
    };

    // --- Font Size Selector ---
    const fontSizeSelect = document.createElement("select");
    fontSizeSelect.id = "lyrics-plus-font-size-select";
    fontSizeSelect.title = "Change lyrics font size";
    fontSizeSelect.style.cursor = "pointer";
    fontSizeSelect.style.background = "#121212";
    fontSizeSelect.style.border = "none";
    fontSizeSelect.style.color = "white";
    fontSizeSelect.style.fontSize = "14px";
    fontSizeSelect.style.lineHeight = "1";
    fontSizeSelect.style.height = "28px";
    fontSizeSelect.style.width = "64px";
    fontSizeSelect.style.flexShrink = "0";
    fontSizeSelect.style.boxSizing = "border-box";
    ["16", "22", "28", "32", "38", "44", "50", "56"].forEach(size => {
      const opt = document.createElement("option");
      opt.value = size;
      opt.textContent = size + "px";
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.value = localStorage.getItem("lyricsPlusFontSize") || "22";
    console.info("✅ [Lyrics+ UI] Font size selector created with options: 16-56px, current value:", fontSizeSelect.value + "px");
    fontSizeSelect.onchange = () => {
      localStorage.setItem("lyricsPlusFontSize", fontSizeSelect.value);
      console.info("📝 [Lyrics+ UI] Font size changed to:", fontSizeSelect.value + "px");
      const lyricsContent = document.getElementById("lyrics-plus-content");
      if (lyricsContent) {
        lyricsContent.style.fontSize = fontSizeSelect.value + "px";
      }
    };

    // Toggle offset section
    const offsetToggleBtn = document.createElement("button");
    offsetToggleBtn.title = "Show/hide timing offset";
    offsetToggleBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" style="display:block"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87c-0.12,0.21-0.08,0.47,0.12,0.61l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
    Object.assign(offsetToggleBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      lineHeight: "1",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "28px",
      height: "28px",
      padding: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    offsetToggleBtn.addEventListener('mouseenter', () => {
      offsetToggleBtn.style.color = "rgba(255, 255, 255, 0.7)";
    });
    offsetToggleBtn.addEventListener('mouseleave', () => {
      offsetToggleBtn.style.color = "white";
    });

    const titleBar = document.createElement("div");
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.style.flexShrink = "0";
    titleBar.appendChild(title);

    // GitHub profile icon
    const ghIcon = document.createElement('div');
    Object.assign(ghIcon.style, { display: 'flex', alignItems: 'center', paddingLeft: '6px', fontSize: '14px' });
    ghIcon.innerHTML = `<a href="https://github.com/Myst1cX/spotify-web-lyrics-plus" target="_blank" title="View on GitHub" style="opacity:0.8; color:white; display:flex; align-items:center;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg></a>`;
    titleBar.appendChild(ghIcon);

    header.appendChild(titleBar);

    // Button group right side
    const buttonGroup = document.createElement("div");
    buttonGroup.id = "lyrics-plus-button-group";
    buttonGroup.style.display = "flex";
    buttonGroup.style.alignItems = "center";
    buttonGroup.style.justifyContent = "flex-start";
    buttonGroup.style.flex = "1 1 auto";
    buttonGroup.style.gap = "1px";
    // NOTE: this must stay shrinkable (flex-shrink defaults to 1, minWidth 0)
    // so it can actually give up width to titleBar in the header's flex row.
    // A previous version pinned this to flexShrink:0, which meant the group
    // could never get narrower than its content and instead spilled past the
    // popup's edge on small/mobile widths. Since every icon child below is
    // individually flexShrink:0, the *children* still hold their fixed size -
    // it's only the group's own box that shrinks, and once that box is
    // narrower than its children's total width, overflow-x kicks in and the
    // group scrolls horizontally (scrollbar hidden via .hide-scrollbar)
    // instead of icons overlapping or spilling out.
    buttonGroup.style.minWidth = "0";
    buttonGroup.style.flexWrap = "nowrap";
    buttonGroup.style.overflowX = "auto";
    buttonGroup.style.overflowY = "hidden";
    buttonGroup.appendChild(downloadBtnWrapper);
    buttonGroup.appendChild(fontSizeSelect);
    buttonGroup.appendChild(btnReset);
    buttonGroup.appendChild(chineseConvBtn);
    buttonGroup.appendChild(translationToggleBtn);
    buttonGroup.appendChild(transliterationToggleBtn);
    buttonGroup.appendChild(offsetToggleBtn);

    // PiP toggle button
    const pipToggleBtn = document.createElement("button");
    pipToggleBtn.id = "lyrics-plus-pip-btn";
    pipToggleBtn.title = "Toggle Picture-in-Picture";
    pipToggleBtn.setAttribute('aria-label', 'Open Miniplayer');
    pipToggleBtn.setAttribute('aria-pressed', 'false');
    pipToggleBtn.setAttribute('data-active', 'false');
    pipToggleBtn.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="display:block"><path d="M16 2.45c0-.8-.65-1.45-1.45-1.45H1.45C.65 1 0 1.65 0 2.45v11.1C0 14.35.65 15 1.45 15h5.557v-1.5H1.5v-11h13V7H16z"></path><path d="M15.25 9.007a.75.75 0 0 1 .75.75v4.493a.75.75 0 0 1-.75.75H9.325a.75.75 0 0 1-.75-.75V9.757a.75.75 0 0 1 .75-.75z"></path></svg>`;
    Object.assign(pipToggleBtn.style, {
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      color: 'white',
      padding: '0',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: '1',
      width: '28px',
      height: '28px',
      flexShrink: '0',
      boxSizing: 'border-box',
    });
    pipToggleBtn.addEventListener('mouseenter', () => {
      if (!isPipActive) pipToggleBtn.style.color = 'rgba(255,255,255,0.7)';
    });
    pipToggleBtn.addEventListener('mouseleave', () => {
      if (!isPipActive) pipToggleBtn.style.color = 'white';
    });
    pipToggleBtn.onclick = togglePip;
    buttonGroup.appendChild(pipToggleBtn);

    // closeBtn is a sibling of buttonGroup, not a child - keeps it permanently
    // pinned/visible regardless of buttonGroup's scroll position, same as
    // titleBar (Lyrics+ + GitHub icon) on the left.
    header.appendChild(buttonGroup);
    header.appendChild(closeBtn);

    headerWrapper.appendChild(header);

    // Real horizontal scrollbar in place of the old 1px "delimiter line"
    // mimicking a scrollbar: left/right arrow buttons flanking a track+thumb,
    // same spot/footprint as before (bleeds to the popup's edges).
    const headerScrollTrack = document.createElement("div");
    headerScrollTrack.id = "lyrics-plus-header-scroll-track";
    Object.assign(headerScrollTrack.style, {
      display: "none", // shown only while buttonGroup is actually overflowing
      alignItems: "center",
      gap: "2px",
      height: "14px",
      marginTop: "9px",
      marginLeft: "-12px",
      marginRight: "-12px",
      paddingLeft: "12px",
      paddingRight: "12px",
      flexShrink: "0",
      boxSizing: "border-box",
    });

    // Left/right arrow buttons. Held down, they auto-repeat (short delay,
    // then a fast interval) same as a native OS scrollbar's end arrows.
    function makeHeaderScrollArrow(direction) {
      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "lyrics-plus-header-scroll-arrow";
      arrow.setAttribute("aria-label", direction < 0 ? "Scroll icons left" : "Scroll icons right");
      const points = direction < 0 ? "10,2 4,8 10,14" : "6,2 12,8 6,14";
      arrow.innerHTML = `<svg viewBox="0 0 16 16" width="9" height="9"><polygon points="${points}" fill="currentColor"/></svg>`;
      Object.assign(arrow.style, {
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.6)",
        padding: "0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "14px",
        height: "14px",
        flexShrink: "0",
        boxSizing: "border-box",
      });
      arrow.addEventListener("mouseenter", () => { if (!arrow.disabled) arrow.style.color = "rgba(255,255,255,0.95)"; });
      arrow.addEventListener("mouseleave", () => { if (!arrow.disabled) arrow.style.color = "rgba(255,255,255,0.6)"; });
      return arrow;
    }
    const headerScrollArrowLeft = makeHeaderScrollArrow(-1);
    const headerScrollArrowRight = makeHeaderScrollArrow(1);
    headerScrollTrack.appendChild(headerScrollArrowLeft);

    // Inner track: the actual bar the thumb rides on, between the two arrows.
    const headerScrollTrackInner = document.createElement("div");
    headerScrollTrackInner.id = "lyrics-plus-header-scroll-track-inner";
    Object.assign(headerScrollTrackInner.style, {
      position: "relative",
      flex: "1 1 auto",
      minWidth: "0",
      height: "5px",
      borderRadius: "3px",
      backgroundColor: "rgba(255,255,255,0.12)",
    });

    // Invisible, taller hit area layered over the thin visual track so it's
    // actually grabbable with a mouse/finger, without changing its visual size
    // (same pattern as resizerHitArea for the corner resize handle).
    const headerScrollHitArea = document.createElement("div");
    headerScrollHitArea.id = "lyrics-plus-header-scroll-hitarea";
    Object.assign(headerScrollHitArea.style, {
      position: "absolute",
      left: "0",
      right: "0",
      top: "-5px",
      bottom: "-5px",
      cursor: "pointer",
      touchAction: "none", // we handle the drag ourselves
    });
    headerScrollTrackInner.appendChild(headerScrollHitArea);

    const headerScrollThumb = document.createElement("div");
    headerScrollThumb.id = "lyrics-plus-header-scroll-thumb";
    Object.assign(headerScrollThumb.style, {
      position: "absolute",
      top: "0",
      left: "0",
      height: "100%",
      width: "0%",
      borderRadius: "3px",
      backgroundColor: "rgba(255, 255, 255, 0.45)",
      pointerEvents: "none", // purely visual - hitArea handles input, clicks pass through
    });
    headerScrollTrackInner.appendChild(headerScrollThumb);
    headerScrollTrack.appendChild(headerScrollTrackInner);
    headerScrollTrack.appendChild(headerScrollArrowRight);
    headerWrapper.appendChild(headerScrollTrack);

    function updateHeaderScrollIndicator() {
      const scrollWidth = buttonGroup.scrollWidth;
      const clientWidth = buttonGroup.clientWidth;
      const isOverflowing = scrollWidth > clientWidth + 1;
      if (!isOverflowing) {
        headerScrollTrack.style.display = "none";
        return;
      }
      headerScrollTrack.style.display = "flex";
      const MIN_THUMB_PERCENT = 15;
      const widthPercent = Math.max(MIN_THUMB_PERCENT, (clientWidth / scrollWidth) * 100);
      const scrollableWidth = scrollWidth - clientWidth;
      const scrollFraction = scrollableWidth > 0 ? buttonGroup.scrollLeft / scrollableWidth : 0;
      const leftPercent = scrollFraction * (100 - widthPercent);
      headerScrollThumb.style.width = widthPercent + "%";
      headerScrollThumb.style.left = leftPercent + "%";

      const atStart = buttonGroup.scrollLeft <= 0;
      const atEnd = buttonGroup.scrollLeft >= scrollableWidth - 1;
      headerScrollArrowLeft.disabled = atStart;
      headerScrollArrowRight.disabled = atEnd;
      headerScrollArrowLeft.style.color = atStart ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)";
      headerScrollArrowRight.style.color = atEnd ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)";
      headerScrollArrowLeft.style.cursor = atStart ? "default" : "pointer";
      headerScrollArrowRight.style.cursor = atEnd ? "default" : "pointer";
    }
    buttonGroup.addEventListener("scroll", updateHeaderScrollIndicator, { passive: true });
    const headerScrollResizeObserver = new ResizeObserver(() => updateHeaderScrollIndicator());
    headerScrollResizeObserver.observe(buttonGroup);
    popup._headerScrollResizeObserver = headerScrollResizeObserver;
    // Exposed so code elsewhere (e.g. chineseConvBtn/transliterationToggleBtn
    // display toggles in updateLyricsContent/loadLyricsFromCache/rerenderLyrics)
    // can force a re-check after changing a child button's visibility, since
    // the ResizeObserver above only fires when buttonGroup's own box resizes,
    // not when a child inside it appears/disappears while flexbox keeps
    // buttonGroup's own width fixed.
    popup._updateHeaderScrollIndicator = updateHeaderScrollIndicator;
    requestAnimationFrame(updateHeaderScrollIndicator);

    // --- Drag-to-scroll for the thumb ---
    // headerWrapper is itself the popup's drag-to-move handle (see makeDraggable
    // below) - without stopPropagation here, mousedown/touchstart on this hit
    // area would bubble up and start moving the whole popup instead of
    // scrolling buttonGroup.
    let headerScrollDragging = false;

    function headerScrollPointerToScrollLeft(clientX) {
      const trackRect = headerScrollTrackInner.getBoundingClientRect();
      const scrollableWidth = buttonGroup.scrollWidth - buttonGroup.clientWidth;
      if (scrollableWidth <= 0 || trackRect.width <= 0) return 0;
      const fraction = clamp((clientX - trackRect.left) / trackRect.width, 0, 1);
      return fraction * scrollableWidth;
    }

    function onHeaderScrollDragStart(e) {
      e.stopPropagation();
      e.preventDefault();
      headerScrollDragging = true;
      const clientX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
      buttonGroup.scrollLeft = headerScrollPointerToScrollLeft(clientX);
    }

    function onHeaderScrollDragMove(e) {
      if (!headerScrollDragging) return;
      e.stopPropagation();
      if (e.type === "touchmove") e.preventDefault();
      const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
      buttonGroup.scrollLeft = headerScrollPointerToScrollLeft(clientX);
    }

    function onHeaderScrollDragEnd() {
      headerScrollDragging = false;
    }

    headerScrollHitArea.addEventListener("mousedown", onHeaderScrollDragStart);
    headerScrollHitArea.addEventListener("touchstart", onHeaderScrollDragStart, { passive: false });
    window.addEventListener("mousemove", onHeaderScrollDragMove);
    window.addEventListener("touchmove", onHeaderScrollDragMove, { passive: false });
    window.addEventListener("mouseup", onHeaderScrollDragEnd);
    window.addEventListener("touchend", onHeaderScrollDragEnd);
    // Without this, an interrupted touch (touchcancel, not touchend) leaves
    // headerScrollDragging stuck true.
    window.addEventListener("touchcancel", onHeaderScrollDragEnd);

    popup._headerScrollDragHandlers = { onHeaderScrollDragMove, onHeaderScrollDragEnd };

    // --- Click-and-hold on the arrow buttons: step-scroll, then auto-repeat ---
    const ARROW_SCROLL_STEP = 50;
    const ARROW_REPEAT_DELAY = 350;
    const ARROW_REPEAT_INTERVAL = 60;
    let headerArrowRepeatTimeout = null;
    let headerArrowRepeatInterval = null;

    function scrollButtonGroupBy(delta) {
      const scrollableWidth = buttonGroup.scrollWidth - buttonGroup.clientWidth;
      buttonGroup.scrollLeft = clamp(buttonGroup.scrollLeft + delta, 0, scrollableWidth);
    }

    function clearHeaderArrowRepeat() {
      if (headerArrowRepeatTimeout) { clearTimeout(headerArrowRepeatTimeout); headerArrowRepeatTimeout = null; }
      if (headerArrowRepeatInterval) { clearInterval(headerArrowRepeatInterval); headerArrowRepeatInterval = null; }
    }

    function onHeaderArrowDown(direction, e) {
      if ((direction < 0 && headerScrollArrowLeft.disabled) || (direction > 0 && headerScrollArrowRight.disabled)) return;
      e.stopPropagation();
      e.preventDefault();
      scrollButtonGroupBy(direction * ARROW_SCROLL_STEP);
      clearHeaderArrowRepeat();
      headerArrowRepeatTimeout = setTimeout(() => {
        headerArrowRepeatInterval = setInterval(() => scrollButtonGroupBy(direction * ARROW_SCROLL_STEP), ARROW_REPEAT_INTERVAL);
      }, ARROW_REPEAT_DELAY);
    }
    function onHeaderArrowUp() {
      clearHeaderArrowRepeat();
    }

    headerScrollArrowLeft.addEventListener("mousedown", (e) => onHeaderArrowDown(-1, e));
    headerScrollArrowLeft.addEventListener("touchstart", (e) => onHeaderArrowDown(-1, e), { passive: false });
    headerScrollArrowRight.addEventListener("mousedown", (e) => onHeaderArrowDown(1, e));
    headerScrollArrowRight.addEventListener("touchstart", (e) => onHeaderArrowDown(1, e), { passive: false });
    headerScrollArrowLeft.addEventListener("mouseleave", onHeaderArrowUp);
    headerScrollArrowRight.addEventListener("mouseleave", onHeaderArrowUp);
    window.addEventListener("mouseup", onHeaderArrowUp);
    window.addEventListener("touchend", onHeaderArrowUp);
    // touchend alone misses an interrupted touch (incoming call, OS gesture,
    // etc.), which fires touchcancel instead and would otherwise leave the
    // repeat running indefinitely.
    window.addEventListener("touchcancel", onHeaderArrowUp);

    popup._headerArrowScrollHandlers = { onHeaderArrowUp };
    // Let removePopup() stop any in-flight repeat immediately (e.g. if the
    // popup is torn down mid-press by a track/provider event) instead of
    // leaving the interval spinning on a now-detached buttonGroup.
    popup._clearHeaderArrowRepeat = clearHeaderArrowRepeat;

// --- Wheel-to-horizontal-scroll for the header icon row ---
// Scrolling up (deltaY negative) moves right; scrolling down (deltaY positive) moves left.
function onHeaderWheel(e) {
  const scrollableWidth = buttonGroup.scrollWidth - buttonGroup.clientWidth;
  if (scrollableWidth <= 0) return; // nothing to scroll, let the page handle it normally
  e.preventDefault();
  buttonGroup.scrollLeft = clamp(buttonGroup.scrollLeft - e.deltaY, 0, scrollableWidth);
}
headerWrapper.addEventListener("wheel", onHeaderWheel, { passive: false });
popup._headerWheelHandler = onHeaderWheel;

    // Tabs container
    const tabs = document.createElement("div");
    tabs.style.display = "flex";
    tabs.style.marginTop = "12px";
    tabs.style.gap = "8px";

    // --- PATCH: Separate single-click and double-click handlers for provider tabs ---
    let providerClickTimer = null;

    Providers.list.forEach(name => {
      const btn = document.createElement("button");
      btn.textContent = name;
      btn.style.flex = "1";
      btn.style.minWidth = "0";
      btn.style.padding = "6px";
      btn.style.borderRadius = "6px";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      btn.style.backgroundColor = (Providers.current === name) ? "#1aa34a" : "#333";
      btn.style.color = "#e0e0e0";
      btn.style.fontWeight = "600";
      btn.style.overflow = "hidden";
      btn.style.textOverflow = "ellipsis";
      btn.style.whiteSpace = "nowrap";
      btn.style.boxSizing = "border-box";

      btn.onclick = async (e) => {
        if (providerClickTimer) return; // already waiting for double-click, skip
        providerClickTimer = setTimeout(async () => {
          // Abort any ongoing autofetch by invalidating the current search ID
          // This prevents the autofetch loop from continuing when user manually selects a provider
          currentSearchId = null;
          console.log(`🛑 [Lyrics+] User manually selected ${name} provider - aborting any ongoing autofetch`);

          Providers.setCurrent(name);
          updateTabs(tabs);
          await updateLyricsContent(popup, getCurrentTrackInfo());
          providerClickTimer = null;
        }, 250);
      };

      btn.ondblclick = (e) => {
        e.preventDefault();
        if (providerClickTimer) {
          clearTimeout(providerClickTimer);
          providerClickTimer = null;
        }
        // Double-click (desktop/mobile) for Musixmatch settings
        if (name === "Musixmatch") {
          showMusixmatchTokenModal();
        }
        // Double-click (desktop/mobile) for Spotify settings
        if (name === "Spotify") {
          showSpotifyTokenModal();
        }
      };

      tabs.appendChild(btn);
    });
    headerWrapper.appendChild(tabs);
    popup._lyricsTabs = tabs;

    // Lyrics container
    const lyricsContainer = document.createElement("div");
    lyricsContainer.id = "lyrics-plus-content";
    Object.assign(lyricsContainer.style, {
      flex: "1",
      overflowY: "auto",
      overflowX: "hidden",
      padding: "12px",
      whiteSpace: "pre-wrap",
      fontSize: "22px",
      lineHeight: "1.5",
      backgroundColor: "#121212",
      userSelect: "text",
      textAlign: "center",
    });
    lyricsContainer.style.fontSize = (localStorage.getItem("lyricsPlusFontSize") || "22") + "px";
    // Add horizontal padding to ensure lyrics never overflow
    lyricsContainer.style.paddingLeft = "10.0%";
    lyricsContainer.style.paddingRight = "10.0%";

    async function translateLinesBatch(lines, targetLang) {
      if (!lines.length) return [];
      // Build the URL with multiple q= parameters (the right way!)
      const baseUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + targetLang + "&dt=t";
      const url = baseUrl + lines.map(line => "&q=" + encodeURIComponent(line)).join('');
      try {
        const response = await fetch(url);
        const data = await response.json();
        // data[0] is an array of arrays: [[translated, original, ...], ...]
        return data[0].map(item => item[0]);
      } catch (error) {
        console.error('Batch translation failed:', error);
        return lines.map(_ => '[Translation Error]');
      }
    }

    function removeTranslatedLyrics() {
      const translatedEls = lyricsContainer.querySelectorAll('[data-translated="true"]');
      translatedEls.forEach(el => {
        unhideElementWhilePipActive(lyricsContainer, el);
        el.remove();
      });
      translationPresent = false;
      lastTranslatedLang = null;
    }

    async function translateLyricsInPopup() {
      if (!lyricsContainer || isTranslating) return;
      const targetLang = getSavedTranslationLang();
      console.info("🌐 [Lyrics+ Translation] Translate button clicked, target language:", targetLang);
      if (translationPresent && lastTranslatedLang === targetLang) return;
      isTranslating = true;
      translateBtn.disabled = true;
      try {
        removeTranslatedLyrics();
        const pEls = Array.from(lyricsContainer.querySelectorAll('p'));
        const linesToTranslate = pEls.filter(el => el.textContent.trim() && el.textContent.trim() !== "♪");
        await Promise.all(linesToTranslate.map(async (p) => {
          const originalText = p.textContent.trim();
          const translatedText = await translateText(originalText, targetLang);
          const translationDiv = document.createElement('div');
          translationDiv.textContent = translatedText;
          translationDiv.style.color = 'gray';
          // Only shrink to match transliteration's size when transliteration is also
          // shown alongside it; with just original + translation, keep it full size.
          translationDiv.style.fontSize = transliterationPresent ? '0.85em' : '';
          translationDiv.setAttribute('data-translated', 'true');

          // Find correct insertion point: after transliteration if it exists, otherwise after lyric
          let insertionPoint = p.nextSibling;

          // Check if next sibling is a transliteration div
          if (insertionPoint && insertionPoint.nodeType === 1 &&
              insertionPoint.getAttribute('data-transliteration') === 'true') {
            // Transliteration exists - insert translation AFTER it
            insertionPoint = insertionPoint.nextSibling;
          }

          p.parentNode.insertBefore(translationDiv, insertionPoint);
          hideElementWhilePipActive(lyricsContainer, translationDiv);
        }));
        lastTranslatedLang = targetLang;
        translationPresent = true;
      } finally {
        translateBtn.disabled = false;
        isTranslating = false;
      }
    }

    // NOTE (17.43): removeTransliterationLyrics/showTransliterationInPopup were moved to
    // top-level scope (see below rerenderLyrics/hideButtonsForInstrumental) because
    // updateLyricsContent() and loadLyricsFromCache() - both outer-scope functions -
    // need to call them too, and being nested inside createPopup() made them
    // inaccessible from outside it (ReferenceError: showTransliterationInPopup is not
    // defined), silently aborting those callers before they reached their own
    // remaining logic (e.g. LyricsCache.set(), so manually-selected/refetched lyrics
    // with transliteration data never got cached). These thin wrappers preserve the
    // original zero-argument call sites used inside createPopup().
    function removeTransliterationLyrics() {
      removeTransliterationLyricsFor(lyricsContainer);
    }

    function showTransliterationInPopup() {
      showTransliterationInPopupFor(lyricsContainer);
    }

    // Translator Controls Container
    const translatorWrapper = document.createElement("div");
    translatorWrapper.id = "lyrics-plus-translator-wrapper";
    translatorWrapper.style.display = "block";
    translatorWrapper.style.background = "#121212";
    translatorWrapper.style.borderBottom = "none"; // Will be set to "1px solid #333" if visible
    translatorWrapper.style.padding = "8px 12px";
    translatorWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    translatorWrapper.style.overflow = "hidden";
    translatorWrapper.style.maxHeight = "0";
    translatorWrapper.style.pointerEvents = "none";

    let translatorVisible = localStorage.getItem('lyricsPlusTranslatorVisible');
    if (translatorVisible === null) translatorVisible = false;
    else translatorVisible = JSON.parse(translatorVisible);

    if (translatorVisible) {
      translatorWrapper.style.maxHeight = "100px";
      translatorWrapper.style.pointerEvents = "";
      translatorWrapper.style.padding = "8px 12px";
      translatorWrapper.style.borderBottom = "1px solid #333";
      translationToggleBtn.title = "Hide translation controls";
    } else {
      translatorWrapper.style.maxHeight = "0";
      translatorWrapper.style.pointerEvents = "none";
      translatorWrapper.style.padding = "0 12px";
      translatorWrapper.style.borderBottom = "none";
      translationToggleBtn.title = "Show translation controls";
    }
    translatorWrapper.appendChild(translationControls);

    translationToggleBtn.onclick = () => {
      translatorVisible = !translatorVisible;
      localStorage.setItem('lyricsPlusTranslatorVisible', JSON.stringify(translatorVisible));
      if (translatorVisible) {
        translatorWrapper.style.maxHeight = "100px";
        translatorWrapper.style.pointerEvents = "";
        translatorWrapper.style.padding = "8px 12px";
        translatorWrapper.style.borderBottom = "1px solid #333";
        translationToggleBtn.title = "Hide translation controls";
      } else {
        translatorWrapper.style.maxHeight = "0";
        translatorWrapper.style.pointerEvents = "none";
        translatorWrapper.style.padding = "0 12px";
        translatorWrapper.style.borderBottom = "none";
        translationToggleBtn.title = "Show translation controls";
      }
    };

    transliterationToggleBtn.onclick = () => {
      if (transliterationPresent) {
        removeTransliterationLyrics();
        localStorage.setItem(STORAGE_KEYS.TRANSLITERATION_ENABLED, 'false');
        transliterationToggleBtn.title = "Show transliteration";
        console.info("🔤 [Lyrics+ UI] Transliteration button clicked: HIDDEN");
      } else {
        showTransliterationInPopup();
        localStorage.setItem(STORAGE_KEYS.TRANSLITERATION_ENABLED, 'true');
        transliterationToggleBtn.title = "Hide transliteration";
        console.info("🔤 [Lyrics+ UI] Transliteration button clicked: SHOWN");
      }
    };

    // Offset Settings UI
    const offsetWrapper = document.createElement("div");
    offsetWrapper.style.display = "flex";
    offsetWrapper.style.alignItems = "center";
    offsetWrapper.style.justifyContent = "space-between";
    offsetWrapper.style.padding = "8px 12px";
    offsetWrapper.style.background = "#121212";
    offsetWrapper.style.borderBottom = "none"; // Will be set by applyOffsetVisibility
    offsetWrapper.style.fontSize = "15px";
    offsetWrapper.style.width = "100%";

    const offsetLabel = document.createElement("div");
    offsetLabel.innerHTML = `Adjust lyrics timing (ms):<br><span style="font-size: 11px; color: #aaa;">lower = appear later, higher = appear earlier</span>`;
    offsetLabel.style.color = "#fff";

    // Compact input+spinner container
    const inputStack = document.createElement("div");
    inputStack.style.position = "relative";
    inputStack.style.display = "inline-block";
    inputStack.style.marginLeft = "16px";
    inputStack.style.height = "28px";
    inputStack.style.width = "68px";

    // The input itself - compact!
    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.min = "-5000";
    offsetInput.max = "5000";
    offsetInput.step = "50";
    offsetInput.value = getAnticipationOffset();
    offsetInput.style.width = "68px";
    offsetInput.style.height = "28px";
    offsetInput.style.background = "#222";
    offsetInput.style.color = "#fff";
    offsetInput.style.border = "1px solid #444";
    offsetInput.style.borderRadius = "6px";
    offsetInput.style.padding = "2px 24px 2px 6px";
    offsetInput.style.boxSizing = "border-box";
    offsetInput.style.fontSize = "14px";
    offsetInput.style.MozAppearance = "textfield";
    offsetInput.style.appearance = "textfield";

    // Spinner container
    const spinnerContainer = document.createElement("div");
    spinnerContainer.style.position = "absolute";
    spinnerContainer.style.right = "0";
    spinnerContainer.style.top = "0";
    spinnerContainer.style.height = "28px";
    spinnerContainer.style.width = "24px";
    spinnerContainer.style.display = "flex";
    spinnerContainer.style.flexDirection = "column";
    spinnerContainer.style.justifyContent = "center";
    spinnerContainer.style.zIndex = "2";

    const iconFill = "rgba(255, 255, 255, 0.85)";

    // Up button
    const upBtn = document.createElement("button");
    upBtn.innerHTML = `
  <svg viewBox="0 0 24 20" xmlns="http://www.w3.org/2000/svg"
    style="display:block; margin:auto; width:20px; height:12px;" fill="${iconFill}" >
    <path d="M12 4L2 16H22L12 4Z" />
  </svg>
`;
    upBtn.style.background = "#333";
    upBtn.style.border = "none";
    upBtn.style.borderRadius = "2px 2px 0 0";
    upBtn.style.width = "24px";
    upBtn.style.height = "14px";
    upBtn.style.cursor = "pointer";
    upBtn.style.padding = "0";
    upBtn.tabIndex = -1;
    upBtn.onmouseover = () => upBtn.style.background = "#444";
    upBtn.onmouseout = () => upBtn.style.background = "#333";

    // Down button
    const downBtn = document.createElement("button");
    downBtn.innerHTML = `
  <svg viewBox="0 0 24 20" xmlns="http://www.w3.org/2000/svg"
    style="display:block; margin:auto; width:20px; height:12px;" fill="${iconFill}" >
    <path d="M12 16L2 4H22L12 16Z" />
  </svg>
`;
    downBtn.style.background = "#333";
    downBtn.style.border = "none";
    downBtn.style.borderRadius = "0 0 2px 2px";
    downBtn.style.width = "24px";
    downBtn.style.height = "14px";
    downBtn.style.cursor = "pointer";
    downBtn.style.padding = "0";
    downBtn.tabIndex = -1;
    downBtn.onmouseover = () => downBtn.style.background = "#444";
    downBtn.onmouseout = () => downBtn.style.background = "#333";

    // Shared value update function
    function saveAndApplyOffset() {
      let val = parseInt(offsetInput.value, 10) || 0;
      if (val > 5000) val = 5000;
      if (val < -5000) val = -5000;
      offsetInput.value = val;
      setAnticipationOffset(val);
      if (currentSyncedLyrics && currentLyricsContainer) {
        highlightSyncedLyrics(currentSyncedLyrics, currentLyricsContainer);
      }
    }

    upBtn.onclick = (e) => {
      e.preventDefault();
      let val = parseInt(offsetInput.value, 10) || 0;
      val += 50;
      if (val > 5000) val = 5000;
      offsetInput.value = val;
      saveAndApplyOffset();
    };
    downBtn.onclick = (e) => {
      e.preventDefault();
      let val = parseInt(offsetInput.value, 10) || 0;
      val -= 50;
      if (val < -5000) val = -5000;
      offsetInput.value = val;
      saveAndApplyOffset();
    };

    offsetInput.addEventListener("change", saveAndApplyOffset);
    offsetInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        saveAndApplyOffset();
        offsetInput.blur();
      }
    });

    spinnerContainer.appendChild(upBtn);
    spinnerContainer.appendChild(downBtn);
    inputStack.appendChild(offsetInput);
    inputStack.appendChild(spinnerContainer);

    offsetWrapper.appendChild(offsetLabel);
    offsetWrapper.appendChild(inputStack);

    // Add tabs visibility toggle as a separate settings row
    const tabsToggleWrapper = document.createElement("div");
    tabsToggleWrapper.id = "lyrics-plus-tabs-toggle-wrapper";
    tabsToggleWrapper.style.display = "flex";
    tabsToggleWrapper.style.alignItems = "center";
    tabsToggleWrapper.style.justifyContent = "space-between";
    tabsToggleWrapper.style.padding = "8px 12px";
    tabsToggleWrapper.style.background = "#121212";
    tabsToggleWrapper.style.borderBottom = "none"; // Will be set by applyOffsetVisibility
    tabsToggleWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    tabsToggleWrapper.style.overflow = "hidden";

    const tabsToggleLabel = document.createElement("div");
    tabsToggleLabel.textContent = "Show lyrics source tabs";
    tabsToggleLabel.style.color = "#fff";
    tabsToggleLabel.style.fontSize = "15px";

    const tabsToggleCheckbox = document.createElement("input");
    tabsToggleCheckbox.type = "checkbox";
    tabsToggleCheckbox.id = "lyrics-plus-tabs-toggle";
    tabsToggleCheckbox.className = "lyrics-plus-checkbox";
    tabsToggleCheckbox.style.cursor = "pointer";

    console.info("✅ [Lyrics+ Settings] Tabs toggle created (Show lyrics source tabs)");

    tabsToggleWrapper.appendChild(tabsToggleLabel);
    tabsToggleWrapper.appendChild(tabsToggleCheckbox);

    // Add seekbar visibility toggle as a separate settings row
    const seekbarToggleWrapper = document.createElement("div");
    seekbarToggleWrapper.id = "lyrics-plus-seekbar-toggle-wrapper";
    seekbarToggleWrapper.style.display = "flex";
    seekbarToggleWrapper.style.alignItems = "center";
    seekbarToggleWrapper.style.justifyContent = "space-between";
    seekbarToggleWrapper.style.padding = "8px 12px";
    seekbarToggleWrapper.style.background = "#121212";
    seekbarToggleWrapper.style.borderBottom = "none"; // Will be set by applyOffsetVisibility
    seekbarToggleWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    seekbarToggleWrapper.style.overflow = "hidden";

    const seekbarToggleLabel = document.createElement("div");
    seekbarToggleLabel.textContent = "Show seekbar";
    seekbarToggleLabel.style.color = "#fff";
    seekbarToggleLabel.style.fontSize = "15px";

    const seekbarToggleCheckbox = document.createElement("input");
    seekbarToggleCheckbox.type = "checkbox";
    seekbarToggleCheckbox.id = "lyrics-plus-seekbar-toggle-settings";
    seekbarToggleCheckbox.className = "lyrics-plus-checkbox";
    seekbarToggleCheckbox.style.cursor = "pointer";

    console.info("✅ [Lyrics+ Settings] Seekbar toggle created (Show seekbar)");

    seekbarToggleWrapper.appendChild(seekbarToggleLabel);
    seekbarToggleWrapper.appendChild(seekbarToggleCheckbox);

    // Add playback controls visibility toggle as a separate settings row
    const controlsToggleWrapper = document.createElement("div");
    controlsToggleWrapper.id = "lyrics-plus-controls-toggle-wrapper";
    controlsToggleWrapper.style.display = "flex";
    controlsToggleWrapper.style.alignItems = "center";
    controlsToggleWrapper.style.justifyContent = "space-between";
    controlsToggleWrapper.style.padding = "8px 12px";
    controlsToggleWrapper.style.background = "#121212";
    controlsToggleWrapper.style.borderBottom = "none"; // Will be set by applyOffsetVisibility
    controlsToggleWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    controlsToggleWrapper.style.overflow = "hidden";

    const controlsToggleLabel = document.createElement("div");
    controlsToggleLabel.textContent = "Show playback controls";
    controlsToggleLabel.style.color = "#fff";
    controlsToggleLabel.style.fontSize = "15px";

    const controlsToggleCheckbox = document.createElement("input");
    controlsToggleCheckbox.type = "checkbox";
    controlsToggleCheckbox.id = "lyrics-plus-controls-toggle-settings";
    controlsToggleCheckbox.className = "lyrics-plus-checkbox";
    controlsToggleCheckbox.style.cursor = "pointer";

    console.info("✅ [Lyrics+ Settings] Playback controls toggle created (Show playback controls)");

    controlsToggleWrapper.appendChild(controlsToggleLabel);
    controlsToggleWrapper.appendChild(controlsToggleCheckbox);

    // Add AMOLED theme toggle as a separate settings row
    const themeToggleWrapper = document.createElement("div");
    themeToggleWrapper.id = "lyrics-plus-theme-toggle-wrapper";
    themeToggleWrapper.style.display = "flex";
    themeToggleWrapper.style.alignItems = "center";
    themeToggleWrapper.style.justifyContent = "space-between";
    themeToggleWrapper.style.padding = "8px 12px";
    themeToggleWrapper.style.background = "#121212";
    themeToggleWrapper.style.borderBottom = "none"; // Will be set by applyOffsetVisibility
    themeToggleWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    themeToggleWrapper.style.overflow = "hidden";

    const themeToggleLabel = document.createElement("div");
    themeToggleLabel.textContent = "Enable AMOLED theme";
    themeToggleLabel.style.color = "#fff";
    themeToggleLabel.style.fontSize = "15px";

    const themeToggleCheckbox = document.createElement("input");
    themeToggleCheckbox.type = "checkbox";
    themeToggleCheckbox.id = "lyrics-plus-theme-toggle-settings";
    themeToggleCheckbox.className = "lyrics-plus-checkbox";
    themeToggleCheckbox.style.cursor = "pointer";

    console.info("✅ [Lyrics+ Settings] Theme toggle created (Enable AMOLED theme)");

    themeToggleWrapper.appendChild(themeToggleLabel);
    themeToggleWrapper.appendChild(themeToggleCheckbox);

    // Playback Controls Bar
    const controlsBar = document.createElement("div");
    Object.assign(controlsBar.style, {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      borderTop: "1px solid #333",
      backgroundColor: "#121212",
      userSelect: "none",
    });

    offsetWrapper.id = "lyrics-plus-offset-wrapper";
    controlsBar.id = "lyrics-plus-controls-bar";
    offsetWrapper.style.transition = "max-height 0.3s, padding 0.3s";
    offsetWrapper.style.overflow = "hidden";
    controlsBar.style.transition = "max-height 0.3s";
    controlsBar.style.overflow = "hidden";
    let offsetVisible = localStorage.getItem('lyricsPlusOffsetVisible');
    if (offsetVisible === null) offsetVisible = true;
    else offsetVisible = JSON.parse(offsetVisible);

    let controlsVisible = localStorage.getItem('lyricsPlusControlsVisible');
    if (controlsVisible === null) controlsVisible = true;
    else controlsVisible = JSON.parse(controlsVisible);

    let seekbarVisible = localStorage.getItem('lyricsPlusSeekbarVisible');
    if (seekbarVisible === null) seekbarVisible = true;
    else seekbarVisible = JSON.parse(seekbarVisible);

    let tabsVisible = localStorage.getItem('lyricsPlusTabsVisible');
    if (tabsVisible === null) tabsVisible = true;
    else tabsVisible = JSON.parse(tabsVisible);

    let amoledThemeEnabled = localStorage.getItem('lyricsPlusTheme');
    if (amoledThemeEnabled === null) amoledThemeEnabled = false;
    else amoledThemeEnabled = JSON.parse(amoledThemeEnabled);

    // Theme color constants
    const THEME_COLOR_DEFAULT = "#121212";
    const THEME_COLOR_AMOLED = "#000";
    const THEME_HOVER_DEFAULT = "#333";
    const THEME_HOVER_AMOLED = "#1a1a1a";

    const OFFSET_WRAPPER_PADDING = "8px 12px";

    // Helper functions to apply visibility states (reduces duplication)
    function applyTabsVisibility(visible) {
      if (visible) {
        tabs.style.display = "flex";
        tabs.style.marginTop = "12px";
      } else {
        tabs.style.display = "none";
        tabs.style.marginTop = "0";
      }
    }

    function applyControlsVisibility(visible) {
      if (visible) {
        controlsBar.style.maxHeight = "80px";
        controlsBar.style.opacity = "1";
        controlsBar.style.pointerEvents = "";
      } else {
        controlsBar.style.maxHeight = "0";
        controlsBar.style.opacity = "0";
        controlsBar.style.pointerEvents = "none";
      }
    }

    function applyProgressWrapperVisibility(visible) {
      // Note: This function should only be called after progressWrapper is created
      if (!progressWrapper) return;
      if (visible) {
        progressWrapper.style.maxHeight = "50px";
        progressWrapper.style.padding = "8px 12px";
        progressWrapper.style.opacity = "1";
        progressWrapper.style.pointerEvents = "";
      } else {
        progressWrapper.style.maxHeight = "0";
        progressWrapper.style.padding = "0 12px";
        progressWrapper.style.opacity = "0";
        progressWrapper.style.pointerEvents = "none";
      }
    }

    function applyOffsetVisibility(visible) {
      if (visible) {
        offsetWrapper.style.maxHeight = "200px";
        offsetWrapper.style.pointerEvents = "";
        offsetWrapper.style.padding = "8px 12px";
        offsetWrapper.style.borderBottom = "1px solid #333";
        tabsToggleWrapper.style.maxHeight = "50px";
        tabsToggleWrapper.style.pointerEvents = "";
        tabsToggleWrapper.style.padding = "8px 12px";
        tabsToggleWrapper.style.borderBottom = "1px solid #333";
        seekbarToggleWrapper.style.maxHeight = "50px";
        seekbarToggleWrapper.style.pointerEvents = "";
        seekbarToggleWrapper.style.padding = "8px 12px";
        seekbarToggleWrapper.style.borderBottom = "1px solid #333";
        controlsToggleWrapper.style.maxHeight = "50px";
        controlsToggleWrapper.style.pointerEvents = "";
        controlsToggleWrapper.style.padding = "8px 12px";
        controlsToggleWrapper.style.borderBottom = "1px solid #333";
        themeToggleWrapper.style.maxHeight = "50px";
        themeToggleWrapper.style.pointerEvents = "";
        themeToggleWrapper.style.padding = "8px 12px";
        themeToggleWrapper.style.borderBottom = "1px solid #333";
      } else {
        offsetWrapper.style.maxHeight = "0";
        offsetWrapper.style.pointerEvents = "none";
        offsetWrapper.style.padding = "0 12px";
        offsetWrapper.style.borderBottom = "none";
        tabsToggleWrapper.style.maxHeight = "0";
        tabsToggleWrapper.style.pointerEvents = "none";
        tabsToggleWrapper.style.padding = "0 12px";
        tabsToggleWrapper.style.borderBottom = "none";
        seekbarToggleWrapper.style.maxHeight = "0";
        seekbarToggleWrapper.style.pointerEvents = "none";
        seekbarToggleWrapper.style.padding = "0 12px";
        seekbarToggleWrapper.style.borderBottom = "none";
        controlsToggleWrapper.style.maxHeight = "0";
        controlsToggleWrapper.style.pointerEvents = "none";
        controlsToggleWrapper.style.padding = "0 12px";
        controlsToggleWrapper.style.borderBottom = "none";
        themeToggleWrapper.style.maxHeight = "0";
        themeToggleWrapper.style.pointerEvents = "none";
        themeToggleWrapper.style.padding = "0 12px";
        themeToggleWrapper.style.borderBottom = "none";
      }
    }

    function applyAmoledTheme(enabled) {
      // Apply theme by toggling a CSS class on body - much more efficient!
      if (enabled) {
        document.body.classList.add('lyrics-plus-amoled-theme');
      } else {
        document.body.classList.remove('lyrics-plus-amoled-theme');
      }
    }

    offsetToggleBtn.onclick = () => {
      offsetVisible = !offsetVisible;
      localStorage.setItem('lyricsPlusOffsetVisible', JSON.stringify(offsetVisible));
      applyOffsetVisibility(offsetVisible);
      offsetToggleBtn.title = offsetVisible ? "Hide timing offset" : "Show timing offset";
    };

    // Seekbar checkbox change handler (in settings)
    seekbarToggleCheckbox.onchange = () => {
      seekbarVisible = seekbarToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusSeekbarVisible', JSON.stringify(seekbarVisible));
      applyProgressWrapperVisibility(seekbarVisible);
      console.info("📝 [Lyrics+ Settings] Seekbar visibility toggled:", seekbarVisible ? "SHOWN" : "HIDDEN");
    };

    // Playback controls checkbox change handler (in settings)
    controlsToggleCheckbox.onchange = () => {
      controlsVisible = controlsToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusControlsVisible', JSON.stringify(controlsVisible));
      applyControlsVisibility(controlsVisible);
      console.info("📝 [Lyrics+ Settings] Playback controls visibility toggled:", controlsVisible ? "SHOWN" : "HIDDEN");
    };

    // Theme toggle checkbox change handler (in settings)
    themeToggleCheckbox.onchange = () => {
      amoledThemeEnabled = themeToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusTheme', JSON.stringify(amoledThemeEnabled));
      applyAmoledTheme(amoledThemeEnabled);
      console.info("📝 [Lyrics+ Settings] AMOLED theme toggled:", amoledThemeEnabled ? "ENABLED" : "DISABLED");
    };

    // Apply initial visibility states
    applyOffsetVisibility(offsetVisible);
    applyControlsVisibility(controlsVisible);
    applyTabsVisibility(tabsVisible);
    applyAmoledTheme(amoledThemeEnabled);

    // Set initial button titles based on visibility states
    offsetToggleBtn.title = offsetVisible ? "Hide timing offset" : "Show timing offset";

    // Initialize checkboxes state
    seekbarToggleCheckbox.checked = seekbarVisible;
    controlsToggleCheckbox.checked = controlsVisible;
    themeToggleCheckbox.checked = amoledThemeEnabled;
    console.info("📝 [Lyrics+ Settings] Seekbar initial state:", seekbarVisible ? "SHOWN" : "HIDDEN");
    console.info("📝 [Lyrics+ Settings] Playback controls initial state:", controlsVisible ? "SHOWN" : "HIDDEN");
    console.info("📝 [Lyrics+ Settings] AMOLED theme initial state:", amoledThemeEnabled ? "ENABLED" : "DISABLED");

    // Initialize and handle tabs toggle checkbox in settings
    tabsToggleCheckbox.checked = tabsVisible;
    console.info("📝 [Lyrics+ Settings] Tabs initial state:", tabsVisible ? "SHOWN" : "HIDDEN");
    tabsToggleCheckbox.onchange = () => {
      tabsVisible = tabsToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusTabsVisible', JSON.stringify(tabsVisible));
      applyTabsVisibility(tabsVisible);
      console.info("📝 [Lyrics+ Settings] Tabs visibility toggled:", tabsVisible ? "SHOWN" : "HIDDEN");
    };

    // Create Spotify-style control buttons
    function createSpotifyControlButton(type, ariaLabel, onClick) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", ariaLabel);
      button.setAttribute("data-encore-id", "buttonTertiary");
      button.setAttribute("tabindex", "0");

      // Base button styling to match Spotify
      Object.assign(button.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        textDecoration: "none",
        color: "rgba(255, 255, 255, 0.7)",
        backgroundColor: "transparent",
        minWidth: "32px",
        height: "32px",
        padding: "8px",
        fontSize: "16px",
        fontWeight: "400",
        transition: "all 0.2s ease",
        userSelect: "none",
        outline: "none"
      });

      // Icon wrapper
      const iconWrapper = document.createElement("span");
      iconWrapper.setAttribute("aria-hidden", "true");
      Object.assign(iconWrapper.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px"
      });
      button.appendChild(iconWrapper);

      // Hover/focus effects
      button.addEventListener("mouseenter", () => {
        // Only brighten if not green/active
        const isActive = button.classList.contains("active");
        if (isActive) {
          button.style.color = "#1db954";
        } else {
          button.style.color = "rgba(255, 255, 255, 1)";
        }
        button.style.transform = "scale(1.04)";
      });

      button.addEventListener("mouseleave", () => {
        const isActive = button.classList.contains("active");
        button.style.color = isActive ? "#1db954" : "rgba(255, 255, 255, 0.7)";
        button.style.transform = "scale(1)";
      });

      button.addEventListener("blur", () => {
        button.style.outline = "none";
      });

      // Click handler
      button.addEventListener("click", onClick);
      return { button, iconWrapper };
    }

    // Create main play/pause button (larger, primary style)
    function createPlayPauseButton(onClick) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", "Play");
      button.setAttribute("data-testid", "lyrics-plus-playpause");
      button.setAttribute("data-encore-id", "buttonPrimary");
      button.setAttribute("tabindex", "0");

      // Primary button styling (larger, prominent)
      Object.assign(button.style, {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        textDecoration: "none",
        color: "#000",
        backgroundColor: "#fff",
        minWidth: "32px",
        height: "32px",
        padding: "8px",
        fontSize: "16px",
        fontWeight: "400",
        transition: "all 0.2s ease",
        userSelect: "none",
        outline: "none"
      });

      // Icon wrapper
      const iconWrapper = document.createElement("span");
      iconWrapper.setAttribute("aria-hidden", "true");
      Object.assign(iconWrapper.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px"
      });
      button.appendChild(iconWrapper);

      // Hover/focus effects
      button.addEventListener("mouseenter", () => {
        button.style.transform = "scale(1.04)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.transform = "scale(1)";
      });

      button.addEventListener("blur", () => {
        button.style.outline = "none";
      });

      // Click handler
      button.addEventListener("click", onClick);

      return { button, iconWrapper };
    }

    function sendSpotifyCommand(command) {
      // Map commands to their language-independent finder functions
      const buttonFinders = {
        shuffle: findSpotifyShuffleButton,
        playpause: findSpotifyPlayPauseButton,
        next: findSpotifyNextButton,
        previous: findSpotifyPreviousButton,
        repeat: findSpotifyRepeatButton
      };

      const findButton = buttonFinders[command];
      const btn = findButton ? findButton() : null;

      if (btn) {
        console.info("🎵 [Lyrics+ Playback] Command sent to Spotify:", command.toUpperCase());
        btn.click();

        // If on mobile, try touch events as a fallback
        if (btn.offsetParent !== null && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          btn.dispatchEvent(new TouchEvent('touchstart', {bubbles:true, cancelable:true}));
          btn.dispatchEvent(new TouchEvent('touchend', {bubbles:true, cancelable:true}));
        }
      } else {
        console.warn("Spotify control button not found for:", command);
      }
    }

    // Create all control buttons
    const { button: btnShuffle, iconWrapper: shuffleIconWrapper } = createSpotifyControlButton(
      "shuffle",
      "Enable shuffle",
      () => {
        sendSpotifyCommand("shuffle");
        setTimeout(() => updateShuffleButton(btnShuffle, shuffleIconWrapper), 100);
      }
    );
    console.info("✅ [Lyrics+ Playback] Shuffle button created");

    const { button: btnPrevious, iconWrapper: prevIconWrapper } = createSpotifyControlButton(
      "previous",
      "Previous",
      () => sendSpotifyCommand("previous")
    );
    // Use DOM-cloned icon from Spotify's visible button
    updatePreviousButtonIcon(prevIconWrapper);
    console.info("✅ [Lyrics+ Playback] Previous button created");

    const { button: btnPlayPause, iconWrapper: playIconWrapper } = createPlayPauseButton(
      () => {
        sendSpotifyCommand("playpause");
        setTimeout(() => updatePlayPauseButton(btnPlayPause, playIconWrapper), 100);
      }
    );
    console.info("✅ [Lyrics+ Playback] Play/Pause button created");

    const { button: btnNext, iconWrapper: nextIconWrapper } = createSpotifyControlButton(
      "next",
      "Next",
      () => sendSpotifyCommand("next")
    );
    // Use DOM-cloned icon from Spotify's visible button
    updateNextButtonIcon(nextIconWrapper);
    console.info("✅ [Lyrics+ Playback] Next button created");

    const { button: btnRepeat, iconWrapper: repeatIconWrapper } = createSpotifyControlButton(
      "repeat",
      "Enable repeat",
      () => {
        sendSpotifyCommand("repeat");
        setTimeout(() => updateRepeatButton(btnRepeat, repeatIconWrapper), 100);
      }
    );
    console.info("✅ [Lyrics+ Playback] Repeat button created");

    // Initialize button states using DOM-cloned icons from Spotify's visible buttons
    updateShuffleButton(btnShuffle, shuffleIconWrapper);
    updatePlayPauseButton(btnPlayPause, playIconWrapper);
    updateRepeatButton(btnRepeat, repeatIconWrapper);

    // Store references for later updates
    popup._shuffleBtn = { button: btnShuffle, iconWrapper: shuffleIconWrapper };
    popup._playPauseBtn = { button: btnPlayPause, iconWrapper: playIconWrapper };
    popup._repeatBtn = { button: btnRepeat, iconWrapper: repeatIconWrapper };
    popup._prevBtn = { iconWrapper: prevIconWrapper };
    popup._nextBtn = { iconWrapper: nextIconWrapper };

    controlsBar.appendChild(btnShuffle);
    controlsBar.appendChild(btnPrevious);
    controlsBar.appendChild(btnPlayPause);
    controlsBar.appendChild(btnNext);
    controlsBar.appendChild(btnRepeat);

    // Add a realtime progress bar element (dynamic progress bar)
    const progressWrapper = document.createElement("div");
    progressWrapper.id = "lyrics-plus-progress-wrapper";
    progressWrapper.style.display = "flex";
    progressWrapper.style.alignItems = "center";
    progressWrapper.style.gap = "8px";
    progressWrapper.style.padding = "8px 12px";
    progressWrapper.style.borderTop = "1px solid #222";
    progressWrapper.style.background = "#111";
    progressWrapper.style.boxSizing = "border-box";
    progressWrapper.style.transition = "max-height 0.3s, padding 0.3s, opacity 0.3s";
    progressWrapper.style.overflow = "hidden";

    const timeNow = document.createElement("div");
    timeNow.id = "lyrics-plus-time-now";
    timeNow.textContent = "0:00";
    timeNow.style.color = "#bbb";
    timeNow.style.fontSize = "12px";
    timeNow.style.width = "44px";
    timeNow.style.textAlign = "right";

    const progressInput = document.createElement("input");
    progressInput.type = "range";
    progressInput.id = "lyrics-plus-progress";
    progressInput.min = "0";
    progressInput.max = "100";
    progressInput.step = "1";
    progressInput.value = "0";
    Object.assign(progressInput.style, {
      flex: "1",
      appearance: "none",
      height: "6px",
      borderRadius: "3px",
      background: "linear-gradient(90deg, #1db954 0%, #1db954 0%, #444 0%)",
      outline: "none",
      margin: "0",
    });

    // Simple styling for thumb (dynamic progress bar)
    const thumbStyle = document.createElement("style");
    thumbStyle.textContent = `
      #lyrics-plus-progress::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 0 4px rgba(29,185,84,0.12);
        cursor: pointer;
      }
      #lyrics-plus-progress::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #fff;
        cursor: pointer;
      }
    `;
    document.head.appendChild(thumbStyle);

    // Custom dark mode checkbox styles
    const checkboxStyle = document.createElement("style");
    checkboxStyle.textContent = `
      .lyrics-plus-checkbox {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border: 2px solid #555;
        border-radius: 4px;
        background: #282828;
        cursor: pointer;
        position: relative;
        transition: all 0.2s ease;
      }
      .lyrics-plus-checkbox:hover {
        border-color: #888;
        background: #333;
      }
      .lyrics-plus-checkbox:checked {
        background: #1db954;
        border-color: #1db954;
      }
      .lyrics-plus-checkbox:checked::after {
        content: '';
        position: absolute;
        left: 5px;
        top: 2px;
        width: 4px;
        height: 8px;
        border: solid #fff;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
      }
      .lyrics-plus-checkbox:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(29, 185, 84, 0.3);
      }

      /* AMOLED Theme CSS - Applied once to parent container */
      .lyrics-plus-amoled-theme #lyrics-plus-popup,
      .lyrics-plus-amoled-theme #lyrics-plus-header-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-translator-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-tabs-toggle-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-seekbar-toggle-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-controls-toggle-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-theme-toggle-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-offset-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-content,
      .lyrics-plus-amoled-theme #lyrics-plus-controls-bar,
      .lyrics-plus-amoled-theme #lyrics-plus-progress-wrapper,
      .lyrics-plus-amoled-theme #lyrics-plus-font-size-select,
      .lyrics-plus-amoled-theme #lyrics-plus-download-dropdown,
      .lyrics-plus-amoled-theme #lyrics-plus-download-sync,
      .lyrics-plus-amoled-theme #lyrics-plus-download-unsync {
        background: #000 !important;
        background-color: #000 !important;
      }

      /* Modal theme */
      .lyrics-plus-amoled-theme #lyrics-plus-musixmatch-modal-box,
      .lyrics-plus-amoled-theme #lyrics-plus-spotify-modal-box {
        background: #000 !important;
      }

      /* Hover states for AMOLED theme */
      .lyrics-plus-amoled-theme #lyrics-plus-download-sync:hover,
      .lyrics-plus-amoled-theme #lyrics-plus-download-unsync:hover {
        background: #1a1a1a !important;
      }
    `;
    document.head.appendChild(checkboxStyle);

    const timeTotal = document.createElement("div");
    timeTotal.id = "lyrics-plus-time-total";
    timeTotal.textContent = "0:00";
    timeTotal.style.color = "#bbb";
    timeTotal.style.fontSize = "12px";
    timeTotal.style.width = "44px";
    timeTotal.style.textAlign = "left";

    progressWrapper.appendChild(timeNow);
    progressWrapper.appendChild(progressInput);
    progressWrapper.appendChild(timeTotal);

    console.info("✅ [Lyrics+ Seekbar] Progress bar (seekbar) created with time display");

    // Apply initial visibility state for progressWrapper (must be after progressWrapper is created)
    applyProgressWrapperVisibility(seekbarVisible);

    popup.appendChild(headerWrapper);
    popup.appendChild(translatorWrapper);
    popup.appendChild(tabsToggleWrapper);
    popup.appendChild(seekbarToggleWrapper);
    popup.appendChild(controlsToggleWrapper);
    popup.appendChild(themeToggleWrapper);
    popup.appendChild(offsetWrapper);
    popup.appendChild(lyricsContainer);
    popup.appendChild(controlsBar);
    popup.appendChild(progressWrapper);

    // NOTE: Always append to document.body (top-level), NOT '.main-view-container'.
    // Spotify's .main-view-container establishes CSS containment (contain: layout/paint)
    // for its own virtualized scroll area, which makes it the containing block for any
    // position:fixed descendant - clipping it to that box regardless of z-index. That's
    // why the popup could be dragged/resized over most of the UI but never over
    // #sp-bottom-nav (z-index 9999): the navbar lives outside that containment box, in
    // .Root__main-view, so it always painted on top no matter how high popup's own
    // z-index (100000) was set. All drag/resize math below already uses
    // window.innerWidth/innerHeight, not container-relative values, so nothing depends
    // on the popup living inside .main-view-container.
    document.body.appendChild(popup);

    // Save initial state if using default position (not restored from saved state)
    if (shouldSaveDefaultPosition) {
      savePopupState(popup);
    }

    (function makeDraggable(el, handle) {
      let isDragging = false;
      let startX, startY;
      let origX, origY;

      // Mouse events
      handle.addEventListener("mousedown", (e) => {
        isDragging = true;
        window.lyricsPlusPopupIsDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        document.body.style.userSelect = "none";
      });

      // Touch events
      handle.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        isDragging = true;
        window.lyricsPlusPopupIsDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        document.body.style.userSelect = "none";
      });

      const onDragMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newX = origX + dx;
        let newY = origY + dy;
        const maxX = window.innerWidth - el.offsetWidth;
        const maxY = window.innerHeight - el.offsetHeight;
        newX = Math.min(Math.max(0, newX), maxX);
        newY = Math.min(Math.max(0, newY), maxY);
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.position = "fixed";
      };

      const onDragTouchMove = (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        let newX = origX + dx;
        let newY = origY + dy;
        const maxX = window.innerWidth - el.offsetWidth;
        const maxY = window.innerHeight - el.offsetHeight;
        newX = Math.min(Math.max(0, newX), maxX);
        newY = Math.min(Math.max(0, newY), maxY);
        el.style.left = `${newX}px`;
        el.style.top = `${newY}px`;
        el.style.right = "auto";
        el.style.bottom = "auto";
        el.style.position = "fixed";
        e.preventDefault();
      };

      const onDragMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = "";
          window.lyricsPlusPopupLastDragged = Date.now();
          savePopupState(el);
          setTimeout(() => {
            window.lyricsPlusPopupIsDragging = false;
          }, 200);
        }
      };

      const onDragTouchEnd = () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = "";
          window.lyricsPlusPopupLastDragged = Date.now();
          savePopupState(el);
          setTimeout(() => {
            window.lyricsPlusPopupIsDragging = false;
          }, 200);
        }
      };

      window.addEventListener("mousemove", onDragMouseMove);
      window.addEventListener("touchmove", onDragTouchMove, { passive: false });
      window.addEventListener("mouseup", onDragMouseUp);
      window.addEventListener("touchend", onDragTouchEnd);

      // Store handlers on the element so they can be removed when the popup is destroyed
      el._dragHandlers = { onDragMouseMove, onDragTouchMove, onDragMouseUp, onDragTouchEnd };
    })(popup, headerWrapper);

    // Create an invisible hit area
    const resizerHitArea = document.createElement("div");
    Object.assign(resizerHitArea.style, {
      position: "absolute",
      right: "0px",
      bottom: "0px",
      width: "48px", // a bit larger, for finger touch
      height: "48px",
      zIndex: 19, // just below visible resizer
      background: "transparent",
      touchAction: "none",
    });

    // Create the visual resizer
    const resizer = document.createElement("div");
    Object.assign(resizer.style, {
      width: "16px",
      height: "16px",
      position: "absolute",
      right: "4px",
      bottom: "4px",
      cursor: "nwse-resize",
      backgroundColor: "rgba(255, 255, 255, 0.1)",
      borderTop: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderLeft: "1.5px solid rgba(255, 255, 255, 0.15)",
      boxSizing: "border-box",
      zIndex: 20,
      clipPath: "polygon(100% 0, 0 100%, 100% 100%)"
    });

    popup.appendChild(resizerHitArea);
    popup.appendChild(resizer);

    (function makeResizable(el, handle) {
      let isResizing = false;
      let startX, startY;
      let startWidth, startHeight;

      function startResize(e) {
        e.preventDefault();
        isResizing = true;
        window.lyricsPlusPopupIsResizing = true;
        if (e.type === "mousedown") {
          startX = e.clientX;
          startY = e.clientY;
        } else if (e.type === "touchstart" && e.touches.length === 1) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
        }
        startWidth = el.offsetWidth;
        startHeight = el.offsetHeight;
        document.body.style.userSelect = "none";
      }

      handle.addEventListener("mousedown", startResize);
      handle.addEventListener("touchstart", startResize);

      // Also attach to the hit area!
      resizerHitArea.addEventListener("mousedown", startResize);
      resizerHitArea.addEventListener("touchstart", startResize);

      const onResizeMouseMove = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = startWidth + dx;
        let newHeight = startHeight + dy;

        const minWidth = 360; // match the minWidth style
        const minHeight = 240; // match the minHeight style
        const maxWidth = window.innerWidth - el.offsetLeft;
        const maxHeight = window.innerHeight - el.offsetTop;

        newWidth = clamp(newWidth, minWidth, maxWidth);
        newHeight = clamp(newHeight, minHeight, maxHeight);

        el.style.width = newWidth + "px";
        el.style.height = newHeight + "px";
      };

      const onResizeTouchMove = (e) => {
        if (!isResizing || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        let newWidth = startWidth + dx;
        let newHeight = startHeight + dy;

        const minWidth = 360;
        const minHeight = 240;
        const maxWidth = window.innerWidth - el.offsetLeft;
        const maxHeight = window.innerHeight - el.offsetTop;

        newWidth = clamp(newWidth, minWidth, maxWidth);
        newHeight = clamp(newHeight, minHeight, maxHeight);

        el.style.width = newWidth + "px";
        el.style.height = newHeight + "px";
        e.preventDefault();
      };

      const onResizeMouseUp = () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = "";
          savePopupState(el);
          window.lyricsPlusPopupIsResizing = false;
        }
      };

      const onResizeTouchEnd = () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = "";
          savePopupState(el);
          window.lyricsPlusPopupIsResizing = false;
        }
      };

      window.addEventListener("mousemove", onResizeMouseMove);
      window.addEventListener("touchmove", onResizeTouchMove, { passive: false });
      window.addEventListener("mouseup", onResizeMouseUp);
      window.addEventListener("touchend", onResizeTouchEnd);

      // Store handlers on the element so they can be removed when the popup is destroyed
      el._resizeHandlers = { onResizeMouseMove, onResizeTouchMove, onResizeMouseUp, onResizeTouchEnd };
    })(popup, resizer);

    observeSpotifyPlayPause(popup);
    observeSpotifyShuffle(popup);
    observeSpotifyRepeat(popup);

    const info = getCurrentTrackInfo();
    if (info) {
      currentTrackId = info.id;
      const lyricsContainer = popup.querySelector("#lyrics-plus-content");
      if (lyricsContainer) setLyricsStatusMessage(lyricsContainer, "Loading lyrics...");
      autodetectProviderAndLoad(popup, info);
    }

    // --- DYNAMIC PROGRESS BAR: PROGRESS UPDATES AND SEEKING LOGIC ---
    // This section implements robust detection and seeking for Spotify's progress bar,
    // supporting both CSS-driven progress bars (using --progress-bar-transform) and
    // native range inputs, with fallback to visible position/duration text.

    // No interpolation - we just read directly from Spotify's DOM every 100ms.
    // If Spotify's DOM updates slowly, we show what Spotify shows. This avoids
    // any jumps or sync issues from our own interpolation logic.

     /**
     * readSpotifyProgressBarPercent()
     * Parses the --progress-bar-transform CSS variable from [data-testid="progress-bar"]
     * to get the current playback progress as a percentage (0-100).
     * Falls back to approximating from handle geometry when CSS var is unavailable.
     * @returns {number|null} Percentage (0-100) or null if unavailable
     */
    function readSpotifyProgressBarPercent() {
      try {
        const progressBar = document.querySelector('[data-testid="progress-bar"]');
        if (!progressBar) return null;

        // Try reading the --progress-bar-transform CSS variable
        const computedStyle = window.getComputedStyle(progressBar);
        const transformVar = computedStyle.getPropertyValue('--progress-bar-transform');
        if (transformVar) {
          // Parse "34.747558241173564%" -> 34.747558241173564
          // Use precise regex to match valid decimal numbers (including '0', '0.0', '.5', etc.)
          const match = transformVar.trim().match(/^(\d*\.?\d+)%?$/);
          if (match) {
            const pct = parseFloat(match[1]);
            if (!isNaN(pct) && pct >= 0 && pct <= 100) {
              return pct;
            }
          }
        }

        // Fallback: approximate from handle position relative to bar width
        const handle = progressBar.querySelector('[data-testid="progress-bar-handle"]');
        const barRect = progressBar.getBoundingClientRect();
        if (handle && barRect.width > 0) {
          const handleRect = handle.getBoundingClientRect();
          // Handle center position relative to bar start
          const handleCenter = handleRect.left + handleRect.width / 2;
          const barStart = barRect.left;
          const barWidth = barRect.width;
          const pct = ((handleCenter - barStart) / barWidth) * 100;
          if (!isNaN(pct) && pct >= 0 && pct <= 100) {
            return pct;
          }
        }

        return null;
      } catch (e) {
        console.warn('readSpotifyProgressBarPercent error:', e);
        return null;
      }
    }

    /**
     * updateProgressUIFromSpotify()
     * Updates the popup's progressInput, timeNow, timeTotal, and background gradient
     * from Spotify's playback state.
     *
     * No interpolation - we just read directly from Spotify's DOM every 100ms
     * and display that. This avoids any jumps or sync issues.
     *
     * Fallback order for reading position:
     *   (a) Visible playback-position/playback-duration text (most reliable - matches what user sees)
     *   (b) Native range input
     *   (c) CSS-driven progress-bar percent + computed duration from text/trackInfo
     */
    function updateProgressUIFromSpotify() {
      try {
        let spotifyPosMs = null;
        let spotifyDurMs = null;

        // --- (a) Try visible playback-position text first (most reliable - matches what user sees) ---
        const posEl = document.querySelector('[data-testid="playback-position"]');
        const durEl = document.querySelector('[data-testid="playback-duration"]');
        if (posEl) {
          const posMs = timeStringToMs(posEl.textContent);
          let durMs = 0;

          if (durEl) {
            const raw = durEl.textContent.trim();
            if (raw.startsWith('-')) {
              const remainMs = timeStringToMs(raw);
              durMs = posMs + remainMs;
            } else {
              durMs = timeStringToMs(raw);
            }
          }

          // Fallback for duration: try getCurrentTrackInfo().duration
          if (durMs <= 0) {
            const trackInfo = getCurrentTrackInfo();
            if (trackInfo && trackInfo.duration > 0) {
              durMs = trackInfo.duration;
            }
          }

          if (durMs > 0) {
            spotifyPosMs = posMs;
            spotifyDurMs = durMs;
          }
        }

        // --- (b) Fallback: Try native range input ---
        if (spotifyPosMs === null) {
          const spotifyRange = findSpotifyRangeInput();
          if (spotifyRange) {
            const max = Number(spotifyRange.max) || 0;
            const val = Number(spotifyRange.value) || 0;
            if (max > 0) {
              spotifyPosMs = val;
              spotifyDurMs = max;
            }
          }
        }

        // --- (c) Fallback: Try CSS-driven progress-bar percent + computed duration ---
        if (spotifyPosMs === null) {
          const cssPercent = readSpotifyProgressBarPercent();
          if (cssPercent !== null) {
            // Need to determine total duration to compute position
            let durMs = 0;

            // Try getting duration from visible playback-duration text
            const durElCss = document.querySelector('[data-testid="playback-duration"]');
            if (durElCss) {
              const raw = durElCss.textContent.trim();
              if (!raw.startsWith('-')) {
                durMs = timeStringToMs(raw);
              }
            }

            // Fallback: try getCurrentTrackInfo().duration
            if (durMs <= 0) {
              const trackInfo = getCurrentTrackInfo();
              if (trackInfo && trackInfo.duration > 0) {
                durMs = trackInfo.duration;
              }
            }

            // If remaining time format, compute total from position + remaining
            if (durMs <= 0 && durElCss) {
              const raw = durElCss.textContent.trim();
              if (raw.startsWith('-')) {
                const posElCss = document.querySelector('[data-testid="playback-position"]');
                const posMs = posElCss ? timeStringToMs(posElCss.textContent) : 0;
                const remainMs = timeStringToMs(raw);
                durMs = posMs + remainMs;
              }
            }

            if (durMs > 0) {
              spotifyPosMs = (cssPercent / 100) * durMs;
              spotifyDurMs = durMs;
            }
          }
        }

        // If we couldn't get position from any source, show zeros
        if (spotifyPosMs === null || spotifyDurMs === null || spotifyDurMs <= 0) {
          progressInput.max = "100";
          progressInput.value = "0";
          progressInput.style.background = `linear-gradient(90deg, #1db954 0%, #444 0%)`;
          timeNow.textContent = "0:00";
          timeTotal.textContent = "0:00";
          return;
        }

        // --- No interpolation: Just display what Spotify reports ---
        // This is the simplest approach - we show exactly what Spotify's DOM says.
        // If Spotify updates slowly, our display updates slowly too. But we avoid
        // any jumps or sync issues from trying to interpolate/predict positions.
        const displayPosMs = clamp(spotifyPosMs, 0, spotifyDurMs);

        // Update the UI
        progressInput.max = String(spotifyDurMs);
        progressInput.value = String(displayPosMs);
        const pct = (displayPosMs / spotifyDurMs) * 100;
        progressInput.style.background = `linear-gradient(90deg, #1db954 ${pct}%, #444 ${pct}%)`;
        timeNow.textContent = formatMs(displayPosMs);
        timeTotal.textContent = formatMs(spotifyDurMs);

      } catch (e) {
        console.warn('updateProgressUIFromSpotify error:', e);
      }
    }

    // --- Progress bar watcher for DOM node swaps ---
    let progressBarWatcherAttached = false;
    let progressBarWatcherTimeout = null; // Closure variable for debounce timeout

    /**
     * attachProgressBarWatcher()
     * Installs a MutationObserver on document.body to detect when Spotify may swap
     * DOM nodes (e.g., during navigation or track changes) and re-runs updateProgressUIFromSpotify().
     * The observer is idempotent - calling multiple times only installs one observer.
     */
    function attachProgressBarWatcher() {
      if (progressBarWatcherAttached) return; // Idempotent
      progressBarWatcherAttached = true;

      try {
        const observer = new MutationObserver((mutations) => {
          // Check if any mutation affects progress-related elements
          let shouldUpdate = false;
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              // Check added/removed nodes for progress bar elements
              const relevantSelectors = [
                '[data-testid="progress-bar"]',
                '[data-testid="progress-bar-handle"]',
                '[data-testid="playback-position"]',
                '[data-testid="playback-duration"]',
                'input[type="range"]'
              ];

              const checkNodes = (nodes) => {
                for (const node of nodes) {
                  if (node.nodeType !== Node.ELEMENT_NODE) continue;
                  for (const sel of relevantSelectors) {
                    if (node.matches && node.matches(sel)) return true;
                    if (node.querySelector && node.querySelector(sel)) return true;
                  }
                }
                return false;
              };

              if (checkNodes(mutation.addedNodes) || checkNodes(mutation.removedNodes)) {
                shouldUpdate = true;
                break;
              }
            } else if (mutation.type === 'attributes') {
              // Check if style attribute changed on progress bar (CSS var updates)
              if (mutation.target.matches &&
                  mutation.target.matches('[data-testid="progress-bar"]') &&
                  mutation.attributeName === 'style') {
                shouldUpdate = true;
                break;
              }
            }
          }

          if (shouldUpdate) {
            // Debounce updates to avoid excessive calls
            if (!progressBarWatcherTimeout) {
              progressBarWatcherTimeout = setTimeout(() => {
                progressBarWatcherTimeout = null;
                try {
                  updateProgressUIFromSpotify();
                } catch (e) {
                  console.warn('Progress bar watcher update error:', e);
                }
              }, 100);
            }
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style']
        });
        // Store observer on popup element so it can be disconnected when popup is removed
        popup._progressBarWatcher = observer;
      } catch (e) {
        console.warn('attachProgressBarWatcher error:', e);
        progressBarWatcherAttached = false;
      }
    }

    // --- Event handlers for popup progress input ---
    let userSeeking = false;
    progressInput.addEventListener('input', (e) => {
      userSeeking = true;
      // Show immediate feedback while dragging
      const val = Number(progressInput.value) || 0;
      const max = Number(progressInput.max) || 1;
      const pct = (val / max) * 100;
      progressInput.style.background = `linear-gradient(90deg, #1db954 ${pct}%, #444 ${pct}%)`;
      timeNow.textContent = formatMs(val);
    });

    // Reset userSeeking if user releases mouse outside the element or touch is cancelled
    const resetSeeking = () => { userSeeking = false; };
    progressInput.addEventListener('mouseleave', resetSeeking);
    progressInput.addEventListener('touchcancel', resetSeeking);
    progressInput.addEventListener('blur', resetSeeking);

    // Commit seek on mouseup/touchend
    const commitSeek = (e) => {
      const val = Number(progressInput.value) || 0;
      userSeeking = false;
      console.info("⏩ [Lyrics+ Seekbar] User seeked to position:", formatMs(val));
      // Just seek - no interpolation state to manage
      seekTo(val);
    };
    progressInput.addEventListener('change', commitSeek);
    progressInput.addEventListener('mouseup', commitSeek);
    progressInput.addEventListener('touchend', commitSeek);

    // --- Start progress bar watcher and interval ---
    // Wire attachProgressBarWatcher() to run once popup is created
    attachProgressBarWatcher();

    // Start interval to refresh progress
    // Using 100ms interval for smooth interpolated updates
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
    progressInterval = setInterval(() => {
      // Don't auto-update while user is actively dragging
      if (document.activeElement === progressInput || userSeeking) return;
      updateProgressUIFromSpotify();
    }, 100);

    startPollingForTrackChange(popup);
  }

  // Re-render cached lyrics without fetching from provider (used for Chinese conversion toggle).
  // Mutates existing <p> text content in place instead of rebuilding the container - the line
  // count/order/sync state never changes for a script conversion, only the glyphs shown. This
  // deliberately leaves translation/transliteration <div> siblings untouched so they survive the
  // toggle instead of being wiped (see 17.36 changelog entry below).
  function rerenderLyrics(popup) {
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (!lyricsContainer) return;

    if (!currentSyncedLyrics && !currentUnsyncedLyrics) return;

    const chineseConvBtn = popup._chineseConvBtn;
    const shouldConvertChinese = isChineseConversionEnabled();

    if (chineseConvBtn && popup._updateChineseConvBtnText) {
      popup._updateChineseConvBtnText();
    }

    // Helper function to convert text if needed (bidirectional)
    const convertText = (text) => {
      if (shouldConvertChinese && text && Utils.containsHanCharacter(text)) {
        if (originalChineseScriptType === 'traditional') {
          return Utils.toSimplifiedChinese(text);
        } else {
          return Utils.toTraditionalChinese(text);
        }
      }
      return text;
    };

    const lines = currentSyncedLyrics || currentUnsyncedLyrics;
    const existingLines = lyricsContainer.querySelectorAll('p[data-lyrics-line-index]');

    // Fallback: if there's nothing to mutate yet (shouldn't happen - this is only wired to the
    // Chinese-conversion button, which is only shown once lyrics are already rendered) bail out
    // rather than silently doing nothing.
    if (existingLines.length === 0) return;

    existingLines.forEach(p => {
      const idx = Number(p.getAttribute('data-lyrics-line-index'));
      const raw = lines[idx]?.text;
      if (raw != null) p.textContent = convertText(raw);
    });
  }

  /**
   * Helper function to hide UI buttons for instrumental tracks
   * @param {HTMLElement} popup - The popup element
   */
  function hideButtonsForInstrumental(popup) {
    const downloadBtn = popup.querySelector('button[title="Download lyrics"]');
    const downloadDropdown = downloadBtn ? downloadBtn._dropdown : null;
    const chineseConvBtn = popup._chineseConvBtn;
    const transliterationBtn = popup._transliterationToggleBtn;

    if (downloadBtn) {
      downloadBtn.style.display = "none";
      if (downloadDropdown) downloadDropdown.style.display = "none";
    }
    if (chineseConvBtn) chineseConvBtn.style.display = "none";
    if (transliterationBtn) transliterationBtn.style.display = "none";
    popup._updateHeaderScrollIndicator?.();
  }

  /**
   * Helper function to cache instrumental track data
   * @param {string} trackId - Track ID
   * @param {string} provider - Provider name that detected instrumental
   * @param {Object} trackInfo - Track information
   */
  function cacheInstrumentalTrack(trackId, provider, trackInfo) {
    LyricsCache.set(trackId, {
      provider: null, // No specific provider since instrumental means no lyrics from any source
      synced: null,
      unsynced: null,
      instrumental: true,
      error: "♪ Instrumental Track ♪\n\nThis track has no lyrics",
      trackInfo: {
        title: trackInfo.title,
        artist: trackInfo.artist,
        album: trackInfo.album,
        duration: trackInfo.duration
      }
    });
    console.log(`✅ [Lyrics+] Instrumental track cached (detected by ${provider}) - will show "no lyrics" message on future plays`);
  }

  /**
   * Normalize lyrics time format for syncing
   * Converts startTime (seconds) to time (milliseconds) if needed
   * @param {Array} lyrics - Array of lyric lines
   * @returns {Array} Normalized lyrics with time in milliseconds
   */
  function normalizeLyricsTimeFormat(lyrics) {
    if (!lyrics || !Array.isArray(lyrics)) return lyrics;
    return lyrics.map(line => ({
      ...line,
      time: line.time ?? Math.round((line.startTime || 0) * 1000)
    }));
  }

    /**
   * Load and display lyrics from cache
   * @param {HTMLElement} popup - The popup element
   * @param {Object} info - Track information
   * @param {Object} cachedData - Cached lyrics data
   * @returns {boolean} True if successfully loaded from cache
   */
  function loadLyricsFromCache(popup, info, cachedData) {
    if (!popup || !info || !cachedData) return false;

    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (!lyricsContainer) return false;

    console.log(`✨ [Lyrics+] Loading lyrics from cache for "${info.title}" by ${info.artist}`);

    // Display provider with server info if available (for KPoe)
    let providerDisplay = cachedData.provider || 'Unknown';
    if (cachedData.provider === 'KPoe' && cachedData.metadata?.server) {
      const serverUrl = cachedData.metadata.server;
      let serverLabel = 'Unknown server';
      if (serverUrl.includes('lyricsplus.prjktla.my.id')) {
        serverLabel = 'Primary';
      } else if (serverUrl.includes('lyricsplus.atomix.one')) {
        serverLabel = 'Backup 1';
      } else if (serverUrl.includes('lyricsplus.binimum.org')) {
        serverLabel = 'Backup 2';
      } else if (serverUrl.includes('lyricsplus.prjktla.workers.dev')) {
        serverLabel = 'Backup 3';
      } else if (serverUrl.includes('lyricsplus-seven.vercel.app')) {
        serverLabel = 'Backup 4';
      } else if (serverUrl.includes('lyrics-plus-backend.vercel.app')) {
        serverLabel = 'Backup 5';
      }
      providerDisplay = `KPoe - ${serverLabel}`;
    }

    console.log(`   📦 Source: ${providerDisplay} (previously fetched)`);
    DEBUG.log('Cache', `Loading lyrics from cache for: ${info.title} - ${info.artist}`);

    currentLyricsContainer = lyricsContainer;
    currentLyricsStatusMessage = null;
    currentSyncedLyrics = cachedData.synced;
    currentUnsyncedLyrics = cachedData.unsynced;
    currentLyricsMetadata = cachedData.metadata || null; // Restore metadata from cache

    // Reset translation state
    translationPresent = false;
    transliterationPresent = false;
    lastTranslatedLang = null;

    // Set the provider to the cached one
    if (cachedData.provider) {
      Providers.setCurrent(cachedData.provider);
      if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
    }

    const downloadBtn = popup.querySelector('button[title="Download lyrics"]');
    const downloadDropdown = downloadBtn ? downloadBtn._dropdown : null;
    const chineseConvBtn = popup._chineseConvBtn;

    // Check if cached lyrics contain Chinese characters
    const lyrics = cachedData.synced || cachedData.unsynced || [];
    const hasChineseLyrics = lyrics.some(line => line.text && Utils.containsHanCharacter(line.text));

    if (hasChineseLyrics) {
      const allLyricsText = lyrics.map(line => line.text || '').join('');
      originalChineseScriptType = Utils.detectChineseScriptType(allLyricsText);
    } else {
      originalChineseScriptType = null;
    }

    // Show/hide Chinese conversion button
    if (chineseConvBtn) {
      if (hasChineseLyrics && originalChineseScriptType) {
        chineseConvBtn.style.display = "inline-flex";
        if (popup._updateChineseConvBtnText) {
          popup._updateChineseConvBtnText();
        }
      } else {
        chineseConvBtn.style.display = "none";
      }
    }
    popup._updateHeaderScrollIndicator?.();

    const shouldConvertChinese = isChineseConversionEnabled();
    const convertText = (text) => {
      if (shouldConvertChinese && text && Utils.containsHanCharacter(text)) {
        if (originalChineseScriptType === 'traditional') {
          return Utils.toSimplifiedChinese(text);
        } else {
          return Utils.toTraditionalChinese(text);
        }
      }
      return text;
    };

    pipVideoDetachIfInContainer();
    lyricsContainer.innerHTML = "";

    const pipCurrentlyActive = isPipActive || isPagePipActive;
    const transliterationEnabled = localStorage.getItem(STORAGE_KEYS.TRANSLITERATION_ENABLED) === 'true';
    let hasTransliterationData = false;

    if (currentSyncedLyrics) {
      isShowingSyncedLyrics = true;
      currentSyncedLyrics.forEach(({ text, transliteration }, idx) => {
        const p = document.createElement("p");
        p.setAttribute('data-lyrics-line-index', String(idx));
        p.textContent = convertText(text);
        p.style.margin = "0 0 6px 0";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
        if (transliteration) {
          p.setAttribute('data-transliteration-text', transliteration);
          hasTransliterationData = true;
        }
        lyricsContainer.appendChild(p);
      });
       // Normalize cached lyrics time format for proper syncing (especially for KPoe provider)
      highlightSyncedLyrics(normalizeLyricsTimeFormat(currentSyncedLyrics), lyricsContainer);
    } else if (currentUnsyncedLyrics) {
      isShowingSyncedLyrics = false;
      currentUnsyncedLyrics.forEach(({ text, transliteration }, idx) => {
        const p = document.createElement("p");
        p.setAttribute('data-lyrics-line-index', String(idx));
        p.textContent = convertText(text);
        p.style.margin = "0 0 6px 0";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
        p.style.color = "white";
        p.style.fontWeight = "400";
        p.style.filter = "blur(0.7px)";
        p.style.opacity = "0.8";
        if (transliteration) {
          p.setAttribute('data-transliteration-text', transliteration);
          hasTransliterationData = true;
        }
        lyricsContainer.appendChild(p);
      });
      lyricsContainer.style.overflowY = "auto";
      lyricsContainer.style.pointerEvents = "";
      lyricsContainer.classList.remove('hide-scrollbar');
      lyricsContainer.style.scrollbarWidth = "";
      lyricsContainer.style.msOverflowStyle = "";
    }

    // Reuse enterPipInLyricsContainer() instead of duplicating the
    // hide-children/show-notice logic inline — this also correctly hides the
    // synced-lyrics bottom spacer, which the old inline versions (before version 17.27) left visible.
    if (pipCurrentlyActive) {
      enterPipInLyricsContainer();
    }

    // Show/hide transliteration button
    const transliterationBtn = popup._transliterationToggleBtn;
    if (transliterationBtn) {
      transliterationBtn.style.display = hasTransliterationData ? "inline-flex" : "none";
    }

    if (transliterationEnabled && hasTransliterationData) {
      showTransliterationInPopupFor(lyricsContainer);
      if (transliterationBtn) {
        transliterationBtn.title = "Hide transliteration";
      }
    }

    // Show/hide download button
    if (downloadBtn) {
      if (lyricsContainer.querySelectorAll('p').length > 0) {
        downloadBtn.style.display = "inline-flex";
      } else {
        downloadBtn.style.display = "none";
        if (downloadDropdown) downloadDropdown.style.display = "none";
      }
    }

    return true;
  }

  // Top-level (scope-safe) versions - see NOTE (17.43) above createPopup()'s thin
  // wrappers of the same name. Take lyricsContainer as a parameter instead of
  // closing over it, so any function can call these regardless of where it's declared.
  function removeTransliterationLyricsFor(lyricsContainer) {
    if (!lyricsContainer) return;
    const transliterationEls = lyricsContainer.querySelectorAll('[data-transliteration="true"]');
    transliterationEls.forEach(el => {
      unhideElementWhilePipActive(lyricsContainer, el);
      el.remove();
    });
    transliterationPresent = false;
    // Transliteration is gone - if translation is still showing, it's now the only
    // sub-line, so restore it to full lyric size.
    lyricsContainer.querySelectorAll('[data-translated="true"]').forEach(el => {
      el.style.fontSize = '';
    });
  }

  function showTransliterationInPopupFor(lyricsContainer) {
    if (!lyricsContainer || transliterationPresent) return;
    const pEls = Array.from(lyricsContainer.querySelectorAll('p[data-transliteration-text]'));
    pEls.forEach((p) => {
      const transliterationText = p.getAttribute('data-transliteration-text');
      const transliterationDiv = document.createElement('div');
      transliterationDiv.textContent = transliterationText;
      // Use #9a9a9a (lighter gray than translation) for better distinction
      transliterationDiv.style.color = '#9a9a9a';
      transliterationDiv.style.fontSize = '0.85em'; // Slightly smaller
      transliterationDiv.style.marginTop = '2px';
      transliterationDiv.style.marginBottom = '8px';
      transliterationDiv.style.transition = "color 0.15s, filter 0.13s, opacity 0.13s";
      transliterationDiv.setAttribute('data-transliteration', 'true');

      // Always insert transliteration immediately after lyric line
      // If translation exists, insert before it; otherwise after lyric
      let insertionPoint = p.nextSibling;

      // Check if the next sibling is a translation div
      if (insertionPoint && insertionPoint.nodeType === 1 &&
          insertionPoint.getAttribute('data-translated') === 'true') {
        // Translation exists - insert transliteration before it
        p.parentNode.insertBefore(transliterationDiv, insertionPoint);
      } else {
        // No translation or next sibling is something else - insert after lyric
        p.parentNode.insertBefore(transliterationDiv, insertionPoint);
      }
      hideElementWhilePipActive(lyricsContainer, transliterationDiv);
    });
    transliterationPresent = true;
    // Transliteration just appeared - if translation is already showing, shrink it to
    // match, since both sub-lines are now present.
    lyricsContainer.querySelectorAll('[data-translated="true"]').forEach(el => {
      el.style.fontSize = '0.85em';
    });
  }

  async function updateLyricsContent(popup, info, cachedResult = null) {
    if (!info) return;
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (!lyricsContainer) return;
    currentLyricsContainer = lyricsContainer;
    currentSyncedLyrics = null;
    currentUnsyncedLyrics = null;
    // Reset translation state when loading new lyrics
    translationPresent = false;
    transliterationPresent = false;
    lastTranslatedLang = null;
    pipVideoDetachIfInContainer();
    setLyricsStatusMessage(lyricsContainer, "Loading lyrics...");

    const downloadBtn = popup.querySelector('button[title="Download lyrics"]');
    const downloadDropdown = downloadBtn ? downloadBtn._dropdown : null;
    const chineseConvBtn = popup._chineseConvBtn;

    const provider = Providers.getCurrent();
    let result;
    if (cachedResult !== null) {
      result = cachedResult;
    } else {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🎵 [Lyrics+] \n\nFetching lyrics from the manually selected provider.\nSynced lyrics are preferred.\nIf only unsynced lyrics are found, they will be displayed from the provider.`);
      result = await provider.findLyrics(info, 'synced');
    }

    // Check if track is marked as instrumental - convert to error
    if (result.instrumental) {
      console.log(`🎵 [Lyrics+] Track is instrumental (no lyrics) - detected by ${Providers.current}`);
      result.error = "♪ Instrumental Track ♪\n\nThis track has no lyrics";
      // Cache the instrumental status before proceeding to error handling
      cacheInstrumentalTrack(info.id, Providers.current, info);
      // Clear provider highlighting since instrumental means no lyrics from any source
      Providers.current = null;
      if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);
    }

    if (result.error) {
      setLyricsStatusMessage(lyricsContainer, result.error);
      if (downloadBtn) {
        downloadBtn.style.display = "none";
        console.info("📝 [Lyrics+ UI] Download button hidden (lyrics error)");
      }
      if (downloadDropdown) downloadDropdown.style.display = "none";
      if (chineseConvBtn) chineseConvBtn.style.display = "none";
      popup._updateHeaderScrollIndicator?.();
      return;
    }

    let synced = provider.getSynced(result);
    let unsynced = provider.getUnsynced(result);

    // Check if lyrics contain Chinese characters and detect script type
    const lyrics = synced || unsynced || [];
    const hasChineseLyrics = lyrics.some(line => line.text && Utils.containsHanCharacter(line.text));

    // Detect original Chinese script type from the lyrics
    if (hasChineseLyrics) {
      const allLyricsText = lyrics.map(line => line.text || '').join('');
      originalChineseScriptType = Utils.detectChineseScriptType(allLyricsText);
    } else {
      originalChineseScriptType = null;
    }

    // Show/hide Chinese conversion button - for both Traditional and Simplified Chinese lyrics
    // Now supports bidirectional conversion via opencc-js (t2cn and cn2t)
    if (chineseConvBtn) {
      if (hasChineseLyrics && originalChineseScriptType) {
        chineseConvBtn.style.display = "inline-flex";
        // Update button text to show conversion direction
        if (popup._updateChineseConvBtnText) {
          popup._updateChineseConvBtnText();
        }
      } else {
        chineseConvBtn.style.display = "none";
      }
    }
    popup._updateHeaderScrollIndicator?.();

    // Check if Chinese conversion is enabled
    const shouldConvertChinese = isChineseConversionEnabled();

    // Helper function to convert text if needed (bidirectional)
    const convertText = (text) => {
      if (shouldConvertChinese && text && Utils.containsHanCharacter(text)) {
        if (originalChineseScriptType === 'traditional') {
          return Utils.toSimplifiedChinese(text);
        } else {
          return Utils.toTraditionalChinese(text);
        }
      }
      return text;
    };

    pipVideoDetachIfInContainer();
    lyricsContainer.innerHTML = "";
    // Set globals for download
    currentSyncedLyrics = (synced && synced.length > 0) ? synced : null;
    currentUnsyncedLyrics = (unsynced && unsynced.length > 0) ? unsynced : null;

    const transliterationEnabled = localStorage.getItem(STORAGE_KEYS.TRANSLITERATION_ENABLED) === 'true';
    let hasTransliterationData = false;

    if (currentSyncedLyrics) {
      isShowingSyncedLyrics = true;
      currentLyricsStatusMessage = null;
      currentSyncedLyrics.forEach(({ text, transliteration }, idx) => {
        const p = document.createElement("p");
        p.setAttribute('data-lyrics-line-index', String(idx));
        p.textContent = convertText(text);
        p.style.margin = "0 0 6px 0";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
        if (transliteration) {
          p.setAttribute('data-transliteration-text', transliteration);
          hasTransliterationData = true;
        }
        lyricsContainer.appendChild(p);
      });
      highlightSyncedLyrics(currentSyncedLyrics, lyricsContainer);
    } else if (currentUnsyncedLyrics) {
      isShowingSyncedLyrics = false;
      currentLyricsStatusMessage = null;
      currentUnsyncedLyrics.forEach(({ text, transliteration }, idx) => {
        const p = document.createElement("p");
        p.setAttribute('data-lyrics-line-index', String(idx));
        p.textContent = convertText(text);
        p.style.margin = "0 0 6px 0";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
        p.style.color = "white";
        p.style.fontWeight = "400";
        p.style.filter = "blur(0.7px)";
        p.style.opacity = "0.8";
        if (transliteration) {
          p.setAttribute('data-transliteration-text', transliteration);
          hasTransliterationData = true;
        }
        lyricsContainer.appendChild(p);
      });
      // For unsynced, always allow user scroll
      lyricsContainer.style.overflowY = "auto";
      lyricsContainer.style.pointerEvents = "";
      lyricsContainer.classList.remove('hide-scrollbar');
      lyricsContainer.style.scrollbarWidth = "";
      lyricsContainer.style.msOverflowStyle = "";
    } else {
      isShowingSyncedLyrics = false;
      // Always allow user scroll for unsynced or empty
      lyricsContainer.style.overflowY = "auto";
      lyricsContainer.style.pointerEvents = "";
      lyricsContainer.classList.remove('hide-scrollbar');
      lyricsContainer.style.scrollbarWidth = "";
      lyricsContainer.style.msOverflowStyle = "";

      currentSyncedLyrics = null;
      currentUnsyncedLyrics = null;
      setLyricsStatusMessage(lyricsContainer, `No lyrics available from ${Providers.current}`);
    }

    if ((currentSyncedLyrics || currentUnsyncedLyrics) && (isPipActive || isPagePipActive)) enterPipInLyricsContainer();

   // Show/hide transliteration button based on data availability
    const transliterationBtn = popup._transliterationToggleBtn;
    if (transliterationBtn) {
      transliterationBtn.style.display = hasTransliterationData ? "inline-flex" : "none";
      console.info("📝 [Lyrics+ UI] Transliteration button visibility updated:", hasTransliterationData ? "SHOWN (transliteration data available)" : "HIDDEN (no transliteration data)");
    }
    popup._updateHeaderScrollIndicator?.();

    // Show transliteration if enabled and data is available
    if (transliterationEnabled && hasTransliterationData) {
      showTransliterationInPopupFor(lyricsContainer);
      if (transliterationBtn) {
        transliterationBtn.title = "Hide transliteration";
      }
    }

    // Show/hide download button appropriately - only use the variables already declared above!
    if (downloadBtn) {
      if (lyricsContainer.querySelectorAll('p').length > 0) {
        downloadBtn.style.display = "inline-flex";
        console.info("📝 [Lyrics+ UI] Download button shown (lyrics loaded successfully)");
      } else {
        downloadBtn.style.display = "none";
        console.info("📝 [Lyrics+ UI] Download button hidden (no lyrics to display)");
        if (downloadDropdown) downloadDropdown.style.display = "none";
      }
    }
    // downloadBtn lives in buttonGroup too, so its visibility can also affect
    // overflow - refresh again after it changes.
    popup._updateHeaderScrollIndicator?.();

    // Cache lyrics for future use (repeat one, recent songs)
    if (currentSyncedLyrics || currentUnsyncedLyrics) {
      LyricsCache.set(info.id, {
        provider: Providers.current,
        synced: currentSyncedLyrics,
        unsynced: currentUnsyncedLyrics,
        metadata: currentLyricsMetadata, // Store metadata (e.g., KPoe server info)
        trackInfo: {
          title: info.title,
          artist: info.artist,
          album: info.album,
          duration: info.duration
        }
      });
    }
  }

  // Change priority order of providers
  async function autodetectProviderAndLoad(popup, info, forceRefresh = false) {
    // Skip lyrics search for advertisements - when ad ends, real song will trigger new search
    if (isAdvertisement(info)) {
      console.log(`📢 [Lyrics+] Advertisement detected - skipping lyrics search`);
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RACE CONDITION PREVENTION: Search ID Tracking
    // ═══════════════════════════════════════════════════════════════════════════
    // For non-advertisement tracks, we use search ID tracking to handle
    // rapid song changes (e.g., skipping tracks, shuffle, autoplay).
    // ═══════════════════════════════════════════════════════════════════════════

    // Generate a unique search ID for this search request
    // Using both performance.now() and a counter for guaranteed uniqueness
    const searchId = `${info.id}_${performance.now()}_${++searchIdCounter}`;
    currentSearchId = searchId;

    // Helper function to check if this search is still current
    // Returns false if a newer search has superseded this one
    const isSearchStillCurrent = () => {
      if (currentSearchId !== searchId) {
        DEBUG.log('Autodetect', `Search aborted - newer search has started`);
        return false;
      }
      return true;
    };

    // Clear current provider so no provider is highlighted while searching for lyrics
    // This fixes the edge case where cached lyrics from the previous song left a provider
    // highlighted, and the next song's search would show that stale highlight
    Providers.current = null;
    if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cachedData = LyricsCache.get(info.id);
      if (cachedData) {
        // Handle cached instrumental tracks - display error message
        if (cachedData.instrumental && cachedData.error) {
          console.log(`🎵 [Lyrics+] Loaded instrumental track from cache - no lyrics available`);
          DEBUG.log('Autodetect', `Loaded instrumental from cache in <1ms`);

          // Clear provider highlighting
          Providers.current = null;
          if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

          // Display error message
          const lyricsContainer = popup.querySelector("#lyrics-plus-content");
          if (lyricsContainer) {
            setLyricsStatusMessage(lyricsContainer, cachedData.error);
          }

          // Hide buttons
          hideButtonsForInstrumental(popup);
          return;
        }

        const success = loadLyricsFromCache(popup, info, cachedData);
        if (success) {
          console.log(`⚡ [Lyrics+] Lyrics loaded instantly from cache (no internet needed!)`);
          DEBUG.log('Autodetect', `Loaded from cache in <1ms using ${cachedData.provider}`);
          return;
        }
      }
    }

    console.log(`🔍 [Lyrics+] Searching for lyrics: "${info.title}" by ${info.artist}`);
    DEBUG.log('Autodetect', 'Starting provider autodetect', info);
    const startTime = performance.now();

    const mainProviders = ["LRCLIB", "Spotify", "KPoe", "Musixmatch"];
    const sessionResults = []; // { name, result } - stores providers that returned unsynced lyrics (but not synced) for phase 2 fallback

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎵 [Lyrics+] \n\nFetching lyrics from providers LRCLIB, Spotify, KPoe and Musixmatch.\nSynced lyrics are preferred.\nIf a provider only finds unsynced lyrics, they will be stored in the autodetect logic's memory.\nIf no synced lyrics are found on any provider, unsynced lyrics will be cached from the highest-priority provider that returned them.\nIf no lyrics were found at all, Genius provider (unsynced lyrics only) will be tried.`);

    for (const name of mainProviders) {
      try {
        const providerStartTime = performance.now();
        DEBUG.provider.start(name, 'getSynced', info);

        const provider = Providers.map[name];
        const result = await provider.findLyrics(info, 'synced');

        // ═══ CHECKPOINT 1: After async provider call ═══
        // While waiting for the provider API response, a new song may have started.
        // Check if we're still the current search. If not, abort to prevent
        // outdated results from continuing to search and potentially overwriting UI.
        if (!isSearchStillCurrent()) return;

        const providerDuration = performance.now() - providerStartTime;

        if (result && !result.error) {
          // Check if track is marked as instrumental by the provider
          // Instrumental tracks have no lyrics, so we should stop searching and cache this result
          if (result.instrumental) {
            if (!isSearchStillCurrent()) return;

            console.log(`🎵 [Lyrics+] Track is instrumental (no lyrics) - detected by ${name}`);
            DEBUG.log('Autodetect', `Track marked as instrumental by ${name}`);

            // Convert instrumental to an error result
            result.error = "♪ Instrumental Track ♪\n\nThis track has no lyrics";

            // Hide buttons and cache the instrumental status
            hideButtonsForInstrumental(popup);
            cacheInstrumentalTrack(info.id, name, info);

            // Don't highlight any provider since instrumental means no lyrics from any source
            Providers.current = null;
            if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

            // Display error message through the standard error path
            const lyricsContainer = popup.querySelector("#lyrics-plus-content");
            if (lyricsContainer) {
              setLyricsStatusMessage(lyricsContainer, result.error);
            }

            const totalDuration = performance.now() - startTime;
            DEBUG.log('Autodetect', `Completed in ${totalDuration.toFixed(2)}ms - instrumental track detected by ${name}`);
            return;
          }

          const synced = provider.getSynced(result);
          if (synced && synced.length > 0) {
            // ═══ CHECKPOINT 2: Before UI update with lyrics ═══
            // Found lyrics! But before updating UI, verify we're STILL current.
            // This prevents: Old search finds lyrics after new search already updated UI.
            if (!isSearchStillCurrent()) return;

            DEBUG.provider.success(name, 'getSynced', 'synced', synced.length);
            DEBUG.provider.timing(name, 'getSynced', providerDuration.toFixed(2));

            // Store metadata if available (e.g., KPoe server info)
            currentLyricsMetadata = result?.metadata || null;

            Providers.setCurrent(name);
            if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
            await updateLyricsContent(popup, info, result);

            const totalDuration = performance.now() - startTime;
            DEBUG.log('Autodetect', `Completed successfully in ${totalDuration.toFixed(2)}ms using ${name}`);
            return;
          }

          // No synced lyrics - check for unsynced to store for phase 2 fallback
          const unsynced = provider.getUnsynced(result);
          if (unsynced && unsynced.length > 0) {
            DEBUG.debug('Provider', `${name} returned unsynced lyrics only, stored for phase 2`);
            sessionResults.push({ name, result });
          } else {
            DEBUG.debug('Provider', `${name} getSynced returned empty lyrics`);
          }
        } else {
          DEBUG.provider.failure(name, 'getSynced', result?.error || 'No result');
        }

        DEBUG.provider.timing(name, 'getSynced', providerDuration.toFixed(2));
      } catch (error) {
        // If a provider fails for any reason, continue looking for lyrics in other providers
        // Without this try-catch, an error would skip the remaining providers and stop the loop.
        DEBUG.provider.failure(name, 'getSynced', error);
      }
    }

    // ═══ CHECKPOINT: Before phase 2 ═══
    if (!isSearchStillCurrent()) return;

    // Check stored results from phase 1 (highest-priority provider first)
    for (const { name, result } of sessionResults) {
      if (!isSearchStillCurrent()) return;

      const provider = Providers.map[name];
      const unsynced = provider.getUnsynced(result);
      if (unsynced && unsynced.length > 0) {
        DEBUG.provider.success(name, 'getUnsynced', 'unsynced', unsynced.length);
        // No separate timing to log - this result was already fetched during phase 1

        // Store metadata if available (e.g., KPoe server info)
        currentLyricsMetadata = result?.metadata || null;

        Providers.setCurrent(name);
        if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
        await updateLyricsContent(popup, info, result);

        const totalDuration = performance.now() - startTime;
        DEBUG.log('Autodetect', `Completed successfully in ${totalDuration.toFixed(2)}ms using ${name}`);
        return;
      }
    }

    // No unsynced from main providers - try Genius (unsynced only, unchanged)
    try {
      const providerStartTime = performance.now();
      DEBUG.provider.start('Genius', 'getUnsynced', info);

      const provider = Providers.map['Genius'];
      const result = await provider.findLyrics(info, 'unsynced');

      // ═══ CHECKPOINT 1: After async provider call ═══
      if (!isSearchStillCurrent()) return;

      const providerDuration = performance.now() - providerStartTime;

      if (result && !result.error) {
        const unsynced = provider.getUnsynced(result);
        if (unsynced && unsynced.length > 0) {
          // ═══ CHECKPOINT 2: Before UI update with lyrics ═══
          if (!isSearchStillCurrent()) return;

          DEBUG.provider.success('Genius', 'getUnsynced', 'unsynced', unsynced.length);
          DEBUG.provider.timing('Genius', 'getUnsynced', providerDuration.toFixed(2));

          currentLyricsMetadata = result?.metadata || null;

          Providers.setCurrent('Genius');
          if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
          await updateLyricsContent(popup, info, result);

          const totalDuration = performance.now() - startTime;
          DEBUG.log('Autodetect', `Completed successfully in ${totalDuration.toFixed(2)}ms using Genius`);
          return;
        } else {
          DEBUG.debug('Provider', `Genius getUnsynced returned empty lyrics`);
        }
      } else {
        DEBUG.provider.failure('Genius', 'getUnsynced', result?.error || 'No result');
      }

      DEBUG.provider.timing('Genius', 'getUnsynced', providerDuration.toFixed(2));
    } catch (error) {
      // If a provider fails for any reason, continue to "no lyrics found"
      DEBUG.provider.failure('Genius', 'getUnsynced', error);
    }

    // ═══ CHECKPOINT 3: Before "No lyrics found" message ═══
    // Checked all providers, no lyrics found. Before showing error message,
    // verify we're still current. This is CRITICAL for the advertisement scenario:
    // - Song search finds nothing after checking all providers
    // - But advertisement already started and found lyrics
    // - Without this check, song search would overwrite ad lyrics with "No lyrics found"
    // With this check: Song search aborts, ad lyrics remain on screen ✓
    if (!isSearchStillCurrent()) return;

    // Unselect any provider
    Providers.current = null;
    if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    currentSyncedLyrics = null;
    currentUnsyncedLyrics = null;
    if (lyricsContainer) setLyricsStatusMessage(lyricsContainer, "No lyrics found from any provider");
    currentLyricsContainer = lyricsContainer;
    // Reset translation state when no lyrics are found
    translationPresent = false;
    transliterationPresent = false;
    lastTranslatedLang = null;

    const totalDuration = performance.now() - startTime;
    DEBUG.warn('Autodetect', `No lyrics found after checking all providers (${totalDuration.toFixed(2)}ms)`);
  }

  function startPollingForTrackChange(popup) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      const info = getCurrentTrackInfo();
      if (!info) return;

      // Get current playback position
      const posEl = document.querySelector('[data-testid="playback-position"]');
      const currentPosition = posEl ? timeStringToMs(posEl.textContent) : 0;

      // Detect song restart (for repeat one): same track ID but position reset to near 0
      // This happens when repeat one is enabled and song ends
      const RESTART_THRESHOLD_MS = 5000; // If position jumps from >5s to <5s, it's a restart
      const isRestart = (
        info.id === currentTrackId &&
        lastPlaybackPosition > RESTART_THRESHOLD_MS &&
        currentPosition < RESTART_THRESHOLD_MS
      );

      if (isRestart) {
        console.log(`🔁 [Lyrics+] Song restarted! Repeat One detected for "${info.title}"`);
        console.log(`   ⏮️ Resetting lyrics scroll to the beginning...`);
        DEBUG.info('Track', `Song restarted (repeat one): ${info.title} - Position: ${lastPlaybackPosition}ms → ${currentPosition}ms`);

        // For repeat one, just reset scroll to beginning (lyrics already cached)
        if (currentLyricsContainer && isShowingSyncedLyrics) {
          const firstLine = currentLyricsContainer.querySelector('p');
          if (firstLine) {
            firstLine.scrollIntoView({ behavior: "smooth", block: "center" });
            console.log(`   ✅ Lyrics scrolled back to start (cached lyrics, no loading needed!)`);
            DEBUG.debug('Track', 'Scroll reset to beginning for repeat one');
          }
        }
      }

      // Track changed to a different song
      if (info.id !== currentTrackId) {
        DEBUG.track.changed(currentTrackId, info.id, info);
        currentTrackId = info.id;
        lastPlaybackPosition = 0;
        lastTrackDuration = info.duration || 0;
        // Clear the previous track's lyrics so the PiP canvas doesn't keep showing
        // stale lines during the gap before the new track's lyrics arrive. (NEW in 17.29)
        currentSyncedLyrics = null;
        currentUnsyncedLyrics = null;
        const lyricsContainer = popup.querySelector("#lyrics-plus-content");
        if (lyricsContainer) {
          pipVideoDetachIfInContainer();
          setLyricsStatusMessage(lyricsContainer, "Loading lyrics...");
        }
        autodetectProviderAndLoad(popup, info);
      }

      // Update last position for next iteration
      lastPlaybackPosition = currentPosition;

      // Update all button states using DOM-cloned icons from Spotify's visible buttons
      if (popup && popup._playPauseBtn) {
        updatePlayPauseButton(popup._playPauseBtn.button, popup._playPauseBtn.iconWrapper);
      }
      if (popup && popup._shuffleBtn) {
        updateShuffleButton(popup._shuffleBtn.button, popup._shuffleBtn.iconWrapper);
      }
      if (popup && popup._repeatBtn) {
        updateRepeatButton(popup._repeatBtn.button, popup._repeatBtn.iconWrapper);
      }
      // Update prev/next button icons from Spotify's DOM
      if (popup && popup._prevBtn) {
        updatePreviousButtonIcon(popup._prevBtn.iconWrapper);
      }
      if (popup && popup._nextBtn) {
        updateNextButtonIcon(popup._nextBtn.iconWrapper);
      }
    }, TIMING.POLLING_INTERVAL_MS);
  }

  function stopPollingForTrackChange() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // Guards so a MutationObserver storm can't spawn overlapping retry chains
  // or keep re-attempting once the button is already in the DOM.
  let lyricsButtonInjected = false;
  let lyricsButtonInjectionInFlight = false;

  function addButton(maxRetries = LIMITS.BUTTON_ADD_MAX_RETRIES) {
    // Already there - nothing to do (cheap check, no logging/spam).
    if (document.getElementById("lyrics-plus-btn")) {
      lyricsButtonInjected = true;
      return;
    }
    lyricsButtonInjected = false;

    // Don't start a second overlapping retry chain while one is in flight.
    if (lyricsButtonInjectionInFlight) return;

    const micBtn = document.querySelector('[data-testid="lyrics-button"]');

    // The mic/lyrics button (and the rest of the full player controls) only
    // mounts once the user actually plays something. Until then, just bail
    // silently instead of spinning up a retry loop - the observer below will
    // call addButton() again on the next relevant DOM change.
    if (!micBtn) {
      return;
    }

    lyricsButtonInjectionInFlight = true;
    let attempts = 0;
    const tryAdd = () => {
      const controls = micBtn?.parentElement;
      if (!controls) {
        if (attempts < maxRetries) {
          attempts++;
          DEBUG.debug('Button', `Injection attempt ${attempts}/${maxRetries} - controls not found, retrying...`);
          setTimeout(tryAdd, TIMING.BUTTON_ADD_RETRY_MS);
        } else {
          DEBUG.error('Button', `Failed to inject Lyrics+ button after ${maxRetries} attempts`);
          lyricsButtonInjectionInFlight = false;
        }
        return;
      }
      if (document.getElementById("lyrics-plus-btn")) {
        lyricsButtonInjected = true;
        lyricsButtonInjectionInFlight = false;
        return;
      }
      const btn = document.createElement("button");
      btn.id = "lyrics-plus-btn";
      btn.title = "Show Lyrics+";
      btn.textContent = "Lyrics+";
      DEBUG.info('Button', 'Lyrics+ button injected successfully');
      Object.assign(btn.style, {
        backgroundColor: "#1aa34a",
        border: "none",
        borderRadius: "20px",
        color: "#e0e0e0",
        fontWeight: "600",
        fontSize: "14px",
        padding: "6px 12px",
        marginLeft: "8px",
        userSelect: "none",
        cursor: "pointer",
      });
      btn.onclick = () => {
        let popup = document.getElementById("lyrics-plus-popup");
        if (popup) {
          removePopup();
          stopPollingForTrackChange();
          return;
        }
        createPopup();
      };
      controls.insertBefore(btn, micBtn);
      lyricsButtonInjected = true;
      lyricsButtonInjectionInFlight = false;
    };
    tryAdd();
  }

  // Global observer to inject Lyrics+ button once the full player UI (and its
  // mic/lyrics button) mounts - which normally only happens once the user
  // starts playing something. addButton() itself now no-ops immediately if
  // the button already exists or the mic button isn't mounted yet, so this
  // firing on unrelated DOM churn is cheap and won't spam retries/console.
  const buttonInjectionObserver = new MutationObserver(() => {
    if (lyricsButtonInjected) return;
    addButton();
  });
  ResourceManager.registerObserver(buttonInjectionObserver, 'Global button injection (document.body)');
  buttonInjectionObserver.observe(document.body, { childList: true, subtree: true });

  function init() {
    // Apply AMOLED theme if enabled in localStorage
    let savedTheme = localStorage.getItem('lyricsPlusTheme');
    if (savedTheme === null) savedTheme = false;
    else savedTheme = JSON.parse(savedTheme);

    if (savedTheme) {
      document.body.classList.add('lyrics-plus-amoled-theme');
      console.info("🎨 [Lyrics+ Init] AMOLED theme applied on page load");
    } else {
      console.info("🎨 [Lyrics+ Init] Default theme active (AMOLED disabled)");
    }

    addButton();
  }

  const appRoot = document.querySelector('#main');
  if (appRoot) {
    const pageObserver = new MutationObserver(() => {
      if (lyricsButtonInjected) return;
      addButton();
    });
    ResourceManager.registerObserver(pageObserver, 'Page observer (appRoot)');
    pageObserver.observe(appRoot, { childList: true, subtree: true });
  }

  // ------------------------
  // Popup Auto-Resize Setup
  // ------------------------
  // The popup will always keep the same proportion of the window as last set by the user.

  // Try to load last saved proportion from localStorage
  function loadProportion() {
    try {
      const stored = JSON.parse(localStorage.getItem("lyricsPlusPopupProportion") || "{}");
      if (stored.w && stored.h) {
        window.lastProportion = stored;
      }
    } catch {}
  }
  loadProportion();

  function applyProportionToPopup(popup) {
    if (window.lyricsPlusPopupIsResizing || window.lyricsPlusPopupIgnoreProportion || window.lyricsPlusPopupIsDragging) {
      return;
    }
    // Skip applying proportion if user has dragged the popup recently
    if (window.lyricsPlusPopupLastDragged && (Date.now() - window.lyricsPlusPopupLastDragged) < TIMING.DRAG_DEBOUNCE_MS) {
      return;
    }
    if (!popup || !window.lastProportion.w || !window.lastProportion.h || window.lastProportion.x === undefined || window.lastProportion.y === undefined) {
      return;
    }
    popup.style.width = (window.innerWidth * window.lastProportion.w) + "px";
    popup.style.height = (window.innerHeight * window.lastProportion.h) + "px";
    popup.style.left = (window.innerWidth * window.lastProportion.x) + "px";
    popup.style.top = (window.innerHeight * window.lastProportion.y) + "px";
    popup.style.right = "auto";
    popup.style.bottom = "auto";
    popup.style.position = "fixed";
  }

  function savePopupState(el) {
    const rect = el.getBoundingClientRect();
    window.lastProportion = {
      w: rect.width / window.innerWidth,
      h: rect.height / window.innerHeight,
      x: rect.left / window.innerWidth,
      y: rect.top / window.innerHeight
    };
    localStorage.setItem('lyricsPlusPopupProportion', JSON.stringify(window.lastProportion));
  }

  // Call this after user resizes the popup:
  function observePopupResize() {
    const popup = document.getElementById("lyrics-plus-popup");
    if (!popup) return;
    // Guard: skip if resize handlers are already attached to this popup instance
    if (popup._resizeMouseupHandler) return;
    let isResizing = false;
    const resizer = Array.from(popup.children).find(el =>
      el.style && el.style.cursor === "nwse-resize"
    );
    if (!resizer) return;

    const mousedownHandler = () => { isResizing = true; };
    const mouseupHandler = () => {
      if (isResizing) {
        savePopupState(popup);
      }
      isResizing = false;
    };

    resizer.addEventListener("mousedown", mousedownHandler);
    // Store handler on popup for cleanup
    popup._resizeMouseupHandler = mouseupHandler;
    window.addEventListener("mouseup", mouseupHandler);

    DEBUG.debug('PopupResize', 'Resize handlers attached');
  }

  // Listen for popup creation to hook the resizer.
  // IMPORTANT: this used to run on *every* childList mutation anywhere in
  // document.body's subtree - which in a React SPA like Spotify (plus our own
  // frequent icon/lyrics DOM updates) fires continuously, many times a second.
  // Each firing unconditionally called applyProportionToPopup(), re-forcing the
  // popup back to window.lastProportion's saved size/position. The isResizing/
  // isDragging guards only cover the exact moment of an active drag, so the very
  // next unrelated mutation right after you let go of a manual resize (or right
  // after clicking restore) would snap the popup back to whatever proportion was
  // saved *before* that action - looking exactly like "it auto-resizes back."
  // Fix: only reapply the proportion when the popup element itself is actually
  // being inserted into the DOM (real creation/recreation), not on unrelated
  // page churn.
  const popupResizeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const inserted = node.id === 'lyrics-plus-popup'
          ? node
          : (node.querySelector && node.querySelector('#lyrics-plus-popup'));
        if (inserted) {
          applyProportionToPopup(inserted);
          observePopupResize();
          return;
        }
      }
    }
  });
  ResourceManager.registerObserver(popupResizeObserver, 'Popup resize observer');
  popupResizeObserver.observe(document.body, { childList: true, subtree: true });

  // On window resize, apply saved proportion
  const windowResizeHandler = () => {
    const popup = document.getElementById("lyrics-plus-popup");
    if (popup) {
      applyProportionToPopup(popup);
    }
  };
  ResourceManager.registerWindowListener("resize", windowResizeHandler, 'Popup proportion on window resize');

  // Register menu commands for debug functions
  GM_registerMenuCommand('Debug: Clear Cache', () => {
    const stats = LyricsCache.getStats();
    const confirmMsg = `Clear lyrics cache?\n\nCurrent cache: ${stats.size} songs (${stats.totalKB} KB of ${stats.maxKB} KB)\n\nThis will remove all cached lyrics and they will need to be fetched again.`;

    if (confirm(confirmMsg)) {
      LyricsCache.clear();
      alert(`✅ Cache cleared successfully!\n\nAll ${stats.size} cached songs have been removed.`);
    }
  });

  GM_registerMenuCommand('Debug: Get Cache Stats', () => {
    const stats = LyricsCache.getStats();
    console.log('%c[Lyrics+] Cache Statistics:', 'color: #64B5F6; font-weight: bold;', stats);
    console.log(`  Cache size: ${stats.size}/${stats.maxEntries} songs`);
    if (stats.entries.length > 0) {
      const tableData = {};
      stats.entries.forEach((entry, i) => { tableData[i + 1] = entry; });
      console.table(tableData);
    }
    alert(
    'Cache statistics have been logged to the console.\n' +
    'Open DevTools (Press F12 or Right click and Inspect), then select the Logs tab under Console to view it.'
  );
});

  GM_registerMenuCommand('Debug: Get Track Info', () => {
    const info = getCurrentTrackInfo();
    console.log('%c[Lyrics+] Current Track Info:', 'color: #64B5F6; font-weight: bold;', info);
     alert(
    'Track information has been logged to the console.\n' +
    'Open DevTools (Press F12 or Right click and Inspect), then select the Logs tab under Console to view it.'
  );
});

  GM_registerMenuCommand('Debug: Get Repeat State', () => {
    const state = getRepeatState();
    console.log('%c[Lyrics+] Repeat State:', 'color: #64B5F6; font-weight: bold;', state);
    alert(
    'Repeat state has been logged to the console.\n' +
    'Open DevTools (Press F12 or Right click and Inspect), then select the Logs tab under Console to view it.'
  );
});

  init();
})();
