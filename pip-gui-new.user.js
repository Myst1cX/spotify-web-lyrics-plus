// ==UserScript==
// @name         Spotify Lyrics+ New
// @namespace    http://tampermonkey.net/
// @version      8.9
// @description  Display synced and unsynced lyrics from multiple sources (LRCLIB, Spotify, KPoe, Musixmatch, Genius) in a floating popup on Spotify Web. Both formats are downloadable. Optionally toggle a line by line lyrics translation.
// @author       Myst1cX
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @connect      genius.com
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-new.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-new.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ------------------------
  // State Variables
  // ------------------------

  let highlightTimer = null;
  let pollingInterval = null;
  let currentTrackId = null;
  let currentSyncedLyrics = null;
  let currentUnsyncedLyrics = null;
  let currentLyricsContainer = null;
  let lastTranslatedLang = null;
  let translationPresent = false;
  let isTranslating = false;
  let isShowingSyncedLyrics = false;


  // Global flag (window.lyricsPlusPopupIsResizing) is used to prevent lyric highlighting updates from interfering with popup resizing

  // Global flags below are used to prevent a bug with Revert to default position button
  window.lyricsPlusPopupIgnoreProportion = false;
  window.lastProportion = { w: null, h: null };

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

async function translateText(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data[0][0][0];
  } catch (error) {
    console.error('Translation failed:', error);
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
    capitalize(str, lower = false) {
      if (!str) return '';
      return (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
    },
    // (async) Convert Traditional to Simplified using openapi - fallback: identity
    async toSimplifiedChinese(str) {
      // This is a stub: since we don't have a real openapi, just return original string.
      // You can insert API for opencc or similar here if needed.
      return str;
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
    if (match) return match[1];
  }
  return null;
}

 function getCurrentTrackInfo() {
  const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
  const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
  const durationEl = document.querySelector('[data-testid="playback-duration"]');
  const trackId = getCurrentTrackId();
  if (!titleEl || !artistEl) return null;
  const title = titleEl.textContent.trim();
  const artist = artistEl.textContent.trim();
  const duration = durationEl ? timeStringToMs(durationEl.textContent) : 0;
  return {
    id: `${title}-${artist}`,
    title,
    artist,
    album: "",
    duration,
    uri: "",
    trackId
  };
}

  function timeStringToMs(str) {
    const parts = str.split(":").map((p) => parseInt(p));
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
      });
      return;
    }
    pElements.forEach((p, idx) => {
      if (idx === activeIndex) {
        p.style.color = "#1db954";
        p.style.fontWeight = "700";
        p.style.filter = "none";
        p.style.opacity = "1";
        p.style.transform = "scale(1.05)";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
      } else {
        p.style.color = "white";
        p.style.fontWeight = "400";
        p.style.filter = "blur(0.7px)";
        p.style.opacity = "0.8";
        p.style.transform = "scale(1.0)";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
      }
    });

    // Always auto-center while playing (do NOT auto-center when stopped)
    const activeP = pElements[activeIndex];
    if (activeP && isPlaying) {
      activeP.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 50);
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

  // --- Global Button Update Functions ---
  function getShuffleState() {
    // Robustly detect shuffle state using aria-label and button classes
    const shuffleButtons = Array.from(document.querySelectorAll('button[aria-label]'));
    for (const btn of shuffleButtons) {
      const ariaLabel = btn.getAttribute('aria-label') || "";
      if (btn.offsetParent === null) continue;
      // Use regex to match regardless of playlist/queue name
      if (/^Enable Shuffle/i.test(ariaLabel) && !/Smart/i.test(ariaLabel)) {
        return 'off';
      }
      if (/^Enable Smart Shuffle/i.test(ariaLabel)) {
        return 'on';
      }
      if (/^Disable Shuffle/i.test(ariaLabel)) {
        // Smart Shuffle ON (Spotify uses special icon/class for this)
        return 'smart';
      }
    }
    return 'off';
  }

  function getRepeatState() {
    // Robustly detect repeat state using aria-label and aria-checked
    const repeatButton = document.querySelector('[data-testid="control-button-repeat"]');
    if (!repeatButton) return 'off';

    const ariaLabel = repeatButton.getAttribute('aria-label') || '';
    const ariaChecked = repeatButton.getAttribute('aria-checked');
    // Use regex to ignore possible playlist/queue name suffixes
    if (/^Enable repeat/i.test(ariaLabel) && ariaChecked === 'false') {
      return 'off';
    }
    if (/^Enable repeat one/i.test(ariaLabel) && ariaChecked === 'true') {
      return 'all';
    }
    if (/^Disable repeat/i.test(ariaLabel) && ariaChecked === 'mixed') {
      return 'one';
    }
    return 'off';
  }

  function updateShuffleButton(button, iconWrapper) {
    const state = getShuffleState();

    // Clear existing icon
    iconWrapper.innerHTML = "";

    if (state === 'off') {
      button.setAttribute("aria-label", "Enable shuffle");
      button.classList.remove("active");
      button.style.color = "rgba(255, 255, 255, 0.7)";
      iconWrapper.appendChild(shuffleOffSVG.cloneNode(true));
    } else if (state === 'on') {
      button.setAttribute("aria-label", "Enable smart shuffle");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(shuffleOffSVG.cloneNode(true));
    } else if (state === 'smart') {
      button.setAttribute("aria-label", "Disable shuffle");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(shuffleSmartSVG.cloneNode(true));
    }
  }

  function updateRepeatButton(button, iconWrapper) {
    const state = getRepeatState();

    iconWrapper.innerHTML = "";

    if (state === 'off') {
      button.setAttribute("aria-label", "Enable repeat");
      button.classList.remove("active");
      button.style.color = "rgba(255, 255, 255, 0.7)";
      iconWrapper.appendChild(repeatOffSVG.cloneNode(true));
    } else if (state === 'all') {
      button.setAttribute("aria-label", "Enable repeat one");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(repeatOffSVG.cloneNode(true));
    } else if (state === 'one') {
      button.setAttribute("aria-label", "Disable repeat");
      button.classList.add("active");
      button.style.color = "#1db954";
      iconWrapper.appendChild(repeatOneSVG.cloneNode(true));
    }
  }

  function updatePlayPauseButton(button, iconWrapper) {
    const isPlaying = isSpotifyPlaying();

    // Clear existing icon
    iconWrapper.innerHTML = "";

    if (isPlaying) {
      button.setAttribute("aria-label", "Pause");
      iconWrapper.appendChild(pauseSmallSVG.cloneNode(true));
    } else {
      button.setAttribute("aria-label", "Play");
      iconWrapper.appendChild(playSmallSVG.cloneNode(true));
    }
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
  const params = [
    `artist_name=${encodeURIComponent(songInfo.artist)}`,
    `track_name=${encodeURIComponent(songInfo.title)}`
  ];

  // Only add album if available and not skipped
  if (songInfo.album && !tryWithoutAlbum) {
    params.push(`album_name=${encodeURIComponent(songInfo.album)}`);
  }

  // Only include duration if it's a safe value
  if (songInfo.duration && songInfo.duration >= 10000) {
    params.push(`duration=${Math.floor(songInfo.duration / 1000)}`);
  }

  const url = `https://lrclib.net/api/get?${params.join('&')}`;

  try {
    const response = await fetch(url, {
      headers: {
        // This header is okay to send — doesn’t break anything
        "x-user-agent": "lyrics-plus-script"
      }
    });

    if (!response.ok) {
      console.warn(`LRCLIB request failed with status ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (e) {
    console.error("LRCLIB fetch error:", e);
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
        if (!data) return { error: "No lyrics found for this track from LRCLIB" };
        return data;
      } catch (e) {
        return { error: e.message || "LRCLIB fetch failed" };
      }
    },
    getUnsynced(body) {
      if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
      if (!body?.plainLyrics) return null;
      return Utils.parseLocalLyrics(body.plainLyrics).unsynced;
    },
    getSynced(body) {
      if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
      if (!body?.syncedLyrics) return null;
      return Utils.parseLocalLyrics(body.syncedLyrics).synced;
    }
  };

  // --- KPoe ---
  async function fetchKPoeLyrics(songInfo, sourceOrder = '', forceReload = false) {
    const albumParam = (songInfo.album && songInfo.album !== songInfo.title)
      ? `&album=${encodeURIComponent(songInfo.album)}`
      : '';
    const sourceParam = sourceOrder ? `&source=${encodeURIComponent(sourceOrder)}` : '';
    let forceReloadParam = forceReload ? `&forceReload=true` : '';
    let fetchOptions = {};
    if (forceReload) {
      fetchOptions = { cache: 'no-store' };
      forceReloadParam = `&forceReload=true`;
    }
    const url = `https://lyricsplus.prjktla.workers.dev/v2/lyrics/get?title=${encodeURIComponent(songInfo.title)}&artist=${encodeURIComponent(songInfo.artist)}${albumParam}&duration=${songInfo.duration}${sourceParam}${forceReloadParam}`;
    const response = await fetch(url, fetchOptions);
    if (!response.ok) return null;
    const data = await response.json();
    return data;
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
          element: item.element || {}
        };
      }),
      metadata
    };
  }
  const ProviderKPoe = {
    async findLyrics(info) {
      try {
        const artist = Utils.normalize(info.artist);
        const title = Utils.normalize(info.title);
        const album = Utils.normalize(info.album);
        const duration = Math.floor(info.duration / 1000);
        const songInfo = { artist, title, album, duration };
        const result = await fetchKPoeLyrics(songInfo);
        if (!result) return { error: "No lyrics found for this track from KPoe" };
        return parseKPoeFormat(result);
      } catch (e) {
        return { error: e.message || "KPoe fetch failed" };
      }
    },
    getUnsynced(body) {
      if (!body?.data || !Array.isArray(body.data)) return null;
      return body.data.map(line => ({
        text: line.text
      }));
    },
    getSynced(body) {
      if (!body?.data || !Array.isArray(body.data)) return null;
      return body.data.map(line => ({
        time: Math.round(line.startTime * 1000),
        text: line.text
      }));
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
  const token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    return { error: "Double click on the Musixmatch provider to set up your token" };
  }

  // Step 1: Get track info
  const trackResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/matcher.track.get?` +
      `q_track=${encodeURIComponent(songInfo.title)}&` +
      `q_artist=${encodeURIComponent(songInfo.artist)}&` +
      `format=json&usertoken=${encodeURIComponent(token)}&app_id=web-desktop-app-v1.0`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (!trackResponse.ok) return { error: "Track info request failed" };
  const trackBody = await trackResponse.json();
  const track = trackBody?.message?.body?.track;
  if (!track) return { error: "Track not found" };

  if (track.instrumental) {
    return { synced: [{ text: "♪ Instrumental ♪", time: 0 }] };
  }

  // Step 2: Fetch synced lyrics via subtitles.get
  const subtitleResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/track.subtitles.get?` +
      `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (subtitleResponse.ok) {
    const subtitleBody = await subtitleResponse.json();
    const subtitleList = subtitleBody?.message?.body?.subtitle_list;
    if (subtitleList && subtitleList.length > 0) {
      const subtitleObj = subtitleList[0]?.subtitle;
      if (subtitleObj?.subtitle_body) {
        const synced = parseMusixmatchSyncedLyrics(subtitleObj.subtitle_body);
        if (synced.length > 0) return { synced };
      }
    }
  }

  // Step 3: fallback to unsynced lyrics
  const lyricsResponse = await fetch(
    `https://apic-desktop.musixmatch.com/ws/1.1/track.lyrics.get?` +
      `track_id=${track.track_id}&format=json&app_id=web-desktop-app-v1.0&usertoken=${encodeURIComponent(token)}`,
    {
      headers: {
        'user-agent': navigator.userAgent,
        'referer': 'https://www.musixmatch.com/',
      },
      cache: 'no-store',
    }
  );
  if (!lyricsResponse.ok) return { error: "Lyrics request failed" };
  const lyricsBody = await lyricsResponse.json();
  const unsyncedRaw = lyricsBody?.message?.body?.lyrics?.lyrics_body;
  if (unsyncedRaw) {
    const unsynced = unsyncedRaw.split("\n").map(line => ({ text: line }));
    return { unsynced };
  }

  return { error: "No lyrics found" };
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
  return { error: "No lyrics found for this track from Musixmatch" };
}
if (data.error) {
  // If the error is about missing token, show that instead
  if (data.error.includes("Double click on the Musixmatch provider")) {
    return { error: data.error };
  }
  return { error: "No lyrics found for this track from Musixmatch" };
}
return data;
    } catch (e) {
      return { error: e.message || "Musixmatch fetch failed" };
    }
  },
  getUnsynced: musixmatchGetUnsynced,
  getSynced: musixmatchGetSynced,
};






  // --- Genius ---
