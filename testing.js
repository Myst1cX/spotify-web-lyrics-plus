// ==UserScript==
// @name         Spotify Lyrics+ Stable
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  Display synced and unsynced lyrics from multiple sources (LRCLIB, KPoe, Musixmatch, Genius) in a floating popup on Spotify Web. Line by line lyric translation.
// @match        https://open.spotify.com/*
// @grant        GM_xmlhttpRequest
// @connect      genius.com
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js
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
    return Number(localStorage.getItem("lyricsPlusAnticipationOffset") || 1000);
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
    const activeP = pElements[activeIndex];
    if (activeP) {
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

  // --- Play/Pause Icon Updater ---
  function updatePlayPauseIcon(btnPlayPause) {
  // Use the main play/pause button, which is language universal
  let playPauseBtn = document.querySelector('[data-testid="control-button-playpause"]')
    || document.querySelector('[aria-label]');

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  btnPlayPause.innerHTML = "";

  if (playPauseBtn && isVisible(playPauseBtn)) {
    const label = (playPauseBtn.getAttribute('aria-label') || '').toLowerCase();

    if (labelMeansPause(label)) {
      btnPlayPause.appendChild(pauseSVG.cloneNode(true));
      return;
    } else if (labelMeansPlay(label)) {
      btnPlayPause.appendChild(playSVG.cloneNode(true));
      return;
    }
  }

  // Fallback: Use audio element state if possible
  const audio = document.querySelector('audio');
  if (audio) {
    if (audio.paused) {
      btnPlayPause.appendChild(playSVG.cloneNode(true));
    } else {
      btnPlayPause.appendChild(pauseSVG.cloneNode(true));
    }
    return;
  }

  // Default to play icon
  btnPlayPause.appendChild(playSVG.cloneNode(true));
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
  console.log("LRCLIB request:", url);

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
    console.log("No synced lyrics data found");
    return null;
  }
  console.log("Extracting synced lyrics, lines:", body.synced.length);
  return body.synced.map(line => ({
    text: line.text,
    time: Math.round(line.time ?? line.startTime ?? 0),
  }));
}

