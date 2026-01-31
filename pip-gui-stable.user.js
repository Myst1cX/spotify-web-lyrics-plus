// ==UserScript==
// @name         Spotify Lyrics+ Stable
// @namespace    https://github.com/Myst1cX/spotify-web-lyrics-plus
// @version      15.3.test
// @description  Display synced and unsynced lyrics from multiple sources (LRCLIB, Spotify, KPoe, Musixmatch, Genius) in a floating popup on Spotify Web. Both formats are downloadable. Optionally toggle a line by line lyrics translation. Lyrics window can be expanded to include playback and seek controls.
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @connect      genius.com
// @require      https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js
// ==/UserScript==


// RESOLVED (15.3): UPDATED TRANSLITERATION FUNCTIONS

// RESOLVED (15.2): ADDED TRANSLITERATION BUTTON AND FUNCTIONS
// Only shows up on KPoe provider, when the scraped lyrics contain transliteration

// RESOLVED (15.1): FIXED THE KPOE PROVIDER (I HOPE)
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

// WHEN THE TIME IS RIGHT:
// Improve google translation, currently only translates line by line (tho it outputs all lines instantly, line by line causes lack of content awareness = lower quality translation)
// Lol spotify ad getting detected as track in console. Maybe do something to block them. Also refresh Spotifuck userscript adblock method.
// • Object { id: "Spotify-Advertisement", title: "Spotify", artist: "Advertisement", album: "", duration: 26000, uri: "", trackId: null }

// CONSIDER CONVERTING TO BROWSER EXTENSION:
// Converting the userscript into a browser extension would unlock two things:
// 1. Possibilitate having a floating popup ui with spotify lyrics (always on top) that works on other sites too, outside open.spotify.com
// 2. Auto fetch spotify token for user when it expires and apply it --> tried, CSP prevents it. (plan was: maybe for Musixmatch too if user logged in inside browser)

// PROBABLY NOT:
// Add Deezer provider (synced and unsynced)
// deezer.js with api link > https://github.com/bertigert/Deezer-Lyrics-Sync/blob/main/lyrics_sync.user.js
// Fix and uncomment Netease provider; api implementation example: https://github.com/Natoune/SpotifyMobileLyricsAPI/blob/main/src%2Ffetchers.ts