async function fetchGeniusLyrics(info) {

  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);

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
    return str.toLowerCase().replace(/[^a-z0-9]/gi, '');
  }

  function normalizeArtists(artist) {
    return artist
      .toLowerCase()
      .split(/,|&|feat|ft|and|\band\b/gi)
      .map(s => s.trim())
      .filter(Boolean)
      .map(normalize);
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

  // True for translations, covers, etc (not original lyric pages!)
  const translationKeywords = [
    "translation", "übersetzung", "перевод", "çeviri", "traducción", "traduções", "traduction",
    "traductions", "traduzione", "traducciones-al-espanol", "fordítás", "fordítások", "tumaczenie",
    "tłumaczenie", "polskie tłumaczenie", "magyar fordítás", "turkce çeviri", "russian translations",
    "deutsche übersetzung", "genius users", "fan", "fans", "official translation", "genius russian translations",
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

    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const searchUrl = `https://genius.com/api/search/multi?per_page=5&page=${page}&q=${query}`;

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

        for (const hit of songHits) {
          const result = hit.result;
        }

        const targetArtists = new Set(normalizeArtists(info.artist));
        const targetTitleNorm = normalize(Utils.removeExtraInfo(info.title));
        const targetHasVersion = hasVersionKeywords(info.title);

        let bestScore = -Infinity;
        let fallbackScore = -Infinity;
        let song = null;
        let fallbackSong = null;

        for (const hit of songHits) {
          const result = hit.result;
          // Only consider original (non-translation) Genius lyrics pages
          if (isTranslationPage(result) || !isSimpleOriginalUrl(result.url)) continue;

          const primary = normalizeArtists(result.primary_artist?.name || '');
          const featured = extractFeaturedArtistsFromTitle(result.title || '');
          const resultArtists = new Set([...primary, ...featured]);
          const resultTitleNorm = normalize(Utils.removeExtraInfo(result.title || ''));
          const resultHasVersion = hasVersionKeywords(result.title || '');

          // Artist overlap count
          let artistOverlapCount = 0;
          for (const a of targetArtists) {
            if (resultArtists.has(a)) artistOverlapCount++;
          }
          const totalArtists = targetArtists.size;
          const missingArtists = totalArtists - artistOverlapCount;

          let artistScore = 0;
          if (artistOverlapCount === 0) {
            artistScore = 0; // no artist overlap, reject later
          } else if (artistOverlapCount === totalArtists) {
            artistScore = 8; // perfect match
          } else if (artistOverlapCount >= totalArtists - 1) {
            artistScore = 7; // almost perfect
          } else if (artistOverlapCount >= 1) {
            // Partial match, soften penalty for missing artists due to incomplete metadata
            artistScore = 5 + artistOverlapCount; // partial boost
            artistScore -= missingArtists * 0.5;
          }

          for (const fa of featured) {
            if (targetArtists.has(fa) && !resultArtists.has(fa)) {
              artistScore += 1;
            }
          }

          if (artistScore < 3) {
            continue;
          }

          // Title scoring
          let titleScore = 0;
          if (resultTitleNorm === targetTitleNorm) {
            titleScore = 6;
          } else if (resultTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(resultTitleNorm)) {
            titleScore = 4;
          } else {
            titleScore = 1;
          }

          // Version keywords adjustment
          if (targetHasVersion) {
            if (resultHasVersion) titleScore += 2;
            else titleScore -= 2;
          } else {
            if (!resultHasVersion) titleScore += 2;
            else titleScore -= 2;
          }

          let score = artistScore + titleScore;
          let penaltyLog = [];

          if (!resultTitleNorm.includes(targetTitleNorm)) {
            score -= 3;
            penaltyLog.push("-3 title not fully overlapping");
          }

          if (artistOverlapCount === 0) {
            score -= 5;
            penaltyLog.push("-5 no artist overlap");
          }

          if (penaltyLog.length) {
          }

          if (score > bestScore && (!targetHasVersion || resultHasVersion)) {
            bestScore = score;
            song = result;
          } else if (
            score > fallbackScore &&
            (!resultHasVersion || !targetHasVersion) &&
            score >= 6
          ) {
            fallbackScore = score;
            fallbackSong = result;
          }
        }

        if (!song && fallbackSong) {
          song = fallbackSong;
          bestScore = fallbackScore;
        }

        if (bestScore < 6 || !song?.url) {
          continue;
        }


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
        console.error("[Genius] Fetch or parse error:", e);
        continue;
      }
    }
  }

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
    localStorage.setItem("lyricsPlusSpotifyToken", input.value.trim());
    modal.remove();
    // Optionally: reload lyrics if popup open and provider is Spotify
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
    const token = localStorage.getItem("lyricsPlusSpotifyToken");

    if (!token) {
      console.warn("[SpotifyLyrics+] No Spotify user token found in localStorage.");
      return { error: "Double click on the Spotify provider to set up your token.\n" + "A fresh token is required every hour/upon page reload for security." };
    }

    if (!info.trackId) {
      console.warn("[SpotifyLyrics+] No trackId in song info:", info);
      return { error: "No lyrics found for this track from Spotify" };
    }

    const endpoint = `https://spclient.wg.spotify.com/color-lyrics/v2/track/${info.trackId}?format=json&vocalRemoval=false&market=from_token`;


    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "app-platform": "WebPlayer",
          "User-Agent": navigator.userAgent,
          "Authorization": "Bearer " + token,
        },
      });


      if (!res.ok) {
    const text = await res.text();
    console.warn("[SpotifyLyrics+] Non-ok response:", res.status, text);

    if (res.status === 401) {
        return { error: "Double click on the Spotify provider and follow the instructions. Spotify requires a fresh token every hour/upon page reload for security." };
    }
    if (res.status === 404) {
        return { error: "No lyrics found for this track from Spotify" };
    }
    return { error: "No lyrics found for this track from Spotify" };
}

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        const text = await res.text();
        console.error("[SpotifyLyrics+] Failed to parse JSON. Raw response:", text);
        return { error: "No lyrics found for this track from Spotify" };
      }

      // Adapt to your UI's expected data shape:
      if (!data || !data.lyrics || !data.lyrics.lines || !data.lyrics.lines.length) {
        console.warn("[SpotifyLyrics+] No lines in API response:", data);
        return { error: "No lyrics found for this track from Spotify" };
      }
      return data.lyrics;
    } catch (e) {
      console.error("[SpotifyLyrics+] Fetch error:", e);
      return { error: "No lyrics found for this track from Spotify" };
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
  // UI and Popup Functions (UNCHANGED, see previous version)
  // ------------------------

  function removePopup() {
    if (highlightTimer) {
      clearInterval(highlightTimer);
      highlightTimer = null;
    }
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    const existing = document.getElementById("lyrics-plus-popup");
    if (existing) {
      if (existing._playPauseObserver) existing._playPauseObserver.disconnect();
      existing._playPauseObserver = null;
      existing._playPauseBtn = null;
      
      // Cleanup mobile banner observer
      cleanupMobileBannerObserver(existing);
      
      existing.remove();
    }
  }

function observeSpotifyShuffle(popup) {
  if (!popup || !popup._shuffleBtn) return;
  if (popup._shuffleObserver) popup._shuffleObserver.disconnect();

  // Always observe the actual shuffle button itself
  const shuffleBtn = Array.from(document.querySelectorAll('button[aria-label]')).find(btn => {
    const label = btn.getAttribute('aria-label') || '';
    return /^Enable Shuffle|^Enable Smart Shuffle|^Disable Shuffle/i.test(label);
  });
  if (!shuffleBtn) return;

  const observer = new MutationObserver(() => {
    updateShuffleButton(popup._shuffleBtn.button, popup._shuffleBtn.iconWrapper);
    // Re-attach observer if the node is replaced
    setTimeout(() => observeSpotifyShuffle(popup), 0);
  });
  observer.observe(shuffleBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style'] });
  popup._shuffleObserver = observer;
}

function observeSpotifyRepeat(popup) {
  if (!popup || !popup._repeatBtn) return;
  if (popup._repeatObserver) popup._repeatObserver.disconnect();

  let repeatBtn = document.querySelector('[data-testid="control-button-repeat"]');
  if (!repeatBtn) return;

  const observer = new MutationObserver(() => {
    updateRepeatButton(popup._repeatBtn.button, popup._repeatBtn.iconWrapper);
    // Re-attach observer if the node is replaced
    setTimeout(() => observeSpotifyRepeat(popup), 0);
  });
  observer.observe(repeatBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style', 'aria-checked'] });
  popup._repeatObserver = observer;
}

function observeSpotifyPlayPause(popup) {
  if (!popup || !popup._playPauseBtn) return;
  if (popup._playPauseObserver) popup._playPauseObserver.disconnect();

  let spBtn = document.querySelector('[data-testid="control-button-playpause"]');
  if (!spBtn) spBtn = document.querySelector('[aria-label]');
  if (!spBtn) return;
  const observer = new MutationObserver(() => {
    if (popup._playPauseBtn) {
      updatePlayPauseButton(popup._playPauseBtn.button, popup._playPauseBtn.iconWrapper);
    }
  });
  observer.observe(spBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style'] });
  popup._playPauseObserver = observer;
}

  // ------------------------
  // Mobile Banner Detection and Adjustment
  // ------------------------

  function isMobileDevice() {
    return window.innerWidth <= 600 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function detectPlayingOnBanner() {
    // Look for the "Playing on Web Player" banner by text content or aria-live attribute
    const bannerSelectors = [
      '[aria-live="polite"]',
      '[aria-live="assertive"]',
      '[data-testid*="connect"]',
      '[data-testid*="banner"]'
    ];
    
    for (const selector of bannerSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const text = element.textContent.toLowerCase();
        if (text.includes('playing on') || text.includes('web player')) {
          return element;
        }
      }
    }
    
    // Fallback: search for any element containing "Playing on" text
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      if (element.children.length === 0) { // Only check leaf nodes to avoid duplicates
        const text = element.textContent.toLowerCase();
        if (text.includes('playing on') && text.includes('web player')) {
          // Return the closest parent that likely represents the banner container
          return element.closest('[class*="banner"]') || element.closest('[style*="bottom"]') || element;
        }
      }
    }
    
    return null;
  }

 function getBannerHeight() {
  // Look for Spotify's banner container by more specific class or structure
  const banner = document.querySelector('div.gQoa8JTSpjSmYyABcag2'); //div of "Playing on Web Browser" container
  if (banner) {
    return banner.getBoundingClientRect().height;
  }
  // Fallback to your old logic if the selector doesn't match
  const detected = detectPlayingOnBanner();
  if (detected) {
    return detected.getBoundingClientRect().height;
  }
  return 0;
}

  function adjustPopupForMobileBanner(popup) {
    if (!isMobileDevice() || !popup) return;
    
    const bannerHeight = getBannerHeight();
    const currentHeight = parseInt(popup.style.height) || popup.offsetHeight;
    
    if (bannerHeight > 0) {
      // Store original height if not already stored (use current height if no banner was previously detected)
      if (!popup._originalHeight) {
        popup._originalHeight = currentHeight;
      }
      
      // Adjust height by subtracting banner height
      const newHeight = popup._originalHeight - bannerHeight;
      if (newHeight > 240) { // Ensure minimum height
        popup.style.height = newHeight + 'px';
        popup._bannerAdjusted = true;
      }
    } else {
      // Restore original height if banner is gone and we had adjusted it
      if (popup._originalHeight && popup._bannerAdjusted) {
        popup.style.height = popup._originalHeight + 'px';
        popup._bannerAdjusted = false;
      }
    }
  }

  function setupMobileBannerObserver(popup) {
    if (!isMobileDevice() || !popup) return;
    
    // Initial adjustment
    adjustPopupForMobileBanner(popup);
    
    // Set up MutationObserver to watch for banner changes
    const observer = new MutationObserver(() => {
      adjustPopupForMobileBanner(popup);
    });
    
    // Observe changes to the document body and main container
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    // Store observer reference for cleanup
    popup._bannerObserver = observer;
    
    // Also poll every 2 seconds as a fallback
    const pollInterval = setInterval(() => {
      adjustPopupForMobileBanner(popup);
    }, 2000);
    
    popup._bannerPollInterval = pollInterval;
  }

  function cleanupMobileBannerObserver(popup) {
    if (popup && popup._bannerObserver) {
      popup._bannerObserver.disconnect();
      popup._bannerObserver = null;
    }
    if (popup && popup._bannerPollInterval) {
      clearInterval(popup._bannerPollInterval);
      popup._bannerPollInterval = null;
    }
  }

  function createPopup() {
    removePopup();

    // Load saved state from localStorage
    const savedState = localStorage.getItem('lyricsPlusPopupState');
let pos = null;
if (savedState) {
  try {
    pos = JSON.parse(savedState);
  } catch {
    pos = null;
  }
} else {
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
    // Subtract 25% from right side only, no left margin
    const rightMarginPx = rect.width * 0.75;
    const left = rect.left - 75;   // Moves popup 25px outside the left edge
    const width = rect.width - rightMarginPx + 75; // Compensate to keep right edge same
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
    minWidth: "370px",
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
      minWidth: "370px",
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
      width: "370px",
      height: "79.5vh",
      minWidth: "370px",
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
      } else {
        Object.assign(popup.style, {
          position: "fixed",
          bottom: "87px",
          right: "0px",
          left: "auto",
          top: "auto",
          width: "370px",
          height: "79.5vh",
          zIndex: 100000
        });
        localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
          left: null,
          top: null,
          width: 370,
          height: window.innerHeight * 0.795
        }));
      }
      localStorage.removeItem("lyricsPlusPopupProportion");
      window.lastProportion = { w: null, h: null };
      window.lyricsPlusPopupIgnoreProportion = true;
      setTimeout(() => {
        window.lyricsPlusPopupIgnoreProportion = false;
        if (
          popup.style.width === "370px" &&
          popup.style.height === "79.5vh"
        ) {
          window.lastProportion = { w: null, h: null };
        }
      }, 3000);
    };

