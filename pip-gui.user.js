// ==UserScript==
// @name         Spotify Lyrics+ Stable
// @namespace    http://tampermonkey.net/
// @version      5.0.test
// @description  Display synced and unsynced lyrics from multiple sources (LRCLIB, KPoe, Musixmatch, Genius) in a floating popup on Spotify Web. Line by line lyric translation.
// @match        https://open.spotify.com/*
// @grant        none
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js
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
  let currentLyricsContainer = null;
  let lastTranslatedLang = null;
  let translationPresent = false;

  // ------------------------
  // Utils.js FUNCTIONS (ported & safe for userscript)
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

  // ------------------------
  // Utility Functions
  // ------------------------

  function getCurrentTrackInfo() {
    const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
    const durationEl = document.querySelector('[data-testid="playback-duration"]');
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
    return Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 300);
  }
  function setAnticipationOffset(val) {
    localStorage.setItem("lyricsPlusAnticipationOffset", val);
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
      const posEl = document.querySelector('[data-testid="playback-position"]');
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
        });
        return;
      }
      pElements.forEach((p, idx) => {
        p.style.color = (idx === activeIndex) ? "#1db954" : "white";
        p.style.fontWeight = (idx === activeIndex) ? "700" : "400";
      });
      const activeP = pElements[activeIndex];
      if (activeP) {
        activeP.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }

  function updateTabs(tabsContainer) {
    [...tabsContainer.children].forEach(btn => {
      btn.style.backgroundColor = (btn.textContent === Providers.current) ? "#1db954" : "#333";
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

  // --- Play/Pause Icon Updater ---
  function updatePlayPauseIcon(btnPlayPause) {
  // Try all likely selectors for both desktop and mobile
  // These selectors may need to be updated if Spotify changes their UI
  const pauseBtns = [
    '[aria-label="Pause"]',
    '[data-testid="mobile-pause-button"]',
    '[data-testid="control-button-playpause"][aria-label="Pause"]'
  ];
  const playBtns = [
    '[aria-label="Play"]',
    '[data-testid="mobile-play-button"]',
    '[data-testid="control-button-playpause"][aria-label="Play"]'
  ];

  // Helper to find a visible button from a list of selectors
  function getVisibleButton(selectors) {
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && btn.offsetParent !== null && window.getComputedStyle(btn).display !== "none" && window.getComputedStyle(btn).visibility !== "hidden") {
        return btn;
      }
    }
    return null;
  }

  // Determine state
  const pauseBtn = getVisibleButton(pauseBtns);
  const playBtn = getVisibleButton(playBtns);

  btnPlayPause.innerHTML = "";
  if (pauseBtn) {
    btnPlayPause.appendChild(pauseSVG.cloneNode(true));
  } else if (playBtn) {
    btnPlayPause.appendChild(playSVG.cloneNode(true));
  } else {
    // fallback: check aria-label on any visible play/pause button
    const fallback = Array.from(document.querySelectorAll('button'))
      .find(b =>
        /pause|play/i.test(b.getAttribute('aria-label') || '') &&
        b.offsetParent !== null &&
        window.getComputedStyle(b).display !== "none" &&
        window.getComputedStyle(b).visibility !== "hidden"
      );
    if (fallback && /pause/i.test(fallback.getAttribute('aria-label') || '')) {
      btnPlayPause.appendChild(pauseSVG.cloneNode(true));
    } else {
      btnPlayPause.appendChild(playSVG.cloneNode(true));
    }
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
    if (songInfo.album && !tryWithoutAlbum) {
      params.push(`album_name=${encodeURIComponent(songInfo.album)}`);
    }
    if (songInfo.duration) {
      params.push(`duration=${Math.floor(songInfo.duration / 1000)}`);
    }
    const url = `https://lrclib.net/api/get?${params.join('&')}`;
    const response = await fetch(url, {
      headers: {
        "x-user-agent": "lyrics-plus-script"
      }
    });
    if (!response.ok) return null;
    return await response.json();
  }
  const ProviderLRCLIB = {
    async findLyrics(info) {
      try {
        let data = await fetchLRCLibLyrics(info, false);
        if (!data || (!data.syncedLyrics && !data.plainLyrics)) {
          data = await fetchLRCLibLyrics(info, true); // try without album
        }
        if (!data) return { error: "Lyrics not found on LRCLIB" };
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
        if (!result) return { error: "Lyrics not found on KPoe" };
        return parseKPoeFormat(result);
      } catch (e) {
        return { error: e.message };
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
  function getMusixmatchToken() {
  let token = localStorage.getItem("lyricsPlusMusixmatchToken");
  if (!token) {
    token = prompt("Enter your Musixmatch user token:", "");
    if (token) {
      localStorage.setItem("lyricsPlusMusixmatchToken", token);
    }
  }
  return token;
}

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
      4. Go to the Network tab &gt; www.musixmatch.com &gt; Cookies.<br>
      3. Right-click on the content of the musixmatchUserToken and select Copy value.<br>
      4. Go to <a href="https://jsonformatter.curiousconcept.com/" target="_blank">JSON Formatter</a> &gt; Paste the content &gt; Click Process.<br>
      5. Copy the value of web-desktop-app-v1.0 > Paste the token below and press Save.<br>
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

  async function fetchMusixmatchLyrics(songInfo) {
    const token = getMusixmatchToken(false); // false = don't show prompt automatically
if (!token) {
  showMusixmatchTokenModal();
  return { error: "No Musixmatch token set." };
}
    const baseURL =
      "https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=web-desktop-app-v1.0&";
    const durr = Math.floor(songInfo.duration / 1000);
    const params = [
      `q_album=${encodeURIComponent(songInfo.album)}`,
      `q_artist=${encodeURIComponent(songInfo.artist)}`,
      `q_artists=${encodeURIComponent(songInfo.artist)}`,
      `q_track=${encodeURIComponent(songInfo.title)}`,
      `q_duration=${durr}`,
      `f_subtitle_length=${durr}`,
      `usertoken=${encodeURIComponent(token)}`
    ];
    const finalURL = baseURL + params.join("&");
    let response = await fetch(finalURL, {
      headers: {
        'authority': 'apic-desktop.musixmatch.com',
        'cookie': `x-mxm-token-guid=; usertoken=${token}`,
        'user-agent': navigator.userAgent
      }
    });
    if (!response.ok) return { error: "No lyrics" };
    let body = await response.json();
    if (!body?.message?.body?.macro_calls) return { error: "No lyrics" };
    return body.message.body.macro_calls;
  }
  function musixmatchGetSynced(body) {
    const meta = body?.["matcher.track.get"]?.message?.body;
    if (!meta) return null;
    const hasSynced = meta?.track?.has_subtitles;
    const isInstrumental = meta?.track?.instrumental;
    if (isInstrumental) {
      return [{ text: "♪ Instrumental ♪", startTime: "0000" }];
    }
    if (hasSynced) {
      const subtitle = body["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle;
      if (!subtitle) return null;
      return JSON.parse(subtitle.subtitle_body).map(line => ({
        text: line.text || "♪",
        time: line.time.total * 1000,
        startTime: line.time.total * 1000,
      }));
    }
    return null;
  }
  function musixmatchGetUnsynced(body) {
    const meta = body?.["matcher.track.get"]?.message?.body;
    if (!meta) return null;
    const hasUnSynced = meta.track.has_lyrics || meta.track.has_lyrics_crowd;
    const isInstrumental = meta?.track?.instrumental;
    if (isInstrumental) return [{ text: "♪ Instrumental ♪" }];
    if (hasUnSynced) {
      const lyrics = body["track.lyrics.get"]?.message?.body?.lyrics?.lyrics_body;
      if (!lyrics) return null;
      return lyrics.split("\n").map(t => ({ text: t }));
    }
    return null;
  }
  const ProviderMusixmatch = {
    async findLyrics(info) {
      try {
        const data = await fetchMusixmatchLyrics(info);
        if (!data || data.error) return { error: data.error || "Lyrics not found on Musixmatch" };
        return data;
      } catch (e) {
        return { error: e.message };
      }
    },
    getUnsynced: musixmatchGetUnsynced,
    getSynced: musixmatchGetSynced
  };

  // --- Netease ---
// async function fetchNeteaseLyrics(info) {
//   const searchURL = "https://music.xianqiao.wang/neteaseapiv2/search?limit=10&type=1&keywords=";
//   const lyricURL = "https://music.xianqiao.wang/neteaseapiv2/lyric?id=";
//   const cleanTitle = Utils.removeExtraInfo(Utils.removeSongFeat(Utils.normalize(info.title)));
//   const finalURL = searchURL + encodeURIComponent(`${cleanTitle} ${info.artist}`);
//   const searchResults = await fetch(finalURL);
//   if (!searchResults.ok) throw new Error("Cannot find track");
//   const searchJson = await searchResults.json();
//   const items = searchJson.result.songs;
//   if (!items?.length) throw new Error("Cannot find track");

//   // Try to match by album (normalized)
//   const neAlbumName = Utils.normalize(info.album);
//   const expectedAlbumName = Utils.containsHanCharacter(neAlbumName) ? await Utils.toSimplifiedChinese(neAlbumName) : neAlbumName;
//   let itemId = items.findIndex((val) => Utils.normalize(val.album.name) === expectedAlbumName);
//   if (itemId === -1) itemId = items.findIndex((val) => Math.abs(info.duration - val.duration) < 3000);
//   if (itemId === -1) itemId = items.findIndex((val) => val.name === cleanTitle);
//   if (itemId === -1) throw new Error("Cannot find track");
//   const lyricRes = await fetch(lyricURL + items[itemId].id);
//   if (!lyricRes.ok) throw new Error("Lyrics fetch failed");
//   return await lyricRes.json();
// }
// function parseNeteaseSynced(list) {
//   const lyricStr = list?.lrc?.lyric;
//   if (!lyricStr) return null;
//   const lines = lyricStr.split(/\r?\n/).map(line => line.trim());
//   const lyrics = lines
//     .map(line => {
//       const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
//       if (!match) return null;
//       const min = Number(match[1]);
//       const sec = Number(match[2]);
//       const ms = match[3] ? Number(match[3].padEnd(3, '0')) : 0;
//       return {
//         text: match[4] || "",
//         time: min * 60000 + sec * 1000 + ms,
//         startTime: min * 60000 + sec * 1000 + ms,
//       };
//     })
//     .filter(Boolean);
//   return lyrics.length ? lyrics : null;
// }
// function parseNeteaseUnsynced(list) {
//   const lyricStr = list?.lrc?.lyric;
//   if (!lyricStr) return null;
//   const lines = lyricStr.split(/\r?\n/).map(line => line.trim());
//   const lyrics = lines
//     .map(line => {
//       const match = line.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?]\s*(.*)$/);
//       if (!match) {
//         if (!line) return null;
//         return { text: line.trim() };
//       }
//       return { text: match[4] };
//     })
//     .filter(Boolean);
//   return lyrics.length ? lyrics : null;
// }
// const ProviderNetease = {
//   async findLyrics(info) {
//     try {
//       const data = await fetchNeteaseLyrics(info);
//       if (!data) return { error: "Lyrics not found on Netease" };
//       return data;
//     } catch (e) {
//       return { error: e.message || "Netease fetch failed" };
//     }
//   },
//   getUnsynced: parseNeteaseUnsynced,
//   getSynced: parseNeteaseSynced
// };
//
  // --- Genius ---
  async function fetchGeniusLyrics(info) {
    const titles = new Set([info.title]);
    titles.add(Utils.removeExtraInfo(info.title));
    titles.add(Utils.removeSongFeat(info.title));
    titles.add(Utils.removeSongFeat(Utils.removeExtraInfo(info.title)));
    for (const title of titles) {
      const searchUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(info.artist)}/${encodeURIComponent(title)}`;
      try {
        const fetchPromise = fetch(searchUrl);
        const res = await Promise.race([fetchPromise, timeoutPromise(1500)]);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.lyrics) {
          return { plainLyrics: data.lyrics };
        }
      } catch (e) {
        continue;
      }
    }
    return { error: "Lyrics not found on Genius" };
  }
  function parseGeniusLyrics(raw) {
    return Utils.parseLocalLyrics(raw);
  }
  const ProviderGenius = {
    async findLyrics(info) {
      try {
        const data = await fetchGeniusLyrics(info);
        if (!data || data.error) return { error: data.error || "Lyrics not found on Genius" };
        return data;
      } catch (e) {
        return { error: e.message };
      }
    },
    getUnsynced(body) {
      if (!body?.plainLyrics) return null;
      return parseGeniusLyrics(body.plainLyrics).unsynced;
    },
    getSynced() {
      return null;
    }
  };

  // --- Providers List ---
const Providers = {
  list: ["LRCLIB", "KPoe", "Musixmatch", /*"Netease",*/ "Genius"],
  map: {
    "LRCLIB": ProviderLRCLIB,
    "KPoe": ProviderKPoe,
    "Musixmatch": ProviderMusixmatch,
    // "Netease": ProviderNetease,
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
      existing.remove();
    }
  }

 function observeSpotifyPlayPause(popup) {
  if (!popup || !popup._playPauseBtn) return;
  if (popup._playPauseObserver) popup._playPauseObserver.disconnect();

  // Try desktop first, then mobile
  let spBtn = document.querySelector('[aria-label="Play"], [aria-label="Pause"]');
  if (!spBtn) spBtn = document.querySelector('[data-testid="control-button-playpause"]');
  if (!spBtn) spBtn = document.querySelector('[data-testid="mobile-play-button"], [data-testid="mobile-pause-button"]');
  if (!spBtn) return;
  const observer = new MutationObserver(() => {
    if (popup._playPauseBtn) updatePlayPauseIcon(popup._playPauseBtn);
  });
  observer.observe(spBtn, { attributes: true, attributeFilter: ['aria-label', 'class'] });
  popup._playPauseObserver = observer;
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
    }

    const popup = document.createElement("div");
    popup.id = "lyrics-plus-popup";
    Object.assign(popup.style, {
      position: "fixed",
      bottom: pos ? "auto" : "90px",
      right: pos ? "auto" : "20px",
      left: pos ? `${pos.left}px` : "",
      top: pos ? `${pos.top}px` : "",
      width: pos ? `${pos.width}px` : "400px",
      height: pos ? `${pos.height}px` : "60vh",
      backgroundColor: "rgba(18, 18, 18, 0.95)",
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

// --- Translation controls dropdown, translate button, and remove translation button ---
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

    // Font size selector
    const fontSizeSelect = document.createElement("select");
    fontSizeSelect.title = "Change lyrics font size";
    fontSizeSelect.style.marginRight = "6px";
    fontSizeSelect.style.cursor = "pointer";
    fontSizeSelect.style.background = "#121212";
    fontSizeSelect.style.border = "none";
    fontSizeSelect.style.color = "white";
    fontSizeSelect.style.fontSize = "14px";
    fontSizeSelect.style.lineHeight = "1";
    ["16", "22", "28", "38"].forEach(size => {
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

    // Translation Toggle Button
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

    header.appendChild(title);

    // Button group right side
    const buttonGroup = document.createElement("div");
    buttonGroup.style.display = "flex";
    buttonGroup.style.alignItems = "center";
    buttonGroup.appendChild(playbackToggleBtn);
    buttonGroup.appendChild(offsetToggleBtn);
    buttonGroup.appendChild(closeBtn);

    header.appendChild(buttonGroup);
    headerWrapper.appendChild(header);
    buttonGroup.insertBefore(fontSizeSelect, playbackToggleBtn);
    buttonGroup.insertBefore(translationToggleBtn, playbackToggleBtn);

    // Tabs container
    const tabs = document.createElement("div");
    tabs.style.display = "flex";
    tabs.style.marginTop = "12px";
    tabs.style.gap = "8px";

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
  btn.onclick = async () => {
    Providers.setCurrent(name);
    updateTabs(tabs);
    await updateLyricsContent(popup, getCurrentTrackInfo());
  };
  // Double-click (desktop/mobile) for Musixmatch settings
  if (name === "Musixmatch") {
    btn.ondblclick = (e) => {
      e.preventDefault();
      showMusixmatchTokenModal();
    };
  }
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
      padding: "12px",
      whiteSpace: "pre-wrap",
      fontSize: "22px",
      lineHeight: "1.5",
      backgroundColor: "#121212",
      userSelect: "text",
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
}

async function translateLyricsInPopup() {
  if (!lyricsContainer) return;
  const targetLang = getSavedTranslationLang();

  // Prevent double translation on the same language
  if (translationPresent && lastTranslatedLang === targetLang) return;

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

    const offsetInput = document.createElement("input");
    offsetInput.type = "number";
    offsetInput.min = "-2000";
    offsetInput.max = "2000";
    offsetInput.step = "10";
    offsetInput.value = getAnticipationOffset();
    offsetInput.style.width = "70px";
    offsetInput.style.background = "#222";
    offsetInput.style.color = "#fff";
    offsetInput.style.border = "1px solid #444";
    offsetInput.style.borderRadius = "6px";
    offsetInput.style.padding = "2px 6px";
    offsetInput.style.marginLeft = "16px";
    offsetInput.addEventListener("change", () => {
      setAnticipationOffset(offsetInput.value);
      if (currentSyncedLyrics && currentLyricsContainer) {
        highlightSyncedLyrics(currentSyncedLyrics, currentLyricsContainer);
      }
    });
    offsetWrapper.appendChild(offsetLabel);
    offsetWrapper.appendChild(offsetInput);

    // Playback Controls Bar
    const controlsBar = document.createElement("div");
    Object.assign(controlsBar.style, {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "12px",
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

    function createControlBtn(content, title, onClick) {
      const btn = document.createElement("button");
      btn.title = title;
      Object.assign(btn.style, {
        cursor: "pointer",
        background: "#1db954",
        border: "none",
        borderRadius: "50%",
        width: "32px",
        height: "32px",
        color: "white",
        fontWeight: "bold",
        fontSize: "18px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        userSelect: "none",
        padding: "0",
      });
      if (typeof content === "string") {
        btn.textContent = content;
      } else {
        btn.appendChild(content);
      }
      btn.onclick = onClick;
      return btn;
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
    ]
  };

  // Try all selectors for the current command
  let btn = null;
  for (const sel of selectors[command] || []) {
    btn = document.querySelector(sel);
    if (btn && btn.offsetParent !== null) break; // Only pick visible
  }

  // Fallback: try to find button by innerText (mobile sometimes uses text)
  if (!btn && command === "playpause") {
    btn = Array.from(document.querySelectorAll("button"))
      .find(b => /play|pause/i.test(b.textContent) && b.offsetParent !== null);
  }

  if (btn) {
    // Try click, then fallback to synthetic touch events for mobile
    btn.click();
    // If still not playing, try touch events
    if (btn.offsetParent !== null && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      btn.dispatchEvent(new TouchEvent('touchstart', {bubbles:true, cancelable:true}));
      btn.dispatchEvent(new TouchEvent('touchend', {bubbles:true, cancelable:true}));
    }
  } else {
    alert("Could not find the Spotify playback button. If you're on mobile, try updating Spotify Web Player or refreshing the page.");
    console.warn("Spotify control button not found for:", command);
  }
}
    function createPlayPauseButton() {
      const btnPlayPause = createControlBtn("", "Play/Pause", () => {
        sendSpotifyCommand("playpause");
        updatePlayPauseIcon(btnPlayPause);
      });
      btnPlayPause.innerHTML = "";
      btnPlayPause.appendChild(playSVG.cloneNode(true));
      updatePlayPauseIcon(btnPlayPause);
      return btnPlayPause;
    }

    const btnPrevious = createControlBtn("⏮", "Previous Track", () => sendSpotifyCommand("previous"));
    const btnPlayPause = createPlayPauseButton();
    const btnNext = createControlBtn("⏭", "Next Track", () => sendSpotifyCommand("next"));

    popup._playPauseBtn = btnPlayPause;


    const btnReset = document.createElement("button");
    btnReset.textContent = "↻";
    btnReset.title = "Restore Default Position and Size";
    Object.assign(btnReset.style, {
      cursor: "pointer",
      background: "#555",
      border: "none",
      borderRadius: "50%",
      width: "32px",
      height: "32px",
      color: "white",
      fontWeight: "bold",
      fontSize: "18px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      userSelect: "none",
      padding: "0",
    });
    // Default Position and Size of the Popup Gui
    btnReset.onclick = () => {
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
    Object.assign(popup.style, {
      position: "fixed",
      left: "7vw",
      right: "5vw",
      top: "auto",
      bottom: "190px",
      width: "210vw",
      height: "100vh",
      zIndex: 100000
    });
  } else {
    Object.assign(popup.style, {
      position: "fixed",
      bottom: "87px",
      right: "0px",
      left: "auto",
      top: "auto",
      width: "302.5px",
      height: "79.5vh",
      zIndex: 100000
    });
  }
  savePopupState(popup);
};

    controlsBar.appendChild(btnReset);
    controlsBar.appendChild(btnPrevious);
    controlsBar.appendChild(btnPlayPause);
    controlsBar.appendChild(btnNext);

    popup.appendChild(headerWrapper);
    popup.appendChild(offsetWrapper);
    popup.appendChild(translatorWrapper);
    popup.appendChild(lyricsContainer);
    popup.appendChild(controlsBar);

    document.body.appendChild(popup);

    function savePopupState(el) {
      const rect = el.getBoundingClientRect();
      localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
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
        }
      });
    })(popup, resizer);

    observeSpotifyPlayPause(popup);

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
    lyricsContainer.textContent = "Loading lyrics...";
    const provider = Providers.getCurrent();
    const result = await provider.findLyrics(info);
    if (result.error) {
      lyricsContainer.textContent = `Error: ${result.error}`;
      return;
    }
    let synced = provider.getSynced(result);
    let unsynced = provider.getUnsynced(result);
    lyricsContainer.innerHTML = "";
    if (synced && synced.length > 0) {
      synced.forEach(({ text }) => {
        const p = document.createElement("p");
        p.textContent = text;
        p.style.margin = "0 0 6px 0";
        lyricsContainer.appendChild(p);
      });
      currentSyncedLyrics = synced;
      highlightSyncedLyrics(synced, lyricsContainer);
    } else if (unsynced && unsynced.length > 0) {
      unsynced.forEach(({ text }) => {
        const p = document.createElement("p");
        p.textContent = text;
        p.style.margin = "0 0 6px 0";
        lyricsContainer.appendChild(p);
      });
      currentSyncedLyrics = null;
    } else {
      lyricsContainer.textContent = "Lyrics not found.";
      currentSyncedLyrics = null;
    }
  }

  // Change priority order of providers
  async function autodetectProviderAndLoad(popup, info) {
  const detectionOrder = [
    { name: "LRCLIB", type: "getSynced" },
    { name: "KPoe", type: "getSynced" },
    { name: "Musixmatch", type: "getSynced" },
    // { name: "Netease", type: "getSynced" },
    { name: "LRCLIB", type: "getUnsynced" },
    { name: "KPoe", type: "getUnsynced" },
    { name: "Musixmatch", type: "getUnsynced" },
    // { name: "Netease", type: "getUnsynced" },
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
  Providers.setCurrent("LRCLIB");
  if (popup._lyricsTabs) updateTabs(popup._lyricsTabs);
  await updateLyricsContent(popup, info);
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
        observeSpotifyPlayPause(popup);
      }
      if (popup && popup._playPauseBtn) updatePlayPauseIcon(popup._playPauseBtn);
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
      const controls = document.querySelector('[data-testid="control-button-skip-forward"]')?.parentElement;
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
      controls.appendChild(btn);
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
