## SPOTIFY WEB LYRICS+

_Applies to script version **17.73**._

> Injects a powerful lyrics popup into the Spotify Web Player.  
> Supports **synced & unsynced lyrics** from multiple providers, **adjusting the lyric offset**, **live translation**, **lyrics download**,   
> **Chinese script conversion** and **transliteration** (the  latter is limited to KPoe provider, when available in the lyric source).  
> **Playback controls** and **seekbar** can be enabled specifically for the Lyrics+ lyric popup to facilitate song navigation.  
> **Amoled theme** support.  
> **State saving** popup modal - remembers all your settings and preferences.  
> **Recommended userscript manager:** [Violentmonkey](https://violentmonkey.github.io/)

## Features

> **MULTI-PROVIDER LYRICS (LRCLIB, Spotify, KPoe, Musixmatch, Genius)**  
> Get lyrics from LRCLIB, Spotify, KPoe (combines Apple Music/Musixmatch/QQ Music as sources), Musixmatch or Genius.  
> Musixmatch needs a user token (captured automatically after you sign in inside the Spotify Web app, otherwise copied by hand). The Spotify provider reads a fresh token straight from the Spotify Web Player by itself, with a manual token kept as a fallback. Guides for both are further down in the README file.
> 
> **POPUP WINDOW**  
> Move and resize anywhere on your screen.  
> Remembers position, size, font, provider, and translation settings.  
> Reset button <img src="icons/header/reset.svg" width="16" height="16" align="absmiddle" alt="reset icon"/> to restore default popup position/size.  
> When [Spotifuck Mobile](https://github.com/Myst1cX/spotifuck-userscript) is installed, the popup stays clear of its bottom nav bar, player bar and search header while you open, drag, resize or reset it, and re-clamps by itself when that layout changes (player expanded/collapsed, compact mode toggled).
> 
> **FONT SIZE PICKER**  
> Choose your favorite lyrics text size.  
> The chosen setting saves locally. By default, it is set to 22px.
>
> **AUTO-DETECT LOGIC**  
> Script automatically picks the best lyric provider for each track.  
> When a provider finds lyrics to be displayed, it gets highlighted in green.
>
> **LYRIC SOURCE PROVIDER TABS**  
> Manually switch between lyric providers.  
> Option to show/hide the lyric source tabs menu is available in the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.
>
> **LYRICS CACHING**  
> Lyrics are automatically cached locally (up to 6 MB, typically 150–400 songs; limit currently set to 1000 songs).  
> Cached songs load instantly with no network request. Evicts oldest entries automatically.  
> If a song is set to "Repeat One", the lyrics container automatically reloads the song's lyrics from cache after the song restarts,   
> without consuming another fetch request.   
> 
> **SEEKBAR**  
> Jump to any position in the track by dragging or clicking on the seekbar.  
> It looks and behaves like Spotify's own progress bar: white with the handle hidden at rest, green with the handle shown while hovering behind the playhead, and a white seek-preview trail with a time tooltip while hovering ahead of it.  
> Click the duration label to switch between the total length and the time remaining, like on Spotify's native bar.  
> Enable the seekbar from the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.
>
> **PLAYBACK CONTROLS**  
> Play/pause, next/previous track, shuffle and repeat buttons accessible directly inside the popup.  
> Enable the playback controls from the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.
>
> **LYRICS TIMING OFFSET**  
> Fine-tune lyric timing in milliseconds for perfect sync.  
> Accessible from the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.  
> The chosen setting saves locally. By default, it is set to 1000ms.
>
> **AMOLED THEME**  
> A pitch-black theme for the Lyrics+ popup.  
> Can be toggled on/off from the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.   
> 
> **LYRICS DOWNLOAD**  
> Download lyrics in either synced (.lrc) on unsynced/plain text format (.txt) depending on provider availability,   
> using the dedicated <img src="icons/header/download.svg" width="16" height="16" align="absmiddle" alt="download icon"/> download button.   
> Also works inside the Spotifuck Spotify Web app: the app shows its own save popup, where the file can be renamed and the folder picked.   
> 
> **LIVE TRANSLATION**  
> Instantly translate any lyrics (70+ languages, using the Google translate api).
> It may not always be accurate as it performs translation line-by-line.
> Show/hide translation controls using the <img src="icons/header/translate.svg" width="16" height="16" align="absmiddle" alt="translate icon"/> translate button. 
>
> **TRANSLITERATION**  
> Show/hide romanized transliteration alongside lyrics using the dedicated <img src="icons/header/transliteration.svg" width="16" height="16" align="absmiddle" alt="transliteration icon"/> transliteration button.  
> Limited to the KPoe provider, when transliteration is available in the lyric source.  
>
> **CHINESE SCRIPT CONVERSION**  
> Instantly convert between Traditional and Simplified Chinese lyrics (using the open.cc conversion api).  
> 简 = Convert from Simplified to Traditional Chinese  
> 繁 = Convert from Traditional to Simplified Chinese  
> The conversion button appears automatically when Chinese lyrics are detected.  
>
> **PICTURE-IN-PICTURE (PiP) MODE**  
> Float the lyrics in a native floating PiP window. For synced lyrics only.  
> Unsynced lyrics show a prompt to view them in the main lyrics+ popup's lyric container.  
> Always on top. Works across browser tabs and even outside the browser.  
> Font size, transliteration, translation, and Chinese conversion settings are all reflected live.  
> Can be toggled on/off using the dedicated <img src="icons/header/pip.svg" width="16" height="16" align="absmiddle" alt="PiP icon"/> PiP button (styled to match Spotify's own native Picture-in-Picture icon).  
> When toggled on, the lyric lines inside the lyric+ popup's lyric container are hidden and replaced with a placeholder message  
> "This video is playing in Picture-in-Picture mode". The lyrics appear in the floating PiP window that just opened.  
> When the floating PiP window is closed or the button is toggled off, the original lyrics container is restored.   
> On browsers that don't support the native PIP view, an unsupported placeholder message is displayed instead: "Picture-in-Picture mode isn't available in this browser".   
> Inside the Spotify Web app the PiP button opens Android's own Picture-in-Picture window instead, showing the same lyrics canvas (themed to match the popup, including translation, transliteration and status messages).  
> While the PiP window is open it redraws immediately when you change the font size, translation, transliteration or Chinese conversion.  
> Before the first lyric line (an intro, a new song, or after seeking back to the start), the first two lines are shown in gray instead of a blank window, in both native and browser PiP.   

> **SPOTIFY WEB APP INTEGRATION (`window.AndBridge`)**  
> The same script runs inside the Spotify Web app's WebView and detects it by the presence of `window.AndBridge`, an object that only exists there (never in a normal browser or userscript manager). Every bridge method is feature-detected, so an older app just falls back to the browser behavior. What the script and the app do together:  
> - **Download:** `AndBridge.saveTextFile` hands the lyrics file to the app's save popup (app 1.58+). A browser WebView can't save blob downloads, so without it the buttons would do nothing.  
> - **Native PiP:** the PiP button calls `AndBridge.enterPip` (with the AMOLED flag, so the floating window matches the popup theme) and then pushes the drawn lyrics canvas as image frames through `AndBridge.updatePipFrame`, only when something visible changed. The app calls back `window.onNativePipOpened` (app 1.73+) once the native window exists so the current line appears at once, and `window.onNativePipClosed` when Android closes it.  
> - **Musixmatch token:** tapping the Musixmatch link in the token window calls `AndBridge.openMusixmatchLogin` (app 1.65+), so the app opens its own login screen in a separate WebView instead of loading musixmatch.com over Spotify (which would stop playback). Right after sign-in the app calls back `window.__lpSetMusixmatchToken(token)`, which saves the token, fills the field and reloads the lyrics.  
> - **Musixmatch requests:** sent through `AndBridge.nativeFetch` (native HTTP, no CORS/CSP limits). In a normal browser they go through your userscript manager's `GM_xmlhttpRequest` instead, so Musixmatch cannot work in a plain browser without a userscript manager.  

## Screenshots

> (Coming Soon)

## Installation
a) DESKTOP INSTALLATION:
> 1. Install [Violentmonkey](https://violentmonkey.github.io/)  
> 2. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)  
> 3. Alternative to Ublock Origin for blocking Spotify ads: [uSpot - Spotify Ad Blocker](https://github.com/Myst1cX/uSpot/releases).   
> Click [here](https://github.com/Myst1cX/uSpot/blob/main/README.md) for installation steps.    
> 4. Optional - for the lyrics translator inside the stock spotify lyrics view: [Cigi Spotify Translator (fork)](https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js).    
> Click [here](https://github.com/Myst1cX/cigi-spotify-translator-fork/blob/main/README.md) for the setup and feature list.    
> 5. Optional - ad-slot removal, visual premium and forced English locale spoof, restoration of the old Now Playing View button: [SpotiwebJS](https://raw.githubusercontent.com/Myst1cX/SpotiKit/main/SpotiwebJS.user.js)     
> 6. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js). Click [here](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/README.md) for the setup and feature list.    
> 7. Open [Spotify Web Player](https://open.spotify.com/)   
> 8. Play a song   
> 9. Click on the Lyrics+ button to open the interface popup and see the song lyrics   

b) MOBILE INSTALLATION:
> NEW 'QUETTA BROWSER + USER-AGENT SWITCHER AND MANAGER' METHOD:    
> Credits to: [u/soujunim/](https://www.reddit.com/r/SpotifyLatestModAPK/comments/1upaed1/mobile_browser_spotifuck_ui_and_adblock/)
> 
> 1. Download and install the Quetta Browser.    
> 2. Quetta Browser > Open Spotify Web and login to your account   
> 3. Press on the three dots next to the search bar's tab counter.
> 4. Go to Settings > Appearance > Disable 'Enhance Dark Theme'. Now exit the Settings.
> 5. Once again press on the three dots next to the search bar's tab counter.
> 6. Click on the Extensions tab > Manage Extensions > Search Extensions and get the following:   
> 'Violentmonkey', 'User-Agent Switcher and Manager', 'Spotify Ad-Blocker (Blockify)'   
> 7. Backup ad-blocking extension: [uSpot - Spotify Ad Blocker](https://github.com/Myst1cX/uSpot/releases)    
> Click [here](https://github.com/Myst1cX/uSpot/blob/main/README.md) for installation steps.   
> 8. NOTE: Keep only 1 ad-blocking extension enabled at the same time.
> 9. NOTE: Make sure to disable Quetta's own adblock for open.spotify.com so that it doesn't interfere with the installed adblock extension. Press on the three dots next to the search bar's tab counter > Click on the privacy guard (shield icon with a lock inside) > Turn off 'Blocker on This Site'.       
> 10. Optional - for a lyrics translator inside the stock spotify lyrics view: [Cigi Spotify Translator (fork)](https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js).    
> Click [here](https://github.com/Myst1cX/cigi-spotify-translator-fork/blob/main/README.md) for the setup and feature list.    
> 11. Install: [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js). Click [here](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/README.md) for the setup and feature list.   
> 12. Install [Spotifuck](https://raw.githubusercontent.com/Myst1cX/spotifuck-userscript/main/spotifuck-mobile.user.js)   
> 13. Open the Spotify web player > Press on the three dots next to the search bar's tab counter > Click on the Extensions tab > Click on the 'User-Agent Switcher and Manager' extension icon > Select the first option (a Chrome Windows 10 user agent) > Click 'Apply (this tab' and then 'Refresh Tab'.   
> 14. Spotify web player should reload. The interface should now be mobile-friendly.   
> 15. NOTE: Keep Desktop Mode (browser setting) disabled.    
> 16. Play a song   
> 17. Click on the Lyrics+ button to open the interface popup and see the song lyrics   

* * * 

> LEGACY 'FIREFOX BROWSER + CHAMELEON EXTENSION' METHOD (SLOWER, LESS RESPONSIVE):
> 1. Download the latest version of Firefox (must be the Original version; Nightly or other releases might break your userscript manager).  
> 2. Install [Violentmonkey](https://violentmonkey.github.io/)    
> 3. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)  
> 4. Alternative to Ublock Origin for blocking Spotify ads: [uSpot - Spotify Ad Blocker](https://github.com/Myst1cX/uSpot/releases).   
> Click [here](https://github.com/Myst1cX/uSpot/blob/main/README.md) for installation steps.      
> 5. Optional - for the lyrics translator inside the stock spotify lyrics view: [Cigi Spotify Translator (fork)](https://raw.githubusercontent.com/Myst1cX/cigi-spotify-translator-fork/main/cigi-spotify-translator-fork.user.js).    
> Click [here](https://github.com/Myst1cX/cigi-spotify-translator-fork/blob/main/README.md) for the setup and feature list.    
> 6. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js). Click [here](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/README.md) for the setup and feature list.    
> 7. Install [Spotifuck](https://raw.githubusercontent.com/Myst1cX/spotifuck-userscript/main/spotifuck-mobile.user.js)     
> 8. Install [Chameleon](https://addons.mozilla.org/en-US/android/addon/chameleon-ext/) extension   
> 9. Chameleon extension settings > Profile Panel (globe icon) > Select Random Profile (Desktop)  
> 10. Chameleon extension settings > Options Panel > Select the 'Profile' option under the 'Screen size' option  
> 11. Go back to Firefox browser > Firefox Settings > Site settings > Click on "DRM-controlled content" and select "Allowed"  
> 12. Restart Firefox  
> 13. Open Spotify Web and login to your account  
> 14. The interface should be mobile friendly > If it ever resets, try redoing the Chameleon extension configuration and refreshing the Spotify page
> 15. NOTE: Keep Desktop Mode (browser setting) disabled.
> 16. Play a song  
> 17. Click on the Lyrics+ button to open the interface popup and see the song lyrics  

* * * 

> **TIP**: Add Spotify Web Player to your home screen for a PWA-like experience. PWA (Priority Web Application) gives you an easy access shortcut to the Spotify player.  
> **SIDE NOTE**: You can begin playing a song in the web interface and then open the Spotify app - it will let you play music there and control playback without any limitations.  

* * * 

> REMEMBER: PWA's essentially allow running an entire app in your web browser.    
> A good way of finding progressive web apps is through `store.app`  
> The degree to which you can block ads varies depending on the app, but it is often times better than using the actual app - a PWA also uses less storage than installing a native app.  

* * *

## Usage

> 1. **Open/close popup:** Click the Lyrics+ button. You can also close the popup modal using the dedicated <img src="icons/header/close.svg" width="16" height="16" align="absmiddle" alt="close icon"/> close button.
> 2. **Move/resize:** Drag the header or the triangle in the corner.  
> 3. **Auto-detect logic:** Script automatically chooses the best lyric provider for each track.  
> 4. **Manually switch between lyric providers:** Click between the lyric source provider tabs.  
> 5. **Settings panel:** Click the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu button to open/close the settings panel (show/hide lyric source tabs, show/hide seekbar, show/hide playback controls, set timing offset, enable/disable AMOLED theme).   
> 6. **Translate lyrics:** Click the <img src="icons/header/translate.svg" width="16" height="16" align="absmiddle" alt="translate icon"/> translate button to toggle translation controls, pick your language, and press on "Translate".  
Click on "Original" to remove the translated lines.   
> 7. **Transliteration:** Click the <img src="icons/header/transliteration.svg" width="16" height="16" align="absmiddle" alt="transliteration icon"/> transliteration button (KPoe provider only, when available in the lyric source) to show/hide romanized transliteration alongside lyrics.  
> 8. **Chinese conversion:** Click 简 or 繁 (when Chinese lyrics are detected) to convert between Traditional and Simplified Chinese.    
> 9. **Change font size:** Use the font size's "px" dropdown menu.  
> 10. **Reset:** Click the <img src="icons/header/reset.svg" width="16" height="16" align="absmiddle" alt="reset icon"/> reset button to restore default popup position/size.  
> 11. **Picture-in-Picture mode:** Click the <img src="icons/header/pip.svg" width="16" height="16" align="absmiddle" alt="PiP icon"/> PiP toggle to move the lyrics into a floating Picture-in-Picture window while the original lyrics container receives a placeholder. Close the PiP window to restore the original lyrics container.  

* * * 

> **TIP:** All your settings are remembered, so you always return to right where you left off!

## Retrieve your Musixmatch user token

> Double-click the Musixmatch provider tab to open the token window. It fits phone screens, keeps the token field and Save/Cancel pinned at the bottom, folds the instructions away once a token is saved, and only focuses the field automatically on desktop.  
> **Inside the Spotify Web app (app 1.65+): no copying needed.** Tap the Musixmatch link in that window and sign in on the screen that opens (your song keeps playing). The app reads your token right after you sign in, fills the field and closes that screen by itself.  
> **Otherwise, get it manually:**

> 1. Go to [Musixmatch](https://www.musixmatch.com/) and click on the Login button at the top of the screen.  
> 2. Select `Community` as your product and sign in using your Google account.  
> 3. Open DevTools (Press F12 or Right click and Inspect).      
> 4. Go to the Network tab, and look for the `www.musixmatch.com` domain.  
> 5. Click on `www.musixmatch.com` and go to the Cookies section.  
> 6. Find `musixmatchUserToken`, right-click its content and select Copy value.  
> 7. Go to [JSON Formatter](https://jsonformatter.curiousconcept.com/), paste the content, and click Process. 
> 8. Copy the value of `mxm-com-v1.0` — this is your user token.  
> 9. In the Lyrics+ popup, double-click on the Musixmatch provider, paste your token and press Save.

## Retrieve your Spotify user token (manual fallback)

> **You normally don't need this.** The script asks the Spotify Web Player itself for its current token, so it is always fresh and never expires hourly or on reload. The token is also saved for you, so the field in the token window (double-click the Spotify provider tab) is already filled. In the Spotifuck Spotify Web app it is read when the Spotify lyrics load.  
> Only if the Spotify tab says it couldn't read your token automatically (not logged in, Spotify changed something internally, or your userscript manager runs the script in an isolated context that can't see the page) copy one by hand as below. Manual tokens expire every hour and on page reload.  

> 1. Go to [Spotify Web Player](https://open.spotify.com/) and login. Play a song.  
> 2. Open DevTools (Press F12 or Right click and Inspect).   
> 3. [Accessing DevTools on Mobile](https://addons.mozilla.org/en-US/android/addon/mobidevtools/) (if it does refuse to load, obtain the token via PC)    
> 4. Go to the Network tab and search for `spclient`.   
> 5. You may have to wait a little for it to load.
> 6. Click on one of the spclient domains and go to the Headers section. 
> 7. Under Response Headers, locate the authorization request header. 
> 8. If there isn't one, try a different spclient domain.
> 9. Right-click on the content of the authorization request header and select Copy value.
> 10. In the Lyrics+ popup, double-click on the Spotify provider, paste your token and press Save.  
> 11. The "Bearer " prefix will be stripped automatically, so you can enter the whole value out of the box.

## Troubleshooting

> **Lyrics out of sync?** - Adjust the timing offset from the <img src="icons/header/settings.svg" width="16" height="16" align="absmiddle" alt="settings icon"/> settings menu.  
> 
> **Spotify provider says it couldn't read your token?** - Make sure you're logged in and a song is playing, then select the Spotify tab again. If it still fails, use the [manual token steps](#retrieve-your-spotify-user-token-manual-fallback).  
> 
> **Musixmatch asks for a token again?** - Musixmatch rejected the saved one (it is cleared automatically). Sign in again inside the app, or repeat the [manual steps](#retrieve-your-musixmatch-user-token).  
> 
> **For feedback or bug reports, open an issue:**    
> [https://github.com/Myst1cX/spotify-web-lyrics-plus/issues](https://github.com/Myst1cX/spotify-web-lyrics-plus/issues)

## Credits

> 1. **Lyrics from** [LRCLIB](https://lrclib.net/), [Spotify](https://github.com/Natoune/SpotifyMobileLyricsAPI), [KPoe](https://github.com/ibratabian17/KPoe), [Musixmatch](https://musixmatch.com/), [Genius](https://genius.com/)
> 2. **Third part libraries and utilities used:**
> [spicetify/lyrics-plus: Providers.js (on 3.6.'25)](https://github.com/spicetify/cli/blob/main/CustomApps/lyrics-plus/Providers.js), [spicetify/lyrics-plus: ProviderLRCLIB.js, (on 3.6.'25)](https://github.com/spicetify/cli/blob/main/CustomApps/lyrics-plus/ProviderLRCLIB.js),
> [spicetify/lyrics-plus: ProviderMusixmatch.js, (on 3.6.'25)](https://github.com/spicetify/cli/blob/main/CustomApps/lyrics-plus/ProviderMusixmatch.js), [spicetify/lyrics-plus: ProviderGenius.js, (on 3.6.'25)](https://github.com/spicetify/cli/blob/main/CustomApps/lyrics-plus/ProviderGenius.js),
> [cuzi/Spotify Genius Lyrics userscript (v23.6.15)](https://greasyfork.org/en/scripts/377439-spotify-genius-lyrics?version=1602852),
> [cvzi/GeniusLyrics.js library (v5.6.15)](https://github.com/cvzi/genius-lyrics-userscript/blob/1f77b8e56ae8254bf4a1b27654ed459116f35502/GeniusLyrics.js),
> [Natoune/SpotifyMobileLyricsAPI](https://github.com/Natoune/SpotifyMobileLyricsAPI/blob/main/src/fetchers.ts), [ibratabian17/YouLyPlus](https://github.com/search?q=repo%3Aibratabian17%2FYouLyPlus+kpoe&type=code)
> 4. **Live Translation from** [raicigi/Cigi Spotify Translator (v1.0)](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)
> 5. **Chinese Conversion via open.cc (now using full.js instead of only t2cn.js) from** [holsoma/Spotify Lyrics: Trad ⇄ Simplified (v1.1.0)](https://greasyfork.org/en/scripts/555411-spotify-lyrics-trad-simplified)
> 6. **Picture-in-Picture mode from** [mantou132/Spotify-Lyrics: pip.ts, (on 4.4.'26)](https://github.com/mantou132/Spotify-Lyrics/blob/master/src/page/pip.ts)

## License

> This project is licensed under the [GNU General Public License v2.0](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/LICENSE).