(function () {
  'use strict';

  // ------------------------
  // State Variables
  // ------------------------

  let highlightTimer = null;
  let pollingInterval = null;
  let progressInterval = null; // <-- NEW: interval for progress bar updates
  let currentTrackId = null;
  let currentSyncedLyrics = null;
  let currentUnsyncedLyrics = null;
  let currentLyricsContainer = null;
  let lastTranslatedLang = null;
  let translationPresent = false;
  let isTranslating = false;
  let transliterationPresent = false;
  let isShowingSyncedLyrics = false;
  let originalChineseScriptType = null; // 'traditional', 'simplified', or null

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
  };

  // ------------------------
  // Debug Logging Infrastructure
  // ------------------------
  const DEBUG = {
    enabled: false, // Set to false to disable all debug logging

    // Log levels with prefixes
    error: (context, ...args) => {
      if (DEBUG.enabled) console.error(`[Lyrics+ ERROR] [${context}]`, ...args);
    },
    warn: (context, ...args) => {
      if (DEBUG.enabled) console.warn(`[Lyrics+ WARN] [${context}]`, ...args);
    },
    info: (context, ...args) => {
      if (DEBUG.enabled) console.info(`[Lyrics+ INFO] [${context}]`, ...args);
    },
    debug: (context, ...args) => {
      if (DEBUG.enabled) console.debug(`[Lyrics+ DEBUG] [${context}]`, ...args);
    },

    // Specialized logging helpers
    provider: {
      start: (providerName, operation, trackInfo) => {
        DEBUG.debug('Provider', `Starting ${operation} for ${providerName}:`, {
          track: trackInfo.title,
          artist: trackInfo.artist,
          album: trackInfo.album
        });
      },
      success: (providerName, operation, lyricsType, lineCount) => {
        DEBUG.info('Provider', `✓ ${providerName} ${operation} succeeded:`, {
          type: lyricsType,
          lines: lineCount
        });
      },
      failure: (providerName, operation, error) => {
        DEBUG.warn('Provider', `✗ ${providerName} ${operation} failed:`, error);
      },
      timing: (providerName, operation, durationMs) => {
        DEBUG.debug('Provider', `⏱ ${providerName} ${operation} took ${durationMs}ms`);
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
        DEBUG.info('Track', `Track changed: ${oldId || 'none'} → ${newId}`, trackInfo);
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

  /* NowPlayingView logic: Collapsing the `.zjCIcN96KsMfWwRo` parent container to zero width is sufficient to hide the entire NowPlayingView panel.
      The container is forced to `width: 0`, `min-width: 0`, `max-width: 0`, and `flex-basis: 0` so that it collapses entirely,
      allowing the rest of the UI to expand and fill the area, eliminating the black gap.
      The NowPlayingView and its DOM structure remain fully accessible to JavaScript for track information and lyrics fetching (ProviderSpotify needs it).
  */

  const styleId = 'lyricsplus-hide-npv-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
          .a_fKt7xvd8od_kEb, /* I kept the parent of .zjCIcN96KsMfWwRo, just in case */
          .zjCIcN96KsMfWwRo { /* The NowPlayingView panel, which includes the new side NPV button */
              width: 0 !important;
              min-width: 0 !important;
              max-width: 0 !important;
              flex-basis: 0 !important;
              overflow: hidden !important;
          }

          /*  --- The side NPV button (not needed because it's already hidden by .zjCIcN96KsMfWwRo)

          .wJiY1vDfuci2a4db {
              display: none !important;
          }

          */

      `;
    document.head.appendChild(style);
  }


  /*
  --- NOTE: Keeping the old version here as backup incase Spotify reverts the new NPV update.

  --- Forcibly hide NowPlayingView and its button in the playback controls menu
  --- To obtain the trackId and fetch lyrics from the SpotifyProvider, the userscript uses specific selectors that are only present in the DOM while the NowPlayingView is open.
      This CSS method hides the NowPlayingView from the user interface in a way that allows the rest of the Spotify home UI to seamlessly fill the space it would otherwise
      occupy, without leaving a black area present. Crucially, it keeps the NowPlayingView and its DOM structure present and accessible to JavaScript (so scripts can still read
      track info), but makes it invisible and non-interactive to the user.
  --- The `.NowPlayingView` element is made invisible by setting `opacity: 0` and `pointer-events: none`, but remains in the DOM for selector access.
      It is positioned absolutely and given a negative z-index, so it does not participate in the normal document flow or block other content.
      Its flex value is set to `0 0 0%` to ensure it does not reserve any space in the parent flex container.
      The immediate parents (`.a_fKt7xvd8od_kEb` and `.zjCIcN96KsMfWwRo`) are forced to `width: 0`, `min-width: 0`,
      `max-width: 0`, and `flex-basis: 0` so that they collapse entirely, allowing the rest of the UI to expand and fill the area, eliminating the black gap.
      The "Show Now Playing view" button (`.wJiY1vDfuci2a4db`) and the old NPV button in the playback controls (`[data-testid=control-button-npv]`) are hidden from the UI.

      const styleId = 'lyricsplus-hide-npv-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
              .NowPlayingView {
                  position: absolute !important;
                  left: 0; top: 0;
                  width: 100% !important;
                  height: 100% !important;
                  opacity: 0 !important;
                  pointer-events: none !important;
                  z-index: -1 !important;
                  flex: 0 0 0% !important;
              }
              .oXO9_yYs6JyOwkBn8E4a {
                  width: 0 !important;
                  min-width: 0 !important;
                  max-width: 0 !important;
                  flex-basis: 0 !important;
                  overflow: hidden !important;
              }
              [data-testid=control-button-npv] {
                  display: none !important;
              }
          `;
        document.head.appendChild(style);
      }

  */

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
        // If neither changes, characters are common to both - assume simplified
        else {
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
          openccT2CN = converter; // Cache for future use
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
          openccCN2T = converter; // Cache for future use
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

  // ------------------------
  // Utility Functions
  // ------------------------

  function getCurrentTrackId() {
    const contextLink = document.querySelector('a[data-testid="context-link"][data-context-item-type="track"][href*="uri=spotify%3Atrack%3A"]');
    if (contextLink) {
      const href = contextLink.getAttribute('href');
      const match = decodeURIComponent(href).match(/spotify:track:([a-zA-Z0-9]{22})/);
      if (match) {
        DEBUG.debug('Track', `Track ID extracted: ${match[1]}`);
        return match[1];
      }
    }
    DEBUG.dom.notFound('a[data-testid="context-link"]...', 'getCurrentTrackId');
    return null;
  }

  function getCurrentTrackInfo() {
    const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
    const durationEl = document.querySelector('[data-testid="playback-duration"]');
    const positionEl = document.querySelector('[data-testid="playback-position"]');
    const trackId = getCurrentTrackId();

    if (!titleEl || !artistEl) {
      DEBUG.dom.notFound(!titleEl ? 'context-item-info-title' : 'context-item-info-subtitles', 'getCurrentTrackInfo');
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

    // Fallback: try audio element duration
    if (duration <= 0) {
      const audio = document.querySelector('audio');
      if (audio && !isNaN(audio.duration) && audio.duration > 0) {
        duration = audio.duration * 1000;
        DEBUG.debug('Track', 'Duration obtained from audio element');
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

    DEBUG.track.detected(trackInfo);
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

    // Fallback: use <audio> element if available
    const audio = document.querySelector('audio');
    if (audio) return !audio.paused;

    // Default: assume not playing
    return false;
  }

  function highlightSyncedLyrics(lyrics, container) {
    if (!lyrics || lyrics.length === 0) return;
    const pElements = [...container.querySelectorAll("p")];
    if (pElements.length === 0) return;
    if (highlightTimer) {
      clearInterval(highlightTimer);
      highlightTimer = null;
    }
    highlightTimer = setInterval(() => {
      // Skip all style/size changes while popup is being resized
      if (window.lyricsPlusPopupIsResizing) return;

      const posEl = document.querySelector('[data-testid="playback-position"]');
      const isPlaying = isSpotifyPlaying();

      if (isShowingSyncedLyrics) {
        if (isPlaying) {
          container.style.overflowY = "auto";
          container.style.pointerEvents = "none";
          container.style.scrollbarWidth = "none"; // Firefox
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
      if (activeIndex === -1) {
        pElements.forEach(p => {
          p.style.color = "white";
          p.style.fontWeight = "400";
          p.style.filter = "blur(0.7px)";
          p.style.opacity = "0.8";
          p.style.transform = "scale(1.0)";
          p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";

          // Reset transliteration line if present
          const nextEl = p.nextElementSibling;
          if (nextEl && nextEl.getAttribute('data-transliteration') === 'true') {
            nextEl.style.color = "#9a9a9a";
            nextEl.style.fontWeight = "400";
            nextEl.style.filter = "blur(0.7px)";
            nextEl.style.opacity = "0.8";
          }
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

          // Highlight transliteration line with same green as highlighted lyric
          const nextEl = p.nextElementSibling;
          if (nextEl && nextEl.getAttribute('data-transliteration') === 'true') {
            nextEl.style.color = "#1db954";  // Same green as highlighted lyric
            nextEl.style.fontWeight = "700";  // Bold like highlighted lyric
            nextEl.style.filter = "none";
            nextEl.style.opacity = "1";
          }
        } else {
          p.style.color = "white";
          p.style.fontWeight = "400";
          p.style.filter = "blur(0.7px)";
          p.style.opacity = "0.8";
          p.style.transform = "scale(1.0)";
          p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";

          // Reset transliteration line if present
          const nextEl = p.nextElementSibling;
          if (nextEl && nextEl.getAttribute('data-transliteration') === 'true') {
            nextEl.style.color = "#9a9a9a";
            nextEl.style.fontWeight = "400";
            nextEl.style.filter = "blur(0.7px)";
            nextEl.style.opacity = "0.8";
          }
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
        btn.style.backgroundColor = (btn.textContent === Providers.current) ? "#1db954" : "#333";
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
    // Normalize size for consistent display in our popup
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
      if (btn.offsetParent === null) return false; // Skip invisible buttons
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

  // --- Global Button Update Functions ---
  function getShuffleState() {
    // Use the new button-based detection (language-independent)
    const shuffleBtn = findSpotifyShuffleButton();
    return getShuffleStateFromButton(shuffleBtn);
  }

  function getRepeatState() {
    // Use the new button-based detection (language-independent)
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

  // --- LRCLIB ---
  async function fetchLRCLibLyrics(songInfo, tryWithoutAlbum = false) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[LRCLIB Debug] Starting lyrics search");
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
      headers: {
        // This header is okay to send — doesn’t break anything
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
    async findLyrics(info) {
      try {
        let data = await fetchLRCLibLyrics(info, false);
        if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
          data = await fetchLRCLibLyrics(info, true); // try without album
        }
        if (!data) return { error: "Track not found in LRCLIB database or no lyrics available" };
        return data;
      } catch (e) {
        return { error: e.message || "LRCLIB request failed - network error or service unavailable" };
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
  async function fetchKPoeLyrics(songInfo, sourceOrder = '', forceReload = false) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[KPoe Debug] Starting lyrics search");
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
    let forceReloadParam = forceReload ? `&forceReload=true` : '';
    let fetchOptions = {};
    if (forceReload) {
      fetchOptions = { cache: 'no-store' };
      forceReloadParam = `&forceReload=true`;
      console.log("[KPoe Debug] Force reload enabled (bypassing cache)");
    }

    const url = `https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?title=${encodeURIComponent(songInfo.title)}&artist=${encodeURIComponent(songInfo.artist)}${albumParam}&duration=${songInfo.duration}${sourceParam}${forceReloadParam}`;
    console.log("[KPoe Debug] Request URL:", url);

    try {
      const response = await fetch(url, fetchOptions);
      console.log(`[KPoe Debug] Response status: ${response.status} ${response.statusText}`);

      // Check if response is ok before parsing
      if (!response.ok) {
        if (response.status === 404) {
          console.log("[KPoe Debug] ✗ Track not found in KPoe database");
        } else if (response.status === 429) {
          console.log("[KPoe Debug] ✗ Rate limit exceeded - too many requests");
        } else if (response.status === 500) {
          console.log("[KPoe Debug] ✗ Server error - KPoe service may be down");
        } else {
          console.log(`[KPoe Debug] ✗ Request failed: ${response.status} ${response.statusText}`);
        }
        return null;
      }

      // Only parse response on successful status
      const data = await response.json();
      console.log("[KPoe Debug] Response data:", {
        hasLyrics: !!(data && data.lyrics),
        lyricsType: data?.type,
        lyricsCount: data?.lyrics?.length || 0,
        source: data?.metadata?.source
      });

      if (data && data.lyrics && data.lyrics.length > 0) {
        console.log(`[KPoe Debug] ✓ Lyrics found! Type: ${data.type}, Lines: ${data.lyrics.length}, Source: ${data.metadata?.source}`);
        return data;
      }

      console.log("[KPoe Debug] ✗ No lyrics in response");
      return null;
    } catch (e) {
      console.error("[KPoe Debug] ✗ Fetch error:", e.message || e);
      return null;
    }
  }
  function parseKPoeFormat(data) {
    if (!Array.isArray(data.lyrics)) return null;
    const metadata = {
      ...data.metadata,
      source: `${data.metadata.source} (KPoe)`
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
    async findLyrics(info) {
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

        for (let i = 0; i < attempts.length; i++) {
          const attempt = attempts[i];
          console.log("[KPoe Debug] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(`[KPoe Debug] Attempt ${i + 1}/${attempts.length}: ${attempt.description}`);

          let songInfo = {
            artist: attempt.normalizeArtist ? Utils.normalize(info.artist) : (info.artist || ""),
            title: attempt.normalizeTitle ? Utils.normalize(info.title) : (info.title || ""),
            album: attempt.includeAlbum ? (info.album || "") : "",
            duration
          };

          // No sourceOrder parameter - let API search all sources
          let result = await fetchKPoeLyrics(songInfo);

          if (result && result.lyrics && result.lyrics.length > 0) {
            console.log(`[KPoe Debug] ✓ Success on attempt ${i + 1}! Type: ${result.type}`);

            // Keep track of the best result (prefer Line over Word)
            if (!bestResult) {
              // First successful result
              bestResult = result;
              bestResultType = result.type;
              console.log(`[KPoe Debug] Storing first result (${result.type} type)`);
            } else if (result.type === "Line" && bestResultType !== "Line") {
              // Found Line type - upgrade from Word to Line
              bestResult = result;
              bestResultType = result.type;
              console.log(`[KPoe Debug] ✓ Upgraded to Line type lyrics!`);
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
        return { error: "Track not found in KPoe database or no lyrics available" };
      } catch (e) {
        return { error: e.message || "KPoe request failed - network error or service unavailable" };
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
    if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
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


async function fetchMusixmatchLyrics(songInfo) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[Musixmatch Debug] Starting lyrics search");
  console.log("[Musixmatch Debug] Input info:", {
    artist: songInfo.artist,
    title: songInfo.title
  });

  const token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    console.log("[Musixmatch Debug] ✗ No token found - user needs to configure");
    return { error: "Double click on the Musixmatch provider to set up your token" };
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
        console.log("[Musixmatch Debug] ✗ Authentication failed - token expired or invalid");
        return { error: "Musixmatch token expired or invalid. Double click the Musixmatch provider to update your token." };
      } else if (trackResponse.status === 404) {
        console.log("[Musixmatch Debug] ✗ Track not found in Musixmatch database");
        return { error: "Track not found in Musixmatch database" };
      }
      console.log(`[Musixmatch Debug] ✗ Track request failed: ${trackResponse.status}`);
      return { error: `Track lookup failed (HTTP ${trackResponse.status})` };
    }

    const trackBody = await trackResponse.json();
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
      return { error: "Track is instrumental (no lyrics available)" };
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
    return { error: "No lyrics available for this track from Musixmatch" };
  } catch (e) {
    console.error("[Musixmatch Debug] ✗ Fetch error:", e.message || e);
    return { error: `Musixmatch request failed: ${e.message || 'Network error'}` };
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
  async findLyrics(info) {
    try {
      const data = await fetchMusixmatchLyrics(info);
      if (!data) {
  return { error: "Track not found in Musixmatch database or no lyrics available" };
}
if (data.error) {
  // If the error is about missing token, show that instead
  if (data.error.includes("Double click on the Musixmatch provider")) {
    return { error: data.error };
  }
  return { error: "Track not found in Musixmatch database or no lyrics available" };
}
return data;
    } catch (e) {
      return { error: e.message || "Musixmatch request failed - network error or service unavailable" };
    }
  },
  getUnsynced: musixmatchGetUnsynced,
  getSynced: musixmatchGetSynced,
};

  // --- Genius ---
async function fetchGeniusLyrics(info) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[Genius Debug] Starting lyrics search");
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
  return { error: "Lyrics not found on Genius" };
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
  async findLyrics(info) {
    try {
      const data = await fetchGeniusLyrics(info);
      if (!data || data.error) return { error: "No lyrics found for this track from Genius" };
      return data;
    } catch (e) {
      return { error: e.message || "Genius fetch failed" };
    }
  },
  getUnsynced(body) {
  if (!body?.plainLyrics) return null;
  const lines = parseGeniusLyrics(body.plainLyrics).unsynced;
  const notTranscribedPatterns = [
    /lyrics for this song have yet to be transcribed/i,
    /we do not have the lyrics for/i,
    /be the first to add the lyrics/i,
    /please check back once the song has been released/i,
    /add lyrics on genius/i
  ];
  if (
    lines.length === 1 &&
    notTranscribedPatterns.some(rx => rx.test(lines[0].text))
  ) {
    return null;
  }
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
      9. Paste the token below. Delete the word "Bearer" at the beginning and press Save.<br>
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
    localStorage.setItem("lyricsPlusSpotifyToken", input.value.trim());
    modal.remove();
    // Optionally: reload lyrics if popup open and provider is Spotify
  const popup = document.getElementById("lyrics-plus-popup");
  if (popup && Providers.current === "Spotify") {
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
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
  async findLyrics(info) {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Spotify Debug] Starting lyrics search");
    console.log("[Spotify Debug] Input info:", {
      trackId: info.trackId,
      title: info.title,
      artist: info.artist
    });

    const token = localStorage.getItem("lyricsPlusSpotifyToken");

    if (!token) {
      console.log("[Spotify Debug] ✗ No token found in localStorage");
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
          console.log("[Spotify Debug] ✗ Authentication failed - token expired or invalid");
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
        return { error: "Track not found or no lyrics available from Spotify" };
      }

      console.log(`[Spotify Debug] ✓ Lyrics found! Type: ${data.lyrics.syncType}, Lines: ${data.lyrics.lines.length}, Language: ${data.lyrics.language || 'unknown'}`);
      return data.lyrics;
    } catch (e) {
      console.error("[Spotify Debug] ✗ Fetch error:", e.message || e);
      return { error: `Spotify lyrics request failed: ${e.message || 'Network error'}` };
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

      // Remove window mouseup handler for resize
      if (existing._resizeMouseupHandler) {
        window.removeEventListener("mouseup", existing._resizeMouseupHandler);
        DEBUG.debug('Cleanup', 'Removed mouseup handler for resize');
        existing._resizeMouseupHandler = null;
      }

      // Clear popup references
      existing._playPauseBtn = null;
      existing._shuffleBtn = null;
      existing._repeatBtn = null;
      existing._prevBtn = null;
      existing._nextBtn = null;
      existing._lyricsTabs = null;

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

    // Load saved state from localStorage
    const savedState = localStorage.getItem('lyricsPlusPopupState');
    let pos = null;
    if (savedState) {
      try {
        pos = JSON.parse(savedState);
        DEBUG.debug('UI', 'Loaded saved popup state', pos);
      } catch {
        pos = null;
        DEBUG.warn('UI', 'Failed to parse saved popup state');
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
      const isMobile = window.innerWidth <= 600 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile) {
        // Subtract 28% from right side only, no left margin
        const rightMarginPx = rect.width * 0.72;
        const left = rect.left - 72; // Moves popup 28px outside the left edge
        const width = rect.width - rightMarginPx + 72; // Compensate to keep right edge same
        const top = rect.top;
        const height = rect.height;
        return { left, top, width, height };
      } else {
        return rect;
      }
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
        localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }));
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
    title.style.color = "white";
    title.style.filter = "blur(0.7px)";
    title.style.opacity = "0.8";

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
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      userSelect: "none",
      padding: "0 2px",
      marginLeft: "2px",
      marginRight: "2px"
    });
    console.log("✅ [Lyrics+ UI] Restore default position button created");
    btnReset.innerHTML = `
  <svg width="21" height="21" viewBox="0 0 24 24" style="display:block;">
    <g transform="rotate(-90 12 12)">
      <path fill="currentColor" d="M17.65,6.35 C16.2,4.9 14.21,4 12,4 C7.58,4 4,7.58 4,12 C4,16.42 7.58,20 12,20 C15.31,20 18.23,17.69 19.42,14.61 L17.65,13.97 C16.68,16.36 14.54,18 12,18 C8.69,18 6,15.31 6,12 C6,8.69 8.69,6 12,6 C13.66,6 15.14,6.69 16.22,7.78 L13,11 L20,11 L20,4 L17.65,6.35 Z"/>
    </g>
  </svg>
`;
    btnReset.onmouseenter = () => { btnReset.style.background = "#222"; };
    btnReset.onmouseleave = () => { btnReset.style.background = "none"; };

    // Default Position and Size of the Popup Gui
    btnReset.onclick = () => {
      console.log("🔄 [Lyrics+ UI] Restore default position button clicked");
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
        localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height
        }));
        savePopupState(popup);
        console.log("✅ [Lyrics+ UI] Position restored to Spotify lyrics container position");
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
        localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
          left: null,
          top: null,
          width: 360,
          height: window.innerHeight * 0.795
        }));
        savePopupState(popup);
        console.log("✅ [Lyrics+ UI] Position restored to default position (bottom-right corner)");
      }
    };

    // --- Translation controls dropdown, translate button, and remove translation button ---
    const translationControls = document.createElement('div');
    translationControls.style.display = 'flex';
    translationControls.style.alignItems = 'center';
    translationControls.style.justifyContent = 'space-between';
    translationControls.style.width = '100%';
    translationControls.style.gap = '8px';

    console.log("✅ [Lyrics+ UI] Translation controls container created");

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
    langSelect.style.color = 'white';
    langSelect.style.border = 'none';
    langSelect.style.borderRadius = '5px';
    langSelect.style.fontSize = fontSize;
    langSelect.style.boxSizing = 'border-box';
    console.log("✅ [Lyrics+ UI] Translation language dropdown created, current language:", getSavedTranslationLang());
    langSelect.onchange = () => {
      saveTranslationLang(langSelect.value);
      console.log("📝 [Lyrics+ UI] Translation language changed to:", langSelect.value);
      removeTranslatedLyrics();
      lastTranslatedLang = null;
    };

    // Translate button
    const translateBtn = document.createElement('button');
    translateBtn.textContent = 'Translate';
    translateBtn.style.flex = '1';
    translateBtn.style.minWidth = '0';
    translateBtn.style.height = controlHeight;
    translateBtn.style.background = '#1db954';
    translateBtn.style.color = 'white';
    translateBtn.style.border = 'none';
    translateBtn.style.borderRadius = '5px';
    translateBtn.style.fontSize = fontSize;
    translateBtn.style.cursor = 'pointer';
    translateBtn.style.boxSizing = 'border-box';
    console.log("✅ [Lyrics+ UI] Translate button created");
    translateBtn.onclick = translateLyricsInPopup;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Original'; // Remove Translation Button
    removeBtn.style.flex = '1';
    removeBtn.style.minWidth = '0';
    removeBtn.style.height = controlHeight;
    removeBtn.style.background = '#333';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '5px';
    removeBtn.style.fontSize = fontSize;
    removeBtn.style.cursor = 'pointer';
    removeBtn.style.boxSizing = 'border-box';
    console.log("✅ [Lyrics+ UI] Remove translation button ('Original') created");
    removeBtn.onclick = () => {
      console.log("🌐 [Lyrics+ Translation] Remove translation button clicked - showing original lyrics");
      removeTranslatedLyrics();
      lastTranslatedLang = null;
    };

    // Append controls in order: left, center, right
    translationControls.appendChild(langSelect);
    translationControls.appendChild(translateBtn);
    translationControls.appendChild(removeBtn);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.title = "Close Lyrics+";
    Object.assign(closeBtn.style, {
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      fontSize: "18px",
      fontWeight: "bold",
      lineHeight: "1",
      userSelect: "auto",
      height: "32px",
      display: "flex",
      padding: "0 2px",
      alignItems: "center",
      justifyContent: "center",
      boxSizing: "border-box",
    });
    closeBtn.onclick = () => {
      savePopupState(popup);
      removePopup();
      stopPollingForTrackChange();
    };

    // --- Translation Toggle Button ---
    const translationToggleBtn = document.createElement("button");
    translationToggleBtn.textContent = "🌐";
    translationToggleBtn.title = "Show/hide translation controls";
    Object.assign(translationToggleBtn.style, {
      marginRight: "6px",
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      fontSize: "16px",
      lineHeight: "1",
    });

    // --- Transliteration Toggle Button ---
    const transliterationToggleBtn = document.createElement("button");
    transliterationToggleBtn.textContent = "🔡";
    transliterationToggleBtn.title = "Show transliteration";
    Object.assign(transliterationToggleBtn.style, {
      marginRight: "6px",
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      fontSize: "16px",
      lineHeight: "1",
      display: "none", // Hidden by default, shown when transliteration data is available
    });

    console.log("✅ [Lyrics+ UI] Transliteration button created (hidden by default, shows when transliteration data available)");

    // --- Chinese Conversion Button (Traditional ⇄ Simplified) ---
    // Styled to match other header buttons
    const chineseConvBtn = document.createElement("button");
    chineseConvBtn.id = "lyrics-plus-chinese-conv-btn";
    chineseConvBtn.textContent = "繁→简"; // Default, will be updated based on detected script
    chineseConvBtn.title = "Convert Chinese script";
    Object.assign(chineseConvBtn.style, {
      marginRight: "6px",
      cursor: "pointer",
      background: "none",
      border: "none",
      color: "white",
      fontSize: "16px",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      padding: "4px 6px",
      borderRadius: "4px",
      userSelect: "none",
      display: "none", // Hidden by default, shown when Chinese lyrics are present
      transition: "background 0.15s ease",
    });
    chineseConvBtn.onmouseenter = () => { chineseConvBtn.style.background = "#222"; };
    chineseConvBtn.onmouseleave = () => { chineseConvBtn.style.background = "none"; };

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

    const downloadBtn = document.createElement("button");
    downloadBtn.title = "Download lyrics";
    Object.assign(downloadBtn.style, {
      marginLeft: "0px",
      marginRight: "2px",
      background: "none",
      color: "#fff",
      border: "none",
      borderRadius: "5px",
      padding: "0 2px",
      cursor: "pointer",
      width: "28px",
      height: "28px",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      transition: "none",
      position: "relative"
    });
    downloadBtn.onmouseenter = () => { downloadBtn.style.background = "#222"; };
    downloadBtn.onmouseleave = () => { downloadBtn.style.background = "none"; };

    downloadBtn.innerHTML = `
  <svg id="lyrics-download-svg" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
    <path d="M12 5v9"></path>
    <polyline points="8 13 12 17 16 13"></polyline>
    <rect x="4" y="19" width="16" height="2" rx="1"></rect>
  </svg>
`;

    // Dropdown menu for download types
    const downloadDropdown = document.createElement("div");
    downloadBtn._dropdown = downloadDropdown;
    Object.assign(downloadDropdown.style, {
      position: "absolute",
      top: "110%",
      left: "0",
      minWidth: "90px",
      backgroundColor: "#121212",
      border: "1px solid #444",
      borderRadius: "8px",
      boxShadow: "0 2px 12px #0009",
      zIndex: 99999,
      display: "none",
      flexDirection: "column",
      padding: "4px 4px"
    });
    downloadDropdown.tabIndex = -1;

    const syncOption = document.createElement("button");
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
    downloadBtnWrapper.appendChild(downloadDropdown);

    console.log("✅ [Lyrics+ UI] Download button created and added to DOM");

    // Logic for showing/hiding the dropdown and downloading
    downloadBtn.onclick = (e) => {
      // Always show dropdown if at least one download option is available
      let hasSynced = !!currentSyncedLyrics;
      let hasUnsynced = !!currentUnsyncedLyrics;

      // Show/hide options
      syncOption.style.display = hasSynced ? "" : "none";
      unsyncOption.style.display = hasUnsynced ? "" : "none";

      if (hasSynced || hasUnsynced) {
        downloadDropdown.style.display = "flex";
        setTimeout(() => {
          const hide = (ev) => {
            if (!downloadDropdown.contains(ev.target) && ev.target !== downloadBtn) {
              downloadDropdown.style.display = "none";
              document.removeEventListener("mousedown", hide);
            }
          };
          document.addEventListener("mousedown", hide);
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
      console.log("💾 [Lyrics+ UI] Download synced lyrics clicked");
      if (currentSyncedLyrics) downloadSyncedLyrics(currentSyncedLyrics, getCurrentTrackInfo(), Providers.current);
    };
    unsyncOption.onclick = (e) => {
      downloadDropdown.style.display = "none";
      console.log("💾 [Lyrics+ UI] Download unsynced lyrics clicked");
      if (currentUnsyncedLyrics) downloadUnsyncedLyrics(currentUnsyncedLyrics, getCurrentTrackInfo(), Providers.current);
    };

    // --- Font Size Selector ---
    const fontSizeSelect = document.createElement("select");
    fontSizeSelect.title = "Change lyrics font size";
    fontSizeSelect.style.marginRight = "2px";
    fontSizeSelect.style.cursor = "pointer";
    fontSizeSelect.style.background = "#121212";
    fontSizeSelect.style.border = "none";
    fontSizeSelect.style.color = "white";
    fontSizeSelect.style.fontSize = "14px";
    fontSizeSelect.style.lineHeight = "1";
    ["16", "22", "28", "32", "38", "44", "50", "56"].forEach(size => {
      const opt = document.createElement("option");
      opt.value = size;
      opt.textContent = size + "px";
      fontSizeSelect.appendChild(opt);
    });
    fontSizeSelect.value = localStorage.getItem("lyricsPlusFontSize") || "22";
    console.log("✅ [Lyrics+ UI] Font size selector created with options: 16-56px, current value:", fontSizeSelect.value + "px");
    fontSizeSelect.onchange = () => {
      localStorage.setItem("lyricsPlusFontSize", fontSizeSelect.value);
      console.log("📝 [Lyrics+ UI] Font size changed to:", fontSizeSelect.value + "px");
      const lyricsContent = document.getElementById("lyrics-plus-content");
      if (lyricsContent) {
        lyricsContent.style.fontSize = fontSizeSelect.value + "px";
      }
    };

    // Toggle offset section
    const offsetToggleBtn = document.createElement("button");
    offsetToggleBtn.textContent = "⚙️";
    offsetToggleBtn.title = "Show/hide timing offset";
    offsetToggleBtn.style.marginRight = "6px";
    offsetToggleBtn.style.cursor = "pointer";
    offsetToggleBtn.style.background = "none";
    offsetToggleBtn.style.border = "none";
    offsetToggleBtn.style.color = "white";
    offsetToggleBtn.style.fontSize = "16px";
    offsetToggleBtn.style.lineHeight = "1";

    const titleBar = document.createElement("div");
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.appendChild(title);

    // GitHub profile icon
    const ghIcon = document.createElement('div');
    Object.assign(ghIcon.style, { display: 'flex', alignItems: 'center', paddingLeft: '6px', fontSize: '14px' });
    ghIcon.innerHTML = `<a href="https://github.com/Myst1cX/spotify-web-lyrics-plus" target="_blank" title="View on GitHub" style="opacity:0.8; color:white; display:flex; align-items:center;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg></a>`;
    titleBar.appendChild(ghIcon);

    header.appendChild(titleBar);

    // Button group right side
    const buttonGroup = document.createElement("div");
    buttonGroup.style.display = "flex";
    buttonGroup.style.alignItems = "center";
    buttonGroup.appendChild(downloadBtnWrapper);
    buttonGroup.appendChild(fontSizeSelect);
    buttonGroup.appendChild(btnReset);
    buttonGroup.appendChild(chineseConvBtn);
    buttonGroup.appendChild(translationToggleBtn);
    buttonGroup.appendChild(transliterationToggleBtn);
    buttonGroup.appendChild(offsetToggleBtn);
    buttonGroup.appendChild(closeBtn);

    header.appendChild(buttonGroup);
    headerWrapper.appendChild(header);

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
      btn.style.padding = "6px";
      btn.style.borderRadius = "6px";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      btn.style.backgroundColor = (Providers.current === name) ? "#1db954" : "#333";
      btn.style.color = "white";
      btn.style.fontWeight = "600";
      btn.style.filter = "blur(0.7px)";
      btn.style.opacity = "0.8";

      btn.onclick = async (e) => {
        if (providerClickTimer) return; // already waiting for double-click, skip
        providerClickTimer = setTimeout(async () => {
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
      translatedEls.forEach(el => el.remove());
      translationPresent = false;
      lastTranslatedLang = null;
    }

    async function translateLyricsInPopup() {
      if (!lyricsContainer || isTranslating) return;
      const targetLang = getSavedTranslationLang();
      console.log("🌐 [Lyrics+ Translation] Translate button clicked, target language:", targetLang);
      if (translationPresent && lastTranslatedLang === targetLang) return;
      isTranslating = true;
      translateBtn.disabled = true;
      removeTranslatedLyrics();
      const pEls = Array.from(lyricsContainer.querySelectorAll('p'));
      const linesToTranslate = pEls.filter(el => el.textContent.trim() && el.textContent.trim() !== "♪");
      await Promise.all(linesToTranslate.map(async (p) => {
        const originalText = p.textContent.trim();
        const translatedText = await translateText(originalText, targetLang);
        const translationDiv = document.createElement('div');
        translationDiv.textContent = translatedText;
        translationDiv.style.color = 'gray';
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
      }));
      lastTranslatedLang = targetLang;
      translationPresent = true;
      translateBtn.disabled = false;
      isTranslating = false;
    }

    function removeTransliterationLyrics() {
      const transliterationEls = lyricsContainer.querySelectorAll('[data-transliteration="true"]');
      transliterationEls.forEach(el => el.remove());
      transliterationPresent = false;
    }

    function showTransliterationInPopup() {
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
      });
      transliterationPresent = true;
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
        console.log("🔤 [Lyrics+ UI] Transliteration button clicked: HIDDEN");
      } else {
        showTransliterationInPopup();
        localStorage.setItem(STORAGE_KEYS.TRANSLITERATION_ENABLED, 'true');
        transliterationToggleBtn.title = "Hide transliteration";
        console.log("🔤 [Lyrics+ UI] Transliteration button clicked: SHOWN");
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

    console.log("✅ [Lyrics+ Settings] Tabs toggle created (Show lyrics source tabs)");

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

    console.log("✅ [Lyrics+ Settings] Seekbar toggle created (Show seekbar)");

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

    console.log("✅ [Lyrics+ Settings] Playback controls toggle created (Show playback controls)");

    controlsToggleWrapper.appendChild(controlsToggleLabel);
    controlsToggleWrapper.appendChild(controlsToggleCheckbox);

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
      console.log("📝 [Lyrics+ Settings] Seekbar visibility toggled:", seekbarVisible ? "SHOWN" : "HIDDEN");
    };

    // Playback controls checkbox change handler (in settings)
    controlsToggleCheckbox.onchange = () => {
      controlsVisible = controlsToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusControlsVisible', JSON.stringify(controlsVisible));
      applyControlsVisibility(controlsVisible);
      console.log("📝 [Lyrics+ Settings] Playback controls visibility toggled:", controlsVisible ? "SHOWN" : "HIDDEN");
    };

    // Apply initial visibility states
    applyOffsetVisibility(offsetVisible);
    applyControlsVisibility(controlsVisible);
    applyTabsVisibility(tabsVisible);
    
    // Set initial button titles based on visibility states
    offsetToggleBtn.title = offsetVisible ? "Hide timing offset" : "Show timing offset";

    // Initialize checkboxes state
    seekbarToggleCheckbox.checked = seekbarVisible;
    controlsToggleCheckbox.checked = controlsVisible;
    console.log("📝 [Lyrics+ Settings] Seekbar initial state:", seekbarVisible ? "SHOWN" : "HIDDEN");
    console.log("📝 [Lyrics+ Settings] Playback controls initial state:", controlsVisible ? "SHOWN" : "HIDDEN");

    // Initialize and handle tabs toggle checkbox in settings
    tabsToggleCheckbox.checked = tabsVisible;
    console.log("📝 [Lyrics+ Settings] Tabs initial state:", tabsVisible ? "SHOWN" : "HIDDEN");
    tabsToggleCheckbox.onchange = () => {
      tabsVisible = tabsToggleCheckbox.checked;
      localStorage.setItem('lyricsPlusTabsVisible', JSON.stringify(tabsVisible));
      applyTabsVisibility(tabsVisible);
      console.log("📝 [Lyrics+ Settings] Tabs visibility toggled:", tabsVisible ? "SHOWN" : "HIDDEN");
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
        console.log("🎵 [Lyrics+ Playback] Command sent to Spotify:", command.toUpperCase());
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
    console.log("✅ [Lyrics+ Playback] Shuffle button created");

    const { button: btnPrevious, iconWrapper: prevIconWrapper } = createSpotifyControlButton(
      "previous",
      "Previous",
      () => sendSpotifyCommand("previous")
    );
    // Use DOM-cloned icon from Spotify's visible button
    updatePreviousButtonIcon(prevIconWrapper);
    console.log("✅ [Lyrics+ Playback] Previous button created");

    const { button: btnPlayPause, iconWrapper: playIconWrapper } = createPlayPauseButton(
      () => {
        sendSpotifyCommand("playpause");
        setTimeout(() => updatePlayPauseButton(btnPlayPause, playIconWrapper), 100);
      }
    );
    console.log("✅ [Lyrics+ Playback] Play/Pause button created");

    const { button: btnNext, iconWrapper: nextIconWrapper } = createSpotifyControlButton(
      "next",
      "Next",
      () => sendSpotifyCommand("next")
    );
    // Use DOM-cloned icon from Spotify's visible button
    updateNextButtonIcon(nextIconWrapper);
    console.log("✅ [Lyrics+ Playback] Next button created");

    const { button: btnRepeat, iconWrapper: repeatIconWrapper } = createSpotifyControlButton(
      "repeat",
      "Enable repeat",
      () => {
        sendSpotifyCommand("repeat");
        setTimeout(() => updateRepeatButton(btnRepeat, repeatIconWrapper), 100);
      }
    );
    console.log("✅ [Lyrics+ Playback] Repeat button created");

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

    console.log("✅ [Lyrics+ Seekbar] Progress bar (seekbar) created with time display");

    // Apply initial visibility state for progressWrapper (must be after progressWrapper is created)
    applyProgressWrapperVisibility(seekbarVisible);

    popup.appendChild(headerWrapper);
    popup.appendChild(translatorWrapper);
    popup.appendChild(tabsToggleWrapper);
    popup.appendChild(seekbarToggleWrapper);
    popup.appendChild(controlsToggleWrapper);
    popup.appendChild(offsetWrapper);
    popup.appendChild(lyricsContainer);
    popup.appendChild(controlsBar);
    popup.appendChild(progressWrapper);

    const container = document.querySelector('.main-view-container');
    if (container) {
      container.appendChild(popup);
    } else {
      document.body.appendChild(popup);
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

      window.addEventListener("mousemove", (e) => {
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
      });

      window.addEventListener("touchmove", (e) => {
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
      }, { passive: false });

      window.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = "";
          window.lyricsPlusPopupLastDragged = Date.now();
          savePopupState(el);
          setTimeout(() => {
            window.lyricsPlusPopupIsDragging = false;
          }, 200);
        }
      });

      window.addEventListener("touchend", () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = "";
          window.lyricsPlusPopupLastDragged = Date.now();
          savePopupState(el);
          setTimeout(() => {
            window.lyricsPlusPopupIsDragging = false;
          }, 200);
        }
      });
    })(popup, headerWrapper);

    // Create a larger invisible hit area
    const resizerHitArea = document.createElement("div");
    Object.assign(resizerHitArea.style, {
      position: "absolute",
      right: "0px",
      bottom: "0px",
      width: "48px", // much larger for finger touch
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

      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = startWidth + dx;
        let newHeight = startHeight + dy;

        const minWidth = 360; // match your minWidth style
        const minHeight = 240; // match your minHeight style
        const maxWidth = window.innerWidth - el.offsetLeft;
        const maxHeight = window.innerHeight - el.offsetTop;

        newWidth = clamp(newWidth, minWidth, maxWidth);
        newHeight = clamp(newHeight, minHeight, maxHeight);

        el.style.width = newWidth + "px";
        el.style.height = newHeight + "px";
      });

      window.addEventListener("touchmove", (e) => {
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
      }, { passive: false });

      window.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = "";
          savePopupState(el);
          window.lyricsPlusPopupIsResizing = false;
        }
      });

      window.addEventListener("touchend", () => {
        if (isResizing) {
          isResizing = false;
          document.body.style.userSelect = "";
          savePopupState(el);
          window.lyricsPlusPopupIsResizing = false;
        }
      });
    })(popup, resizer);

    observeSpotifyPlayPause(popup);
    observeSpotifyShuffle(popup);
    observeSpotifyRepeat(popup);

    const info = getCurrentTrackInfo();
    if (info) {
      currentTrackId = info.id;
      const lyricsContainer = popup.querySelector("#lyrics-plus-content");
      if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
      autodetectProviderAndLoad(popup, info);
    }

    // --- DYNAMIC PROGRESS BAR: PROGRESS UPDATES AND SEEKING LOGIC ---
    // This section implements robust detection and seeking for Spotify's progress bar,
    // supporting both CSS-driven progress bars (using --progress-bar-transform) and
    // native range inputs, with fallback to visible position/duration text or audio element.

    // No interpolation - we just read directly from Spotify's DOM every 100ms.
    // If Spotify's DOM updates slowly, we show what Spotify shows. This avoids
    // any jumps or sync issues from our own interpolation logic.

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

          // Fallback for duration: try audio.duration
          if (durMs <= 0) {
            const audio = document.querySelector('audio');
            if (audio && !isNaN(audio.duration) && audio.duration > 0) {
              durMs = audio.duration * 1000;
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

            // Fallback: try audio.duration
            if (durMs <= 0) {
              const audio = document.querySelector('audio');
              if (audio && !isNaN(audio.duration) && audio.duration > 0) {
                durMs = audio.duration * 1000;
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

    /**
     * seekTo(ms)
     * Attempts to seek Spotify's playback to the specified position in milliseconds.
     * Fallback order:
     *   (a) audio.currentTime - direct audio element control
     *   (b) Hidden/native range input value + dispatch input/change + pointer events
     *   (c) Emulate pointer/mouse events on CSS progress-bar handle (last resort)
     * @param {number} ms - Target position in milliseconds
     * @returns {boolean} Whether seeking was attempted
     */
    function seekTo(ms) {
      try {
        // --- (a) Try audio.currentTime first ---
        const audio = document.querySelector('audio');
        if (audio && !isNaN(audio.duration) && audio.duration > 0) {
          try {
            audio.currentTime = ms / 1000;
            audio.dispatchEvent(new Event('input', { bubbles: true }));
            audio.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          } catch (e) {
            console.warn('seekTo: Failed to set audio.currentTime', e);
          }
        }

        // --- (b) Try hidden/native range input ---
        const spotifyRange = findSpotifyRangeInput();
        if (spotifyRange) {
          try {
            const max = Number(spotifyRange.max) || 0;
            if (max > 0) {
              // Set the value
              spotifyRange.value = String(clamp(ms, 0, max));

              // Dispatch input and change events
              spotifyRange.dispatchEvent(new Event('input', { bubbles: true }));
              spotifyRange.dispatchEvent(new Event('change', { bubbles: true }));

              // Also try pointer events for better compatibility
              // Note: We omit 'view' property as it can cause errors in Firefox extensions
              const rangeRect = spotifyRange.getBoundingClientRect();
              const percentage = clamp(ms, 0, max) / max;
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

              return true;
            }
          } catch (e) {
            console.warn('seekTo: Failed to set range input', e);
          }
        }

        // --- (c) Emulate pointer events on CSS progress-bar handle (last resort) ---
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
                const percentage = clamp(ms, 0, durMs) / durMs;
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
      console.log("⏩ [Lyrics+ Seekbar] User seeked to position:", formatMs(val));
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

  // Re-render cached lyrics without fetching from provider (used for Chinese conversion toggle)
  function rerenderLyrics(popup) {
    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (!lyricsContainer) return;

    // If no cached lyrics, nothing to re-render
    if (!currentSyncedLyrics && !currentUnsyncedLyrics) return;

    const chineseConvBtn = popup._chineseConvBtn;
    const shouldConvertChinese = isChineseConversionEnabled();

    // Update button text based on conversion state
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

    // Reset translation state when re-rendering lyrics
    translationPresent = false;
    transliterationPresent = false;
    lastTranslatedLang = null;
    lyricsContainer.innerHTML = "";

    const transliterationEnabled = localStorage.getItem(STORAGE_KEYS.TRANSLITERATION_ENABLED) === 'true';
    let hasTransliterationData = false;

    if (currentSyncedLyrics) {
      isShowingSyncedLyrics = true;
      currentSyncedLyrics.forEach(({ text, transliteration }) => {
        const p = document.createElement("p");
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
      currentUnsyncedLyrics.forEach(({ text, transliteration }) => {
        const p = document.createElement("p");
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
    }

    // Show/hide transliteration button based on data availability
    const transliterationBtn = popup._transliterationToggleBtn;
    if (transliterationBtn) {
      transliterationBtn.style.display = hasTransliterationData ? "inline-block" : "none";
      console.log("📝 [Lyrics+ UI] Transliteration button visibility updated:", hasTransliterationData ? "SHOWN (transliteration data available)" : "HIDDEN (no transliteration data)");
    }

    // Show transliteration if enabled and data is available
    if (transliterationEnabled && hasTransliterationData) {
      showTransliterationInPopup();
      if (transliterationBtn) {
        transliterationBtn.title = "Hide transliteration";
      }
    }
  }

  async function updateLyricsContent(popup, info) {
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
    lyricsContainer.textContent = "Loading lyrics...";

    const downloadBtn = popup.querySelector('button[title="Download lyrics"]');
    const downloadDropdown = downloadBtn ? downloadBtn._dropdown : null;
    const chineseConvBtn = popup._chineseConvBtn;

    const provider = Providers.getCurrent();
    const result = await provider.findLyrics(info);

    if (result.error) {
      lyricsContainer.textContent = result.error;
      if (downloadBtn) {
        downloadBtn.style.display = "none";
        console.log("📝 [Lyrics+ UI] Download button hidden (lyrics error)");
      }
      if (downloadDropdown) downloadDropdown.style.display = "none";
      if (chineseConvBtn) chineseConvBtn.style.display = "none";
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

    lyricsContainer.innerHTML = "";
    // Set globals for download
    currentSyncedLyrics = (synced && synced.length > 0) ? synced : null;
    currentUnsyncedLyrics = (unsynced && unsynced.length > 0) ? unsynced : null;

    const transliterationEnabled = localStorage.getItem(STORAGE_KEYS.TRANSLITERATION_ENABLED) === 'true';
    let hasTransliterationData = false;

    if (currentSyncedLyrics) {
      isShowingSyncedLyrics = true;
      currentSyncedLyrics.forEach(({ text, transliteration }) => {
        const p = document.createElement("p");
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
      currentUnsyncedLyrics.forEach(({ text, transliteration }) => {
        const p = document.createElement("p");
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
      if (!lyricsContainer.textContent.trim()) {
        lyricsContainer.textContent = `No lyrics found for this track from ${Providers.current}`;
      }
      currentSyncedLyrics = null;
      currentUnsyncedLyrics = null;
    }

    // Show/hide transliteration button based on data availability
    const transliterationBtn = popup._transliterationToggleBtn;
    if (transliterationBtn) {
      transliterationBtn.style.display = hasTransliterationData ? "inline-block" : "none";
      console.log("📝 [Lyrics+ UI] Transliteration button visibility updated:", hasTransliterationData ? "SHOWN (transliteration data available)" : "HIDDEN (no transliteration data)");
    }

    // Show transliteration if enabled and data is available
    if (transliterationEnabled && hasTransliterationData) {
      showTransliterationInPopup();
      if (transliterationBtn) {
        transliterationBtn.title = "Hide transliteration";
      }
    }

    // Show/hide download button appropriately - only use the variables already declared above!
    if (downloadBtn) {
      if (lyricsContainer.querySelectorAll('p').length > 0) {
        downloadBtn.style.display = "inline-flex";
        console.log("📝 [Lyrics+ UI] Download button shown (lyrics loaded successfully)");
      } else {
        downloadBtn.style.display = "none";
        console.log("📝 [Lyrics+ UI] Download button hidden (no lyrics to display)");
        if (downloadDropdown) downloadDropdown.style.display = "none";
      }
    }
  }

  // Change priority order of providers
  async function autodetectProviderAndLoad(popup, info) {
    DEBUG.info('Autodetect', 'Starting provider autodetection', info);
    const startTime = performance.now();

    const detectionOrder = [
      { name: "LRCLIB", type: "getSynced" },
      { name: "Spotify", type: "getSynced" },
      { name: "KPoe", type: "getSynced" },
      { name: "Musixmatch", type: "getSynced" },
      { name: "LRCLIB", type: "getUnsynced" },
      { name: "Spotify", type: "getUnsynced" },
      { name: "KPoe", type: "getUnsynced" },
      { name: "Musixmatch", type: "getUnsynced" },
      { name: "Genius", type: "getUnsynced" }
    ];

    for (const { name, type } of detectionOrder) {
      try {
        const providerStartTime = performance.now();
        DEBUG.provider.start(name, type, info);

        const provider = Providers.map[name];
        const result = await provider.findLyrics(info);

        const providerDuration = performance.now() - providerStartTime;

        if (result && !result.error) {
          let lyrics = provider[type](result);
          if (lyrics && lyrics.length > 0) {
            DEBUG.provider.success(name, type, type === 'getSynced' ? 'synced' : 'unsynced', lyrics.length);
            DEBUG.provider.timing(name, type, providerDuration.toFixed(2));

            Providers.setCurrent(name);
            if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
            await updateLyricsContent(popup, info);

            const totalDuration = performance.now() - startTime;
            DEBUG.info('Autodetect', `Completed successfully in ${totalDuration.toFixed(2)}ms using ${name}`);
            return;
          } else {
            DEBUG.debug('Provider', `${name} ${type} returned empty lyrics`);
          }
        } else {
          DEBUG.provider.failure(name, type, result?.error || 'No result');
        }

        DEBUG.provider.timing(name, type, providerDuration.toFixed(2));
      } catch (error) {
        // If a provider fails for any reason, continue looking for lyrics in other providers
        // Without this try-catch, an error would skip the remaining providers and stop the loop.
        DEBUG.provider.failure(name, type, error);
      }
    }

    // Unselect any provider
    Providers.current = null;
    if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

    const lyricsContainer = popup.querySelector("#lyrics-plus-content");
    if (lyricsContainer) lyricsContainer.textContent = "No lyrics were found for this track from any of the available providers";
    currentSyncedLyrics = null;
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
      if (info.id !== currentTrackId) {
        DEBUG.track.changed(currentTrackId, info.id, info);
        currentTrackId = info.id;
        const lyricsContainer = popup.querySelector("#lyrics-plus-content");
        if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
        autodetectProviderAndLoad(popup, info);
      }

      // Update all button states using DOM-cloned icons from Spotify's visible buttons
      if (popup && popup._playPauseBtn) {
        updatePlayPauseButton(popup._playPauseBtn.button, popup._playPauseBtn.iconWrapper);
      }
      if (popup && popup._shuffleBtn) {
        updateShuffleButton(popup._shuffleBtn.button, popup._shuffleBtn.iconWrapper);
      }
      if (popup && popup._repeatBtn) {
        updateRepeatButton(popup._repeatBtn.button, popup._repeatBtn.iconWrapper);
        observeSpotifyPlayPause(popup);
        observeSpotifyShuffle(popup);
        observeSpotifyRepeat(popup);
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

  function addButton(maxRetries = LIMITS.BUTTON_ADD_MAX_RETRIES) {
    let attempts = 0;
    const tryAdd = () => {
      // const nowPlayingViewBtn = document.querySelector('[data-testid="control-button-npv"]');
      // NowPlayingView control button is no longer a fallback as it has been removed in a Spotify UI revamp change
      const micBtn = document.querySelector('[data-testid="lyrics-button"]');
      const targetBtn = micBtn; // previously: nowPlayingViewBtn || micBtn;
      // NowPlayingView control button is no longer a fallback as it has been removed in a Spotify UI revamp change
      const controls = targetBtn?.parentElement;
      if (!controls) {
        if (attempts < maxRetries) {
          attempts++;
          DEBUG.debug('Button', `Injection attempt ${attempts}/${maxRetries} - controls not found, retrying...`);
          setTimeout(tryAdd, TIMING.BUTTON_ADD_RETRY_MS);
        } else {
          DEBUG.error('Button', `Failed to inject Lyrics+ button after ${maxRetries} attempts`);
        }
        return;
      }
      if (document.getElementById("lyrics-plus-btn")) {
        DEBUG.debug('Button', 'Lyrics+ button already exists, skipping injection');
        return;
      }
      const btn = document.createElement("button");
      btn.id = "lyrics-plus-btn";
      btn.title = "Show Lyrics+";
      btn.textContent = "Lyrics+";
      DEBUG.info('Button', 'Lyrics+ button injected successfully');
      Object.assign(btn.style, {
        backgroundColor: "#1db954",
        border: "none",
        borderRadius: "20px",
        color: "white",
        fontWeight: "600",
        fontSize: "14px",
        padding: "6px 12px",
        marginLeft: "8px",
        userSelect: "none",
        cursor: "pointer",
        filter: "blur(0.7px)",
        opacity: "0.8",
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
      controls.insertBefore(btn, targetBtn);
    };
    tryAdd();
  }

  // Global observer to inject Lyrics+ button when DOM changes
  const buttonInjectionObserver = new MutationObserver(() => {
    addButton();
  });
  ResourceManager.registerObserver(buttonInjectionObserver, 'Global button injection (document.body)');
  buttonInjectionObserver.observe(document.body, { childList: true, subtree: true });

  function init() {
    addButton();
  }

  const appRoot = document.querySelector('#main');
  if (appRoot) {
    const pageObserver = new MutationObserver(() => {
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

  // Call this after user resizes the popup:
  function observePopupResize() {
    const popup = document.getElementById("lyrics-plus-popup");
    if (!popup) return;
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

  // Listen for popup creation to hook the resizer
  const popupResizeObserver = new MutationObserver(() => {
    const popup = document.getElementById("lyrics-plus-popup");
    if (popup) {
      applyProportionToPopup(popup);
      observePopupResize();
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

  init();
})();