// --- Translation controls dropdown, translate button, and remove translation button ---
const translationControls = document.createElement('div');
translationControls.style.display = 'flex';
translationControls.style.alignItems = 'center';
translationControls.style.justifyContent = 'space-between';
translationControls.style.width = '100%';
translationControls.style.gap = '8px';

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
langSelect.onchange = () => {
  saveTranslationLang(langSelect.value);
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
translateBtn.onclick = translateLyricsInPopup;

// Remove translation button
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
removeBtn.onclick = () => {
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
  <svg id="lyrics-download-svg" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#fff" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" style="display:block;transition:stroke 0.18s;">
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
syncOption.onmouseenter = () => {
  syncOption.style.background = "#333";
  syncOption.style.color = "#fff";
};
syncOption.onmouseleave = () => {
  syncOption.style.background = "#121212";
  syncOption.style.color = "#fff";
};

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
unsyncOption.onmouseenter = () => {
  unsyncOption.style.background = "#333";
  unsyncOption.style.color = "#fff";
};
unsyncOption.onmouseleave = () => {
  unsyncOption.style.background = "#121212";
  unsyncOption.style.color = "#fff";
};

downloadDropdown.appendChild(syncOption);
downloadDropdown.appendChild(unsyncOption);

downloadBtnWrapper.appendChild(downloadBtn);
downloadBtnWrapper.appendChild(downloadDropdown);

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
  if (currentSyncedLyrics) downloadSyncedLyrics(currentSyncedLyrics, getCurrentTrackInfo(), Providers.current);
};
unsyncOption.onclick = (e) => {
  downloadDropdown.style.display = "none";
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
["16", "22", "28", "32", "38", "44"].forEach(size => {
  const opt = document.createElement("option");
  opt.value = size;
  opt.textContent = size + "px";
  fontSizeSelect.appendChild(opt);
});
fontSizeSelect.value = localStorage.getItem("lyricsPlusFontSize") || "22";
fontSizeSelect.onchange = () => {
  localStorage.setItem("lyricsPlusFontSize", fontSizeSelect.value);
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

    // Toggle playback controls bar - use a better icon
    const playbackToggleBtn = document.createElement("button");
    playbackToggleBtn.textContent = "🎛️";
    playbackToggleBtn.title = "Show/hide playback controls";
    playbackToggleBtn.style.marginRight = "6px";
    playbackToggleBtn.style.cursor = "pointer";
    playbackToggleBtn.style.background = "none";
    playbackToggleBtn.style.border = "none";
    playbackToggleBtn.style.color = "white";
    playbackToggleBtn.style.fontSize = "14px";
    playbackToggleBtn.style.lineHeight = "1";

    const titleBar = document.createElement("div");
    titleBar.style.display = "flex";
    titleBar.style.alignItems = "center";
    titleBar.appendChild(title);
    header.appendChild(titleBar);

    // Button group right side
const buttonGroup = document.createElement("div");
buttonGroup.style.display = "flex";
buttonGroup.style.alignItems = "center";
buttonGroup.appendChild(downloadBtnWrapper);
buttonGroup.appendChild(fontSizeSelect);
buttonGroup.appendChild(btnReset);
buttonGroup.appendChild(translationToggleBtn);
buttonGroup.appendChild(playbackToggleBtn);
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
    p.parentNode.insertBefore(translationDiv, p.nextSibling);
  }));

  lastTranslatedLang = targetLang;
  translationPresent = true;

  translateBtn.disabled = false;
  isTranslating = false;
}
    // Translator Controls Container
