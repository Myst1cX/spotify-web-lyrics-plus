(function() {
  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    let url = typeof input === "string" ? input : input.url;
    let headers = (init && init.headers) || (input && input.headers);
    if (url && /spclient\.spotify\.com/.test(url)) {
      let authHeader;
      if (headers) {
        if (headers.get && typeof headers.get === "function") {
          authHeader = headers.get("Authorization");
        } else if (headers.Authorization) {
          authHeader = headers.Authorization;
        } else if (headers.authorization) {
          authHeader = headers.authorization;
        }
      }
      if (authHeader && authHeader.startsWith("Bearer ")) {
        let token = authHeader.replace("Bearer ", "").trim();
        localStorage.setItem("lyricsPlusSpotifyToken", token);
        console.log("[Lyrics+] Scraped Spotify token via fetch:", token);
      }
    }
    return origFetch.apply(this, arguments);
  };

  // Patch XHR
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._isSpotifyReq = /spclient\.spotify\.com/.test(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (this._isSpotifyReq && /^authorization$/i.test(header) && value.startsWith("Bearer ")) {
      let token = value.replace("Bearer ", "").trim();
      localStorage.setItem("lyricsPlusSpotifyToken", token);
      console.log("[Lyrics+] Scraped Spotify token via XHR:", token);
    }
    return origSetRequestHeader.apply(this, arguments);
  };
})();
