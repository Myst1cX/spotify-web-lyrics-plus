/**
 * Genius Lyrics Fetch Logic (Refactored)
 * 
 * This module fetches lyrics ONLY from original (non-translation) Genius pages.
 * It removes all logic that attempts to derive original URLs from translation/cover/fan pages.
 * 
 * Key changes:
 * - Only accepts results where isTranslationPage(result) is false
 * - Only accepts results where isSimpleOriginalUrl(result.url) is true  
 * - Removes deriveOriginalUrlFromTranslation and related logic
 * - Returns error if no valid original page is found
 */

/**
 * Main function to fetch Genius lyrics
 * @param {Object} info - Song information {title, artist, album?, duration?}
 * @returns {Object} - {plainLyrics: string} or {error: string}
 */
async function fetchGeniusLyrics(info) {
  console.log("[Genius] Starting fetchGeniusLyrics (refactored - original URLs only)");

  const titles = new Set([
    info.title,
    Utils.removeExtraInfo(info.title),
    Utils.removeSongFeat(info.title),
    Utils.removeSongFeat(Utils.removeExtraInfo(info.title)),
  ]);
  console.log("[Genius] Titles to try:", Array.from(titles));

  // Helper functions
  function generateNthIndices(start = 1, step = 4, max = 25) {
    const arr = [];
    for (let i = start; i <= max; i += step) arr.push(i);
    return arr;
  }

  function cleanQuery(title) {
    return title
      .replace(/\b(remastered|explicit|deluxe|live|version|edit|remix|radio edit|radio)\b/gi, '')
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

  function extractArtistsFromTitle(title) {
    const leftPart = title.split(" - ")[0];
    if (!leftPart) return [];
    return leftPart
      .split(/,|&|feat\.?|ft\.?|and|\band\b/gi)
      .map(s => normalize(s.trim()))
      .filter(Boolean);
  }

  function hasVersionKeywords(title) {
    if (!title) return false;
    const lower = title.toLowerCase();
    // Return false for any translation-related keywords
    if (/\b(русский перевод|deutsche übersetzung|türkçe çeviri|polskie tłumaczenie|magyar fordítás|traducción|tradução|çeviri|traduction|traduzione|перевод|übersetzung|çeviri|traducciones|fordítások|übersetzungen|translation|traduções|traductions|übersetzung|traducciones|перевод|çeviriler|traducciones-al-espanol|genius users)\b/.test(lower)) {
      return false;
    }
    return /\b(remix|deluxe|version|edit|live|explicit|remastered)\b/i.test(title);
  }

  // Translation detection keywords
  const translationKeywords = [
    "translation", "übersetzung", "перевод", "çeviri", "çeviriler", "çevri", "çeviriler", "traducción", "traducciónes",
    "traducciónes", "traducción", "traduções", "traduction", "traductions", "traduzione", "traducciones", "traducciones-al-espanol",
    "fordítás", "fordítások", "tumaczenie", "tłumaczenie", "polskie tłumaczenie", "magyar fordítás", "turkce çeviri",
    "russian translations", "deutsche übersetzung", "genius users", "fan", "fans", "official translation",
    "genius russian translations", "genius deutsche übersetzungen", "genius türkçe çeviriler",
    "polskie tłumaczenia genius", "genius magyar fordítások", "genius traducciones al espanol", "genius traduzioni italiane",
    "genius traductions françaises", "genius traduzioni italiane", "genius turkce ceviriler", "genius traduzioni italiane",
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

  function primaryArtistMatches(targetArtists, primaryArtists) {
    for (const target of targetArtists) {
      if (!primaryArtists.includes(target)) return false;
    }
    return true;
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

  // Prepare fallback queries
  const cleanTitleBase = [...titles][0] || info.title;
  const cleanTitle = cleanQuery(cleanTitleBase);
  const cleanArtistFull = info.artist.replace(/,/g, ' ').trim();
  const firstArtist = info.artist.split(',')[0].trim();

  const fallbackQueries = [
    `${cleanArtistFull} ${cleanTitle}`,
    `${firstArtist} ${cleanTitle}`,
    cleanTitle
  ];

  for (const fallbackQuery of fallbackQueries) {
    const query = encodeURIComponent(fallbackQuery);
    const searchUrl = `https://genius.com/api/search/multi?per_page=5&q=${query}`;

    console.log(`[Genius] Trying fallback query: "${fallbackQuery}"`);
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
      let songHits = hits.filter(h => h.type === "song");
      console.log(`[Genius] Found ${songHits.length} song hits`);

      // === REFACTORED: Filter to only include original (non-translation) URLs ===
      const originalSongHits = songHits.filter(hit => {
        const result = hit.result;
        const isTranslation = isTranslationPage(result);
        const isSimpleOriginal = isSimpleOriginalUrl(result.url);
        
        console.log(`[Genius] Evaluating candidate: "${result.title}" by "${result.primary_artist?.name}"`);
        console.log(`  - URL: ${result.url}`);
        console.log(`  - Is translation page: ${isTranslation}`);
        console.log(`  - Is simple original URL: ${isSimpleOriginal}`);
        
        if (isTranslation) {
          console.log(`  - FILTERED OUT: Translation page detected`);
          return false;
        }
        
        if (!isSimpleOriginal) {
          console.log(`  - FILTERED OUT: Not a simple original URL`);
          return false;
        }
        
        console.log(`  - ACCEPTED: Valid original URL`);
        return true;
      });

      if (originalSongHits.length === 0) {
        console.log(`[Genius] No valid original URLs found after filtering, trying next query.`);
        continue; // Try next fallback query
      }

      console.log(`[Genius] Found ${originalSongHits.length} valid original song candidates after filtering`);
      songHits = originalSongHits; // Use only the filtered results

      for (const hit of songHits) {
        const result = hit.result;
        console.log(`- Valid candidate: Title="${result.title}", Artist="${result.primary_artist?.name}", URL=${result.url}`);
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

      // Apply existing scoring logic to filtered (original-only) results
      for (const hit of songHits) {
        const result = hit.result;

        const primary = normalizeArtists(result.primary_artist?.name || '');
        const artistNamesTokens = result.artist_names ? normalizeArtists(result.artist_names) : [];
        const featured = extractFeaturedArtistsFromTitle(result.title || '');
        const fromTitle = extractArtistsFromTitle(result.title || '');
        const resultArtists = new Set([...primary, ...artistNamesTokens, ...featured, ...fromTitle]);

        const resultTitleNorm = normalize(Utils.removeExtraInfo(result.title || ''));
        const resultHasVersion = hasVersionKeywords(result.title || '');

        let artistOverlapCount = 0;
        for (const a of targetArtists) {
          if (resultArtists.has(a)) artistOverlapCount++;
        }
        const totalArtists = targetArtists.size;
        const missingArtists = totalArtists - artistOverlapCount;

        let artistScore = 0;
        if (artistOverlapCount === totalArtists) {
          artistScore = 7;
        } else if (artistOverlapCount >= totalArtists - 1) {
          artistScore = 6;
        } else if (artistOverlapCount > 0) {
          artistScore = 4 + artistOverlapCount;
        } else {
          artistScore = 0;
        }
        if (missingArtists > 0) artistScore -= missingArtists;

        for (const fa of featured) {
          if (targetArtists.has(fa) && !resultArtists.has(fa)) {
            artistScore += 1;
            console.log(`[Genius] Boosting artistScore: featured artist "${fa}" recovered from title`);
          }
        }

        if (primaryArtistMatches(Array.from(targetArtists), primary)) {
          artistScore += 3;
          console.log(`[Genius] Boosting artist score: primary artist matches all target artists`);
        }

        // Since we already filtered for simple original URLs, we can give a bonus
        artistScore += 5;
        console.log(`[Genius] Boosting artist score: confirmed simple original URL`);

        let titleScore = 0;
        if (resultTitleNorm === targetTitleNorm) titleScore = 5;
        else if (resultTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(resultTitleNorm)) titleScore = 3;

        if (targetHasVersion) {
          if (resultHasVersion) titleScore += 2;
          else titleScore -= 1;
        } else {
          if (!resultHasVersion) titleScore += 2;
          else titleScore -= 1;
        }

        let score = artistScore + titleScore;
        let penaltyLog = [];

        if (!resultTitleNorm.includes(targetTitleNorm)) {
          score -= 2;
          penaltyLog.push("-2 title not fully overlapping");
        }
        if (artistOverlapCount === 0) {
          score -= 3;
          penaltyLog.push("-3 no artist overlap");
        }

        console.log(`[Genius] Candidate "${result.title}":`);
        console.log(`  Artist Score: ${artistScore} (matched ${artistOverlapCount}/${totalArtists})`);
        console.log(`  Title Score: ${titleScore} (normed="${resultTitleNorm}" vs "${targetTitleNorm}", hasVer=${resultHasVersion})`);
        if (penaltyLog.length) console.log(`  Penalties: ${penaltyLog.join(', ')}`);
        console.log(`  Final Score: ${score}`);

        if (score > bestScore && (!targetHasVersion || resultHasVersion)) {
          bestScore = score;
          song = result;
          console.log(`[Genius] New best match: "${result.title}" with score ${bestScore}`);
        } else if (
          score > fallbackScore &&
          (!resultHasVersion || !targetHasVersion) &&
          score >= 5
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

      if (bestScore < 5 || !song?.url) {
        console.log(`[Genius] Best match score too low (${bestScore}) or no URL found, trying next query.`);
        continue; // Try next fallback query
      }

      console.log(`[Genius] Selected song URL: ${song.url}`);

      // Fetch lyrics page HTML
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
        continue; // Try next fallback query
      }
      console.log("[Genius] .Lyrics__Root found");

      const containers = [...lyricsRoot.querySelectorAll('div')].filter(el =>
        [...el.classList].some(cls => cls.includes('Lyrics__Container'))
      );
      console.log(`[Genius] Found ${containers.length} .Lyrics__Container div(s)`);

      if (containers.length === 0) {
        console.warn("[Genius] No .Lyrics__Container found inside .Lyrics__Root");
        continue; // Try next fallback query
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
        continue; // Try next fallback query
      }

      console.log("[Genius] Lyrics successfully extracted");
      return { plainLyrics: lyrics };

    } catch (e) {
      console.error("[Genius] Fetch or parse error:", e);
      continue;
    }
  }

  console.log("[Genius] No original (non-translation) lyrics found after trying all fallback queries");
  return { error: "No original lyrics found on Genius - only translation/cover/fan pages available" };
}

function parseGeniusLyrics(raw) {
  console.log("[Genius] Parsing lyrics");
  if (!raw) {
    console.log("[Genius] No raw lyrics to parse");
    return { unsynced: null };
  }
  const lines = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !/^(\[.*\])$/.test(line));
  console.log(`[Genius] Parsed ${lines.length} lines`);
  return {
    unsynced: lines.map(text => ({ text })),
  };
}

// Provider object (if needed for standalone usage)
const ProviderGenius = {
  async findLyrics(info) {
    console.log("[Genius] findLyrics called");
    try {
      const data = await fetchGeniusLyrics(info);
      if (!data || data.error) {
        console.log("[Genius] findLyrics error:", data?.error);
        return { error: (data && data.error) || "No original lyrics found on Genius" };
      }
      return data;
    } catch (e) {
      console.error("[Genius] Exception in findLyrics:", e);
      return { error: e.message };
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

// Export for use in user scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchGeniusLyrics, parseGeniusLyrics, ProviderGenius };
}