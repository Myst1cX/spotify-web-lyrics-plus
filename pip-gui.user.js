// ==UserScript==
// @name        Spotify Lyrics+ Stable: No Playback Control (no offset)
// @namespace    http://tampermonkey.net/
// @version      1.49
// @description  Add Lyrics+ button inside Spotify Web Player with LRCLIB and Genius lyrics support.
// @author       you
// @match        https://open.spotify.com/*
// @grant        none
// @homepageURL  https://github.com/Myst1cX/spotify-web-lyrics-plus
// @supportURL   https://github.com/Myst1cX/spotify-web-lyrics-plus/issues
// @updateURL    https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js
// @downloadURL  https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js
// ==/UserScript==

(function () {
  'use strict';

// Timeout helper
function timeoutPromise(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("Track not found on Genius")), ms));
}

  function getCurrentTrackInfo() {
    const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitles"]');
    const durationEl = document.querySelector('[data-testid="playback-duration"]');

    if (!titleEl || !artistEl) return null;

    const title = titleEl.textContent.trim();
    const artist = artistEl.textContent.trim();
    const duration = durationEl ? timeStringToMs(durationEl.textContent) : 0;

    return {
      id: `${title}-${artist}`,  // unique ID to detect change
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

  function parseLyrics(raw) {
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

const normalize = str =>
  str?.normalize("NFKD")
    .replace(/[’‘“”–]/g, "'")
    .replace(/[^\w\s\-\.&!']/g, '')
    .trim();

const ProviderLRCLIB = {
  async findLyrics(info) {
    const baseURL = "https://lrclib.net/api/get";
    const artist = normalize(info.artist);
    const title = normalize(info.title);
    const album = normalize(info.album);

    const fullParams = {
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: Math.floor(info.duration / 1000)
    };

    const simpleParams = {
      track_name: title,
      artist_name: artist
    };

    const buildURL = (params) =>
      `${baseURL}?${Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&")}`;

    try {
      let res = await fetch(buildURL(fullParams), {
        headers: { "x-user-agent": "lyrics-plus-userscript" },
      });

      // Retry with simpler request if no match
      if (!res.ok) {
        res = await fetch(buildURL(simpleParams), {
          headers: { "x-user-agent": "lyrics-plus-userscript" },
        });
      }

      if (!res.ok) return { error: "Track not found on LRCLIB" };
      return await res.json();
    } catch (e) {
      return { error: e.message };
    }
  },

  getUnsynced(body) {
    if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
    if (!body?.plainLyrics) return null;
    return parseLyrics(body.plainLyrics).unsynced;
  },

  getSynced(body) {
    if (body?.instrumental) return [{ text: "♪ Instrumental ♪" }];
    if (!body?.syncedLyrics) return null;
    return parseLyrics(body.syncedLyrics).synced;
  }
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
    return parseLyrics(body.plainLyrics).unsynced;
  },

  getSynced() {
    return null;
  }
};

const Providers = {
  list: ["LRCLIB", "Genius"],
  map: {
    "LRCLIB": ProviderLRCLIB,
    "Genius": ProviderGenius,
  },
  current: "LRCLIB",
  getCurrent() { return this.map[this.current]; },
  setCurrent(name) { if (this.map[name]) this.current = name; }
};


  let highlightTimer = null;

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
    if (existing) existing.remove();
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
    userSelect: "none", // prevent text selection while dragging
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
    fontSize: "22px",
    fontWeight: "bold",
    lineHeight: "1",
    userSelect: "auto",
  });
  closeBtn.onclick = () => {
    savePopupState(popup);
    removePopup();
  };

  header.appendChild(title);
  header.appendChild(closeBtn);
  headerWrapper.appendChild(header);

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

  // Lyrics container
  const lyricsContainer = document.createElement("div");
  lyricsContainer.id = "lyrics-plus-content";
  Object.assign(lyricsContainer.style, {
    flex: "1",
    overflowY: "auto",
    padding: "12px",
    whiteSpace: "pre-wrap",
    fontSize: "38px", //if big screen:38px; if small pip window: 22px
    lineHeight: "1.5",
    backgroundColor: "#121212", //remove this line for transparent background
    userSelect: "text",
  });

  popup.appendChild(headerWrapper);
  popup.appendChild(lyricsContainer);
  document.body.appendChild(popup);

  // Save popup state to localStorage
  function savePopupState(el) {
    const rect = el.getBoundingClientRect();
    localStorage.setItem('lyricsPlusPopupState', JSON.stringify({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }));
  }

  // Draggable implementation
  (function makeDraggable(el, handle) {
    let isDragging = false;
    let startX, startY;
    let origX, origY;

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // Get current position
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;

      // Disable user-select during drag
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newX = origX + dx;
      let newY = origY + dy;

      // Keep inside viewport
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

  // Resizable implementation (bottom-right corner)
  const resizer = document.createElement("div");
  Object.assign(resizer.style, {
    width: "16px",
    height: "16px",
    position: "absolute",
    right: "4px",
    bottom: "4px",
    cursor: "nwse-resize",
    backgroundColor: "rgba(255, 255, 255, 0.1)", // lighter and more transparent
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

      // Minimum size constraints
      newWidth = Math.max(newWidth, 200);
      newHeight = Math.max(newHeight, 100);
      // Maximum size constraints (viewport)
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

  // Your existing code to load track info and update lyrics
  let info = getCurrentTrackInfo();
  if (!info) return;

  currentTrackId = info.id;
  updateLyricsContent(popup, info);

  pollingInterval = setInterval(() => {
    const newInfo = getCurrentTrackInfo();
    if (!newInfo || newInfo.id === currentTrackId) return;

    currentTrackId = newInfo.id;
    updateLyricsContent(popup, newInfo);
  }, 3000);
}

  function updateTabs(tabsContainer) {
    [...tabsContainer.children].forEach(btn => {
      btn.style.backgroundColor = (btn.textContent === Providers.current) ? "#1db954" : "#333";
    });
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

    let activeIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
      if (curPosMs >= lyrics[i].time) activeIndex = i;
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
  }, 500);
}

async function updateLyricsContent(popup, info) {
  if (!info) return;
  const lyricsContainer = popup.querySelector("#lyrics-plus-content");
  if (!lyricsContainer) return;

  // Clear early to avoid stale error text
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
    highlightSyncedLyrics(synced, lyricsContainer);
  } else if (unsynced && unsynced.length > 0) {
    unsynced.forEach(({ text }) => {
      const p = document.createElement("p");
      p.textContent = text;
      p.style.margin = "0 0 6px 0";
      lyricsContainer.appendChild(p);
    });
  } else {
    lyricsContainer.textContent = "Lyrics not found.";
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
      console.log("Lyrics+ button clicked");
      let popup = document.getElementById("lyrics-plus-popup");
      if (!popup) {
        createPopup();
        popup = document.getElementById("lyrics-plus-popup");
      }
      updateLyricsContent(popup, getCurrentTrackInfo());
    };

    controls.appendChild(btn);
    console.log("Lyrics+ button added!");
  };

  tryAdd();
}

  // Variables
  let pollingInterval = null;
  let currentTrackId = null;

const observer = new MutationObserver(() => {
  addButton();
});
observer.observe(document.body, { childList: true, subtree: true });



let lastTrackTitle = "";

function init() {
  addButton();
  setupTrackChangeWatcher();
}

// Observe Spotify page changes to re-add button if necessary
const appRoot = document.querySelector('#main');
if (appRoot) {
  const pageObserver = new MutationObserver(() => {
    addButton();
    setupTrackChangeWatcher();
  });
  pageObserver.observe(appRoot, { childList: true, subtree: true });
}

init();
})();