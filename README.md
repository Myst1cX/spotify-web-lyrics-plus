## SPOTIFY WEB LYRICS+

> Injects a powerful lyrics popup into the Spotify Web Player.  
> Supports **synced & unsynced lyrics** from multiple providers, **adjusting the lyric offset**, **live translation**, **playback controls**, **lyrics download** and more.  
> **Recommended userscript manager:** [Violentmonkey](https://violentmonkey.github.io/)

## Features

> **MULTI-PROVIDER LYRICS (LRCLIB, Spotify, KPoe, Musixmatch, Genius)**  
> Get lyrics from LRCLIB, Spotify, KPoe (Apple Music source), Musixmatch or Genius.
> Spotify and Musixmatch require a user token, guides for both are further down in the README.
> 
> **POPUP WINDOW**  
> Move and resize anywhere on your screen.  
> Remembers position, size, font, provider, and translation settings.  
> Reset button to restore default popup position/size.
>
> **LYRICS DOWNLOAD**<br>
> Download lyrics in either synced (.lrc) on unsynced/plain text format (.txt).
> 
> **LIVE TRANSLATION**  
> 🌐 Instantly translate any lyrics (line-by-line, 70+ languages).  
> Show/hide translation controls. Remove or re-translate in one click.
>
> **LYRICS TIMING OFFSET**  
> ⚙️ Fine-tune lyric timing in milliseconds for perfect sync.
>
> **PLAYBACK CONTROLS**  
> 🎛️ Play, pause, next, previous track directly from the popup.
>
> **PROVIDER TABS**  
> Instantly switch between lyric sources.
>
> **FONT SIZE PICKER**  
> Choose your favorite lyrics text size.
>
> **AUTO-DETECT**  
> Script automatically picks the best provider for each track.
>
> **STATE SAVING**  
> Remembers all your popup settings and preferences.

## Screenshots

> (Coming Soon)

## Installation

> 1. Install [Violentmonkey](https://violentmonkey.github.io/)  
> 2. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)
> 3. Recommended: [Spotify AdBlocker](https://greasyfork.org/en/scripts/522592-spotify-adblocker)
> 4. Optional - for stock lyrics button: [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)
> 4. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js)
> 5. Open [Spotify Web Player](https://open.spotify.com/) 
> 6. Play a song
> 7. Click on the Lyrics+ button to open the interface popup and see the song lyrics

## Usage

> 1. **Open/close popup:** Click the Lyrics+ button.  
> 2. **Move/resize:** Drag the header or the triangle in the corner.  
> 3. **Switch provider:** Use the top tabs.  
> 4. **Translate lyrics:** 🌐 Toggle translation controls, pick your language, click "Translate".  
> 5. **Change font size:** Use the dropdown at top right.  
> 6. **Playback controls:** Use play, pause, next, previous inside the popup.  
> 7. **Timing offset:** Click ⚙️, adjust ms if lyrics are early/late.  
> 8. **Show/hide controls:** Click 🎛️ for extra playback options.  
> 9. **Reset:** Click ↻ to restore default popup position/size.

* * * 

> **TIP:** All your settings are remembered, so you always return to right where you left off!

## Retrieve your Musixmatch user token

> 1. Go to [Musixmatch](https://www.musixmatch.com/) and click on the Login button at the top of the screen.  
> 2. Select `Community` as your product and sign in using your Google account.  
> 3. Open DevTools (Press F12 or Right click and Inspect).  
> 4. Go to the Network tab, and look for the `www.musixmatch.com` domain.  
> 5. Click on `www.musixmatch.com` and go to the Cookies section.  
> 6. Find `musixmatchUserToken`, right-click its content and select Copy value.  
> 7. Go to [JSON Formatter](https://jsonformatter.curiousconcept.com/), paste the content, and click Process.  
> 8. Copy the value of `web-desktop-app-v1.0` — this is your user token.  
> 9. In the Lyrics+ popup, double-click on the Musixmatch provider, paste your token and press Save.

## Retrieve your Spotify user token

> 1. Go to [Spotify Web Player](https://open.spotify.com/) and login. Play a song. 
> 2. Open DevTools (Press F12 or Right click and Inspect).
> 3. [Access DevTools on Mobile](https://addons.mozilla.org/en-US/android/addon/mobidevtools/)  
> 4. Go to the Network tab and search for `spclient`.
> 5. You may have to wait a little for it to load.
> 6. Click on one of the spclient domains and go to the Headers section. 
> 7. Under Response Headers, locate the authorization request header. 
> 8. If there isn't one, try a different spclient domain.
> 9. Right-click on the content of the authorization request header and select Copy value. 
> 10. In the Lyrics+ popup, double-click on the Spotify provider, paste your token and press Save.

## Troubleshooting

> **Lyrics out of sync?** Adjust the timing offset for perfect sync. 
  
* * * 

> **Mobile?** YES!

> 1. Download the latest version of Firefox (Original version! - Nightly or other releases might break your userscript manager).
> 2. Install [Violentmonkey](https://violentmonkey.github.io/)  
> 3. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)
> 4. Recommended: [Spotify AdBlocker](https://greasyfork.org/en/scripts/522592-spotify-adblocker)
> 5. Optional - for stock lyrics button: [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)
> 6. Install [Spotifuck](https://raw.githubusercontent.com/Myst1cX/spotifuck-userscript/main/spotifuck-v5.user.js)
> 7. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js)
> 8. Install Chameleon extension
> 9. Chameleon extension settings > Profile Panel (globe icon) > Select Random Profile (Desktop)
> 10. Chameleon extension settings > Options Panel > Select the 'Profile' option under the 'Screen size' option
> 11. Go back to Firefox browser > Firefox Settings > Site settings > Click on "DRM-controlled content" and select "Allowed"
> 12. Restart Firefox
> 13. Open Spotify Web and login to your account
> 14. The interface should change to a wider window > If it ever resets, repeat steps 7 and 8 > Keep Desktop Mode Disabled 
> 15. Play a song
> 16. Click on the Lyrics+ button to open the interface popup and see the song lyrics

* * * 

> 16. Recommended: While on the Spotify web instance in Firefox, click on the hamburger menu in the top right corner of the browser and press "Add to home screen" - this transforms the website into a PWA (Priority Web Application) and gives you an easy access shortcut to the Spotify player. 
> 17. FINAL TIP: You can begin playing a song in the web interface and then open the Spotify app - it will let you play music there and control playback without any limitations.

* * *

> 18. SIDE NOTE: PWA's essentially allow running an entire app in your web browser.
> A good way of finding progressive web apps is through `store.app`
> The degree to which you can block ads varies depending on the app, but it is often times better than using the actual app - a PWA also uses less storage than installing a native app.

* * *

> Enjoy! For feedback or bug reports, open an issue:  
> [https://github.com/Myst1cX/spotify-web-lyrics-plus/issues](https://github.com/Myst1cX/spotify-web-lyrics-plus/issues)

## Credits

> 1. **Lyrics from** [LRCLIB](https://lrclib.net/), [KPoe](https://github.com/ibratabian17/KPoe), [Genius](https://genius.com/), [Musixmatch](https://musixmatch.com/)
> 2. **Live Translation from** [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)
> 3. **Traditional ⇄ Simplified (BIDIRECTIONAL) Chinese Conversion via open.cc from** [Spotify Lyrics: Trad ⇄ Simplified](https://greasyfork.org/en/scripts/555411-spotify-lyrics-trad-simplified)
> 4. **Powered by** [Spotify](https://open.spotify.com/).

## License

> This project is licensed under the [MIT License](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/LICENSE).