const translatorWrapper = document.createElement("div");
translatorWrapper.id = "lyrics-plus-translator-wrapper";
translatorWrapper.style.display = "block";
translatorWrapper.style.background = "#121212";
translatorWrapper.style.borderBottom = "1px solid #333";
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
} else {
  translatorWrapper.style.maxHeight = "0";
  translatorWrapper.style.pointerEvents = "none";
  translatorWrapper.style.padding = "0 12px";
}
    translatorWrapper.appendChild(translationControls);

translationToggleBtn.onclick = () => {
  translatorVisible = !translatorVisible;
  localStorage.setItem('lyricsPlusTranslatorVisible', JSON.stringify(translatorVisible));
  if (translatorVisible) {
    translatorWrapper.style.maxHeight = "100px";
    translatorWrapper.style.pointerEvents = "";
    translatorWrapper.style.padding = "8px 12px";
  } else {
    translatorWrapper.style.maxHeight = "0";
    translatorWrapper.style.pointerEvents = "none";
    translatorWrapper.style.padding = "0 12px";
  }
};

// Offset Setting UI
const offsetWrapper = document.createElement("div");
offsetWrapper.style.display = "flex";
offsetWrapper.style.alignItems = "center";
offsetWrapper.style.justifyContent = "space-between";
offsetWrapper.style.padding = "8px 12px";
offsetWrapper.style.background = "#121212";
offsetWrapper.style.borderBottom = "1px solid #333";
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

    const OFFSET_WRAPPER_PADDING = "8px 12px";

    offsetToggleBtn.onclick = () => {
      offsetVisible = !offsetVisible;
      localStorage.setItem('lyricsPlusOffsetVisible', JSON.stringify(offsetVisible));
      if (offsetVisible) {
        offsetWrapper.style.maxHeight = "100px";
        offsetWrapper.style.pointerEvents = "";
        offsetWrapper.style.padding = "8px 12px";
      } else {
        offsetWrapper.style.maxHeight = "0";
        offsetWrapper.style.pointerEvents = "none";
        offsetWrapper.style.padding = "0 12px";
      }
    };

    playbackToggleBtn.onclick = () => {
      controlsVisible = !controlsVisible;
      localStorage.setItem('lyricsPlusControlsVisible', JSON.stringify(controlsVisible));
      if (controlsVisible) {
        controlsBar.style.maxHeight = "80px";
        controlsBar.style.opacity = "1";
        controlsBar.style.pointerEvents = "";
      } else {
        controlsBar.style.maxHeight = "0";
        controlsBar.style.opacity = "0";
        controlsBar.style.pointerEvents = "none";
      }
    };

    if (offsetVisible) {
      offsetWrapper.style.maxHeight = "100px";
      offsetWrapper.style.pointerEvents = "";
      offsetWrapper.style.padding = "8px 12px";
    } else {
      offsetWrapper.style.maxHeight = "0";
      offsetWrapper.style.pointerEvents = "none";
      offsetWrapper.style.padding = "0 12px";
    }

    if (controlsVisible) {
      controlsBar.style.maxHeight = "80px";
      controlsBar.style.opacity = "1";
      controlsBar.style.pointerEvents = "";
    } else {
      controlsBar.style.maxHeight = "0";
      controlsBar.style.opacity = "0";
      controlsBar.style.pointerEvents = "none";
    }

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
      button.style.color = "#1db954"; // keep green
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
  // List of selectors per command, covering desktop and mobile
  const selectors = {
    playpause: [
      '[aria-label="Play"]',
      '[aria-label="Pause"]',
      '[data-testid="control-button-playpause"]',
      '[data-testid="mobile-play-button"]',
      '[data-testid="mobile-pause-button"]'
    ],
    next: [
      '[aria-label="Next"]',
      '[data-testid="control-button-skip-forward"]',
      '[data-testid="mobile-next-button"]'
    ],
    previous: [
      '[aria-label="Previous"]',
      '[data-testid="control-button-skip-back"]',
      '[data-testid="mobile-prev-button"]'
    ],
    repeat: [
      '[aria-label="Enable repeat"]',
      '[aria-label="Enable repeat one"]',
      '[aria-label="Disable repeat"]',
      '[data-testid="control-button-repeat"]'
    ]
  };

  let btn = null;

  if (command === "shuffle") {
    // Always re-query the DOM for the currently visible shuffle button
    btn = Array.from(document.querySelectorAll('button[aria-label]')).find(button => {
      if (button.offsetParent === null) return false;
      const ariaLabel = button.getAttribute('aria-label');
      if (!ariaLabel) return false;
      const lower = ariaLabel.toLowerCase();
      return lower.includes('enable shuffle') ||
             lower.includes('enable smart shuffle') ||
             lower.includes('disable shuffle');
    });
  } else if (command === "playpause") {
    // Prefer specific selectors for playpause
    btn = document.querySelector('[data-testid="control-button-playpause"]')
       || document.querySelector('[aria-label="Play"]')
       || document.querySelector('[aria-label="Pause"]');
    // Only fallback if ALL of the above fail:
    if (!btn) {
      btn = Array.from(document.querySelectorAll("button"))
        .find(b => /play|pause/i.test(b.textContent) && b.offsetParent !== null);
    }
  } else {
    // For other commands, use selectors
    for (const sel of selectors[command] || []) {
      btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null) break;
    }
  }

  if (btn) {
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

    const { button: btnPrevious, iconWrapper: prevIconWrapper } = createSpotifyControlButton(
      "previous",
      "Previous",
      () => sendSpotifyCommand("previous")
    );
    prevIconWrapper.appendChild(previousSVG.cloneNode(true));

    const { button: btnPlayPause, iconWrapper: playIconWrapper } = createPlayPauseButton(
      () => {
        sendSpotifyCommand("playpause");
        setTimeout(() => updatePlayPauseButton(btnPlayPause, playIconWrapper), 100);
      }
    );

    const { button: btnNext, iconWrapper: nextIconWrapper } = createSpotifyControlButton(
      "next",
      "Next",
      () => sendSpotifyCommand("next")
    );
    nextIconWrapper.appendChild(nextSVG.cloneNode(true));

    const { button: btnRepeat, iconWrapper: repeatIconWrapper } = createSpotifyControlButton(
      "repeat",
      "Enable repeat",
      () => {
        sendSpotifyCommand("repeat");
        setTimeout(() => updateRepeatButton(btnRepeat, repeatIconWrapper), 100);
      }
    );

    // Initialize button states
    updateShuffleButton(btnShuffle, shuffleIconWrapper);
    updatePlayPauseButton(btnPlayPause, playIconWrapper);
    updateRepeatButton(btnRepeat, repeatIconWrapper);

    // Store references for later updates
    popup._shuffleBtn = { button: btnShuffle, iconWrapper: shuffleIconWrapper };
    popup._playPauseBtn = { button: btnPlayPause, iconWrapper: playIconWrapper };
    popup._repeatBtn = { button: btnRepeat, iconWrapper: repeatIconWrapper };

    controlsBar.appendChild(btnShuffle);
    controlsBar.appendChild(btnPrevious);
    controlsBar.appendChild(btnPlayPause);
    controlsBar.appendChild(btnNext);
    controlsBar.appendChild(btnRepeat);

    popup.appendChild(headerWrapper);
    popup.appendChild(offsetWrapper);
    popup.appendChild(translatorWrapper);
    popup.appendChild(lyricsContainer);
    popup.appendChild(controlsBar);

    const container = document.querySelector('.main-view-container');
if (container) {
  container.appendChild(popup);
} else {
  document.body.appendChild(popup);
}

   function savePopupState(el) {
  const rect = el.getBoundingClientRect();
  // Save original height, not reduced height
  let heightToSave = rect.height;
  if (el._bannerAdjusted && isMobileDevice()) {
    const bannerHeight = getBannerHeight();
    if (bannerHeight > 0) {
      heightToSave = rect.height + bannerHeight;
    }
  }
  localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: heightToSave
  }));
}

    (function makeDraggable(el, handle) {
      let isDragging = false;
      let startX, startY;
      let origX, origY;
      handle.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
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
      window.addEventListener("mouseup", () => {
        if (isDragging) {
          isDragging = false;
          document.body.style.userSelect = "";
          savePopupState(el);
        }
      });
    })(popup, headerWrapper);

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
    popup.appendChild(resizer);

    (function makeResizable(el, handle) {
      let isResizing = false;
      let startX, startY;
      let startWidth, startHeight;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        isResizing = true;
        window.lyricsPlusPopupIsResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = el.offsetWidth;
        startHeight = el.offsetHeight;
        document.body.style.userSelect = "none";
      });
      window.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newWidth = startWidth + dx;
        let newHeight = startHeight + dy;
        newWidth = Math.max(newWidth, 200);
        newHeight = Math.max(newHeight, 100);
        newWidth = Math.min(newWidth, window.innerWidth - el.getBoundingClientRect().left);
        newHeight = Math.min(newHeight, window.innerHeight - el.getBoundingClientRect().top);
        el.style.width = newWidth + "px";
        el.style.height = newHeight + "px";
      });
      window.addEventListener("mouseup", () => {
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
    
    // Setup mobile banner detection and adjustment
    setupMobileBannerObserver(popup);

    const info = getCurrentTrackInfo();
    if (info) {
  currentTrackId = info.id;
  const lyricsContainer = popup.querySelector("#lyrics-plus-content");
  if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
  autodetectProviderAndLoad(popup, info);
}
    startPollingForTrackChange(popup);
  }

 async function updateLyricsContent(popup, info) {
  if (!info) return;
  const lyricsContainer = popup.querySelector("#lyrics-plus-content");
  if (!lyricsContainer) return;
  currentLyricsContainer = lyricsContainer;
  currentSyncedLyrics = null;
  currentUnsyncedLyrics = null;
  lyricsContainer.textContent = "Loading lyrics...";

  const downloadBtn = popup.querySelector('button[title="Download lyrics"]');
  const downloadDropdown = downloadBtn ? downloadBtn._dropdown : null;

  const provider = Providers.getCurrent();
  const result = await provider.findLyrics(info);

  if (result.error) {
    lyricsContainer.textContent = result.error;
    if (downloadBtn) downloadBtn.style.display = "none";
    if (downloadDropdown) downloadDropdown.style.display = "none";
    return;
  }

  let synced = provider.getSynced(result);
  let unsynced = provider.getUnsynced(result);

  lyricsContainer.innerHTML = "";
  // Set globals for download
  currentSyncedLyrics = (synced && synced.length > 0) ? synced : null;
  currentUnsyncedLyrics = (unsynced && unsynced.length > 0) ? unsynced : null;

  if (currentSyncedLyrics) {
    isShowingSyncedLyrics = true;
    currentSyncedLyrics.forEach(({ text }) => {
      const p = document.createElement("p");
      p.textContent = text;
      p.style.margin = "0 0 6px 0";
      p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
      lyricsContainer.appendChild(p);
    });
    highlightSyncedLyrics(currentSyncedLyrics, lyricsContainer);
  } else if (currentUnsyncedLyrics) {
    isShowingSyncedLyrics = false;
    currentUnsyncedLyrics.forEach(({ text }) => {
      const p = document.createElement("p");
      p.textContent = text;
      p.style.margin = "0 0 6px 0";
      p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
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

  // Show/hide download button appropriately - only use the variables already declared above!
  if (downloadBtn) {
    if (lyricsContainer.querySelectorAll('p').length > 0) {
      downloadBtn.style.display = "inline-flex";
    } else {
      downloadBtn.style.display = "none";
      if (downloadDropdown) downloadDropdown.style.display = "none";
    }
  }
}
  // Change priority order of providers
  async function autodetectProviderAndLoad(popup, info) {
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
    const provider = Providers.map[name];
    const result = await provider.findLyrics(info);
    if (result && !result.error) {
      let lyrics = provider[type](result);
      if (lyrics && lyrics.length > 0) {
        Providers.setCurrent(name);
        if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
        await updateLyricsContent(popup, info);
        return;
      }
    }
  }
  // Unselect any provider
Providers.current = null;
if (popup._lyricsTabs) updateTabs(popup._lyricsTabs, true);

const lyricsContainer = popup.querySelector("#lyrics-plus-content");
if (lyricsContainer) lyricsContainer.textContent = "No lyrics were found for this track from any of the available providers";
currentSyncedLyrics = null;
currentLyricsContainer = lyricsContainer;
}

  function startPollingForTrackChange(popup) {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      const info = getCurrentTrackInfo();
      if (!info) return;
      if (info.id !== currentTrackId) {
        currentTrackId = info.id;
        const lyricsContainer = popup.querySelector("#lyrics-plus-content");
        if (lyricsContainer) lyricsContainer.textContent = "Loading lyrics...";
        autodetectProviderAndLoad(popup, info);
      }

      // Update all button states
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
    }, 400);
  }


  function stopPollingForTrackChange() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

   function addButton(maxRetries = 10) {
  let attempts = 0;
  const tryAdd = () => {
    const nowPlayingViewBtn = document.querySelector('[data-testid="control-button-npv"]');
    const micBtn = document.querySelector('[data-testid="lyrics-button"]');
    const targetBtn = nowPlayingViewBtn || micBtn;
    const controls = targetBtn?.parentElement;
    if (!controls) {
      if (attempts < maxRetries) {
        attempts++;
        setTimeout(tryAdd, 1000);
      } else {
        console.warn("Lyrics+ button: Failed to find controls after max retries.");
      }
      return;
    }
    if (document.getElementById("lyrics-plus-btn")) return;
    const btn = document.createElement("button");
    btn.id = "lyrics-plus-btn";
    btn.title = "Show Lyrics+";
    btn.textContent = "Lyrics+";
    Object.assign(btn.style, {
      backgroundColor: "#1db954",
      border: "none",
      borderRadius: "20px",
      color: "white",
      cursor: "pointer",
      fontWeight: "600",
      fontSize: "14px",
      padding: "6px 12px",
      marginLeft: "8px",
      userSelect: "none",
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

  const observer = new MutationObserver(() => {
    addButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function init() {
    addButton();
  }

  const appRoot = document.querySelector('#main');
  if (appRoot) {
    const pageObserver = new MutationObserver(() => {
      addButton();
    });
    pageObserver.observe(appRoot, { childList: true, subtree: true });
  }

  init();
})();
(function setupPopupAutoResize() {
  window.lyricsPlusPopupIgnoreProportion = false;
  // The popup will always keep the same proportion of the window as last set by the user.
  window.lastProportion = window.lastProportion || { w: null, h: null };

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

  function saveProportionFromPopup(popup) {
  if (!popup) return;
  window.lastProportion = {
    w: popup.offsetWidth / window.innerWidth,
    h: popup.offsetHeight / window.innerHeight
  };
  // Clamp to [0.2,1] for sanity (optional)
  window.lastProportion.w = Math.max(0.2, Math.min(window.lastProportion.w, 1));
  window.lastProportion.h = Math.max(0.2, Math.min(window.lastProportion.h, 1));
  localStorage.setItem("lyricsPlusPopupProportion", JSON.stringify(window.lastProportion));
}

  function applyProportionToPopup(popup) {
  if (window.lyricsPlusPopupIsResizing || window.lyricsPlusPopupIgnoreProportion) {
    return;
  }
  if (!popup || !window.lastProportion.w || !window.lastProportion.h) {
    return;
  }
  popup.style.width = (window.innerWidth * window.lastProportion.w) + "px";
  popup.style.height = (window.innerHeight * window.lastProportion.h) + "px";
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
  resizer.addEventListener("mousedown", () => { isResizing = true; });
  window.addEventListener("mouseup", () => {
    if (isResizing) {
      saveProportionFromPopup(popup);
    }
    isResizing = false;
  });
}

  // Listen for popup creation to hook the resizer
  const popupObserver = new MutationObserver(() => {
  const popup = document.getElementById("lyrics-plus-popup");
  if (popup) {
    applyProportionToPopup(popup);
    observePopupResize();
  }
});
popupObserver.observe(document.body, { childList: true, subtree: true });

  // On window resize, apply saved proportion
  window.addEventListener("resize", () => {
    const popup = document.getElementById("lyrics-plus-popup");
    if (popup) {
      applyProportionToPopup(popup);
    }
  });
})();