// Extract unsynced lyrics from the fetchMusixmatchLyrics result
function musixmatchGetUnsynced(body) {
  if (!body || !body.unsynced) {
    console.log("No unsynced lyrics data found");
    return null;
  }
  console.log("Extracting unsynced lyrics, lines:", body.unsynced.length);
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
//       if (!result) return { error: "No lyrics found for this track from Netease" };
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
  console.log("[Genius] Starting fetchGeniusLyrics");

  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);
  console.log("[Genius] Titles to try:", Array.from(titles));

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
  console.log("[Genius] Included nth-of-type indices:", includedNthIndices);

  // Try up to 5 pages of results for each title variant
  const maxPages = 5;

  for (const title of titles) {
    const cleanTitle = cleanQuery(title);

    for (let page = 1; page <= maxPages; page++) {
      const query = encodeURIComponent(`${info.artist} ${cleanTitle}`);
      const searchUrl = `https://genius.com/api/search/multi?per_page=5&page=${page}&q=${query}`;

      console.log(`[Genius] Querying: ${info.artist} - ${cleanTitle} (page ${page})`);
      console.log(`[Genius] Search URL: ${searchUrl}`);

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

        console.log("[Genius] Search response received");
        const searchJson = JSON.parse(searchRes.responseText);
        const hits = searchJson?.response?.sections?.flatMap(s => s.hits) || [];
        const songHits = hits.filter(h => h.type === "song");
        console.log(`[Genius] Found ${songHits.length} song hits`);

        for (const hit of songHits) {
          const result = hit.result;
          console.log(`- Candidate: Title="${result.title}", Artist="${result.primary_artist?.name}", URL=${result.url}`);
        }

        const targetArtists = new Set(normalizeArtists(info.artist));
        const targetTitleNorm = normalize(Utils.removeExtraInfo(info.title));
        const targetHasVersion = hasVersionKeywords(info.title);
        console.log("[Genius] Normalized target artist tokens:", Array.from(targetArtists));
        console.log("[Genius] Normalized target title:", targetTitleNorm);
        console.log("[Genius] Target title has version keywords:", targetHasVersion);

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

          console.log(`[Genius] → "${result.title}" primary artists:`, primary);
          console.log(`[Genius] → "${result.title}" featured from title:`, featured);

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
              console.log(`[Genius] Boosting artistScore: featured artist "${fa}" recovered from title`);
            }
          }

          if (artistScore < 3) {
            console.log(`[Genius] Candidate rejected due to low artist score (${artistScore})`);
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

          console.log(`[Genius] Candidate "${result.title}":`);
          console.log(`  Artist Score: ${artistScore} (matched ${artistOverlapCount}/${totalArtists},${featured.map(f => targetArtists.has(f) && !resultArtists.has(f) ? ` +1 boost: ${f}` : '').filter(Boolean).join('')})`);
          console.log(`  Title Score: ${titleScore} (normed="${resultTitleNorm}" vs "${targetTitleNorm}", hasVer=${resultHasVersion})`);
          if (penaltyLog.length) {
            console.log(`  Penalties: ${penaltyLog.join(', ')}`);
          }
          console.log(`  Final Score: ${score}`);

          if (score > bestScore && (!targetHasVersion || resultHasVersion)) {
            bestScore = score;
            song = result;
            console.log(`[Genius] New best match: "${result.title}" with score ${bestScore}`);
          } else if (
            score > fallbackScore &&
            (!resultHasVersion || !targetHasVersion) &&
            score >= 6
          ) {
            fallbackScore = score;
            fallbackSong = result;
            console.log(`[Genius] New fallback candidate: "${result.title}" with score ${fallbackScore}`);
          }
        }

        if (!song && fallbackSong) {
          song = fallbackSong;
          bestScore = fallbackScore;
          console.log(`[Genius] Using fallback song: "${song.title}" with score ${bestScore}`);
        }

        if (bestScore < 6 || !song?.url) {
          console.log(`[Genius] Best match score too low (${bestScore}) or no URL found, skipping.`);
          continue;
        }

        console.log(`[Genius] Selected song URL: ${song.url}`);

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

        console.log("[Genius] Song page HTML received");
        const doc = new DOMParser().parseFromString(htmlRes.responseText, "text/html");

        const lyricsRoot = [...doc.querySelectorAll('div')].find(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Root'))
        );

        if (!lyricsRoot) {
          console.warn("[Genius] No .Lyrics__Root found");
          continue;
        }
        console.log("[Genius] .Lyrics__Root found");

        const containers = [...lyricsRoot.querySelectorAll('div')].filter(el =>
          [...el.classList].some(cls => cls.includes('Lyrics__Container'))
        );
        console.log(`[Genius] Found ${containers.length} .Lyrics__Container div(s)`);

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
            console.log(`[Genius] Including container with nth-of-type ${nthIndex}`);
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
        console.log(`[Genius] Using ${relevantContainers.length} relevant container(s)`);

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

        console.log("[Genius] Lyrics successfully extracted");
        return { plainLyrics: lyrics };

      } catch (e) {
        console.error("[Genius] Fetch or parse error:", e);
        continue;
      }
    }
  }

  console.log("[Genius] Lyrics not found after trying all titles and pages");
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
    return parseGeniusLyrics(body.plainLyrics).unsynced;
  },
  getSynced() {
    return null;
  },
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

  let spBtn = document.querySelector('[data-testid="control-button-playpause"]');
  if (!spBtn) spBtn = document.querySelector('[aria-label]');
  if (!spBtn) return;
  const observer = new MutationObserver(() => {
    if (popup._playPauseBtn) updatePlayPauseIcon(popup._playPauseBtn);
  });
  observer.observe(spBtn, { attributes: true, attributeFilter: ['aria-label', 'class', 'style'] });
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
      left: "3vw",
      right: "1vw",
      top: "auto",
      bottom: "146px",
      width: "200vw",
      height: "90vh",
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
      lyricsContainer.textContent = result.error;
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
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
        lyricsContainer.appendChild(p);
      });
      currentSyncedLyrics = synced;
      highlightSyncedLyrics(synced, lyricsContainer);
    } else if (unsynced && unsynced.length > 0) {
      unsynced.forEach(({ text }) => {
        const p = document.createElement("p");
        p.textContent = text;
        p.style.margin = "0 0 6px 0";
        p.style.transition = "transform 0.18s, color 0.15s, filter 0.13s, opacity 0.13s";
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
