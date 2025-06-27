// ==UserScript==
// @name         Spotify Lyrics+ Stable
// @namespace    http://tampermonkey.net/
// @version      3.00
// @description  Synced - LRCLIB, KPoe (fetches from Musixmatch and Apple) and unsynced - Genius lyrics support.
// @author       you
// @match        https://open.spotify.com/*
// @grant        none
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.experimental.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.experimental.user.js
// ==/UserScript==

// Equal to Stable release (Last update: 27.6.25)

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

  const normalize = str =>
    str?.normalize("NFKD")
      .replace(/[’‘“”–]/g, "'")
      .replace(/[^\w\s\-\.&!']/g, '')
      .trim();

  function parseLRCLibFormat(data) {
    if (!data.syncedLyrics) return null;
    const lines = data.syncedLyrics.split('\n');
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;
    const parsedLines = [];
    const matches = [];
    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const centiseconds = parseInt(match[3], 10);
        const startTime = minutes * 60 + seconds + centiseconds / 100;
        const text = match[4].trim();
        matches.push({ startTime, text });
      }
    }
    for (let i = 0; i < matches.length; i++) {
      const { startTime, text } = matches[i];
      const endTime = (i < matches.length - 1) ? matches[i + 1].startTime : startTime + 4;
      if (text !== "") {
        parsedLines.push({
          text,
          startTime,
          endTime,
          element: { singer: 'v1' }
        });
      }
    }
    return {
      type: 'Line',
      data: parsedLines,
      metadata: {
        title: data.trackName,
        artist: data.artistName,
        album: data.albumName,
        duration: data.duration,
        instrumental: data.instrumental,
        source: "LRCLIB"
      }
    };
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

  function parseGeniusLyrics(raw) {
    const synced = [];
    const unsynced = [];
    const lines = raw.split(/\r?\n/);
    const timeTagRegex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
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

  function timeoutPromise(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("Track not found on Genius")), ms));
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
        if (anticipatedMs >= lyrics[i].time) activeIndex = i;
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
  const pauseVisible = !!document.querySelector('[aria-label="Pause"]');
  btnPlayPause.innerHTML = "";
  if (pauseVisible) {
    btnPlayPause.appendChild(pauseSVG.cloneNode(true));
  } else {
    btnPlayPause.appendChild(playSVG.cloneNode(true));
  }
}

  // ------------------------
  // Providers and Fetchers
  // ------------------------

  async function fetchLRCLibLyrics(songInfo) {
    const albumParam = (songInfo.album && songInfo.album !== songInfo.title)
      ? `&album_name=${encodeURIComponent(songInfo.album)}`
      : '';
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(songInfo.artist)}&track_name=${encodeURIComponent(songInfo.title)}${albumParam}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return parseLRCLibFormat(data);
  }

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
    return parseKPoeFormat(data);
  }

  const ProviderLRCLIB = {
    async findLyrics(info) {
      try {
        const artist = normalize(info.artist);
        const title = normalize(info.title);
        const album = normalize(info.album);
        const songInfo = { artist, title, album };
        const result = await fetchLRCLibLyrics(songInfo);
        if (!result) return { error: "Track not found on LRCLIB" };
        return result;
      } catch (e) {
        return { error: e.message };
      }
    },
    getUnsynced(body) {
      if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
      if (!body?.data || !Array.isArray(body.data)) return null;
      return body.data.map(line => ({ text: line.text }));
    },
    getSynced(body) {
      if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
      if (!body?.data || !Array.isArray(body.data)) return null;
      return body.data.map(line => ({
        time: Math.round(line.startTime * 1000),
        text: line.text
      }));
    }
  };

  const ProviderKPoe = {
    async findLyrics(info) {
      try {
        const artist = normalize(info.artist);
        const title = normalize(info.title);
        const album = normalize(info.album);
        const duration = Math.floor(info.duration / 1000);
        const songInfo = { artist, title, album, duration };
        const result = await fetchKPoeLyrics(songInfo);
        if (!result) return { error: "Track not found on KPoe" };
        return result;
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

  const ProviderGenius = {
    async findLyrics(info) {
      try {
        const artist = normalize(info.artist);
        const title = normalize(info.title);
        const searchUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        const fetchPromise = fetch(searchUrl);
        const res = await Promise.race([fetchPromise, timeoutPromise(1000)]);
        if (!res.ok) return { error: "Track not found on Genius" };
        const data = await res.json();
        if (!data.lyrics) return { error: "No lyrics found" };
        return { plainLyrics: data.lyrics };
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

  const Providers = {
    list: ["LRCLIB", "KPoe", "Genius"],
    map: {
      "LRCLIB": ProviderLRCLIB,
      "KPoe": ProviderKPoe,
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
    const spBtn = document.querySelector('[aria-label="Play"], [aria-label="Pause"]');
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
    offsetWrapper.style.transition = "max-height 0.3s, opacity 0.3s";
    offsetWrapper.style.overflow = "hidden";
    controlsBar.style.transition = "max-height 0.3s, opacity 0.3s";
    controlsBar.style.overflow = "hidden";
    let offsetVisible = localStorage.getItem('lyricsPlusOffsetVisible');
    if (offsetVisible === null) offsetVisible = true;
    else offsetVisible = JSON.parse(offsetVisible);

    let controlsVisible = localStorage.getItem('lyricsPlusControlsVisible');
    if (controlsVisible === null) controlsVisible = true;
    else controlsVisible = JSON.parse(controlsVisible);

    offsetToggleBtn.onclick = () => {
      offsetVisible = !offsetVisible;
      localStorage.setItem('lyricsPlusOffsetVisible', JSON.stringify(offsetVisible));
      if (offsetVisible) {
        offsetWrapper.style.maxHeight = "100px";
        offsetWrapper.style.opacity = "1";
        offsetWrapper.style.pointerEvents = "";
      } else {
        offsetWrapper.style.maxHeight = "0";
        offsetWrapper.style.opacity = "0";
        offsetWrapper.style.pointerEvents = "none";
        offsetWrapper.style.padding = "0";
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
      offsetWrapper.style.opacity = "1";
      offsetWrapper.style.pointerEvents = "";
    } else {
      offsetWrapper.style.maxHeight = "0";
      offsetWrapper.style.opacity = "0";
      offsetWrapper.style.pointerEvents = "none";
      offsetWrapper.style.padding = "0";
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
      let selector;
      switch (command) {
        case "playpause":
          selector = '[aria-label="Play"], [aria-label="Pause"]';
          break;
        case "next":
          selector = '[aria-label="Next"]';
          break;
        case "previous":
          selector = '[aria-label="Previous"]';
          break;
        default:
          console.warn("Unknown Spotify command:", command);
          return;
      }
      const btn = document.querySelector(selector);
      if (btn) btn.click();
      else console.warn("Spotify button not found for:", command);
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
    btnReset.onclick = () => {
      Object.assign(popup.style, {
        position: "fixed",
        bottom: "0px",
        right: "0px",
        left: "auto",
        top: "auto",
        width: "320px",
        height: "45vh",
      });
      savePopupState(popup);
    };

    controlsBar.appendChild(btnReset);
    controlsBar.appendChild(btnPrevious);
    controlsBar.appendChild(btnPlayPause);
    controlsBar.appendChild(btnNext);

    popup.appendChild(headerWrapper);
    popup.appendChild(offsetWrapper);
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

  async function autodetectProviderAndLoad(popup, info) {
    const providerChecks = [
      { name: "LRCLIB", type: "getSynced" },
      { name: "KPoe", type: "getSynced" },
      { name: "LRCLIB", type: "getUnsynced" },
      { name: "KPoe", type: "getUnsynced" },
      { name: "Genius", type: "getUnsynced" }
    ];
    for (const { name, type } of providerChecks) {
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
          console.log(`Lyrics+ button: Waiting for controls... (${attempts})`);
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
      console.log("Lyrics+ button added!");
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
