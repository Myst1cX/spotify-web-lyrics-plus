## SPOTIFY WEB LYRICS+

> Injects a powerful lyrics popup into the Spotify Web Player.  
> Supports **synced & unsynced lyrics** from multiple providers, **adjusting the lyric offset**, **live translation**, **lyrics download**, **Chinese script conversion** and **transliteration** (the  latter is limited to KPoe provider, when available in the lyric source).  
> **Playback controls** and **seekbar** can be enabled specifically for the Lyrics+ lyric popup to facilitate song navigation.  
> **Amoled theme** support.  
> **State saving** popup modal - remembers all your settings and preferences.  
> **Recommended userscript manager:** [Violentmonkey](https://violentmonkey.github.io/)

## Features

> **MULTI-PROVIDER LYRICS (LRCLIB, Spotify, KPoe, Musixmatch, Genius)**  
> Get lyrics from LRCLIB, Spotify, KPoe (combines Apple Music/Musixmatch/QQ Music as sources), Musixmatch or Genius.  
> Spotify and Musixmatch require a user token, guides for both are further down in the README file.
> 
> **POPUP WINDOW**  
> Move and resize anywhere on your screen.  
> Remembers position, size, font, provider, and translation settings.  
> Reset button to restore default popup position/size.
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
> Option to show/hide the lyric source tabs menu is available in the ⚙️ settings menu.
>
> **LYRICS CACHING**  
> Lyrics are automatically cached locally (up to 6 MB, typically 150–400 songs; limit currently set to 1000 songs).  
> Cached songs load instantly with no network request. Evicts oldest entries automatically.  
> If a song is set to "Repeat One", the lyrics container automatically reloads the song's lyrics from cache after the song restarts, without consuming another fetch request.
> 
> **SEEKBAR**  
> Jump to any position in the track by dragging or clicking on the seekbar. 
> Enable the seekbar from the ⚙️ settings menu.
>
> **PLAYBACK CONTROLS**  
> Play/pause, next/previous track, shuffle and repeat buttons accessible directly inside the popup.  
> Enable the playback controls from the ⚙️ settings menu.
>
> **LYRICS TIMING OFFSET**  
> Fine-tune lyric timing in milliseconds for perfect sync.  
> Accessible from the ⚙️ settings menu.  
> The chosen setting saves locally. By default, is is set to 1000ms.
>
> **AMOLED THEME**  
> A pitch-black theme for the Lyrics+ popup.  
> Can be toggled on/off from the ⚙️ settings menu.
> 
> **LYRICS DOWNLOAD**  
> Download lyrics in either synced (.lrc) on unsynced/plain text format (.txt) depending on provider availability.
> 
> **LIVE TRANSLATION**  
> Instantly translate any lyrics (70+ languages, using the Google translate api).
> It may not always be accurate as it performs translation line-by-line.
> Show/hide translation controls using the 🌐 button. 
>
> **TRANSLITERATION**  
> Show/hide romanized transliteration alongside lyrics using the 🔡 button.  
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
> Can be toggled on/off using the dedicated "Toggle Picture-in-Picture mode" button.  
> When toggled on, the lyric+ popup's lyric container is replaced with a video element which streams a  
> canvas onto which the lyrics are then rendered. A Picture-in-Picture toggle appears aswell.  
> When the user activates the PiP toggle, the lyric lines inside the lyric container are hidden and  
> the video element shows the browser's "This video is playing in Picture-in-Picture mode" placeholder.  
> The lyrics appear in the floating PiP window that just opened.  
> When the floating PiP window is closed, the video element with the lyrics is restored.  
> Toggle off the "Toggle Picture-in-Picture mode" button to bring back the original lyrics container.  

## Screenshots

> (Coming Soon)

## Installation

> 1. Install [Violentmonkey](https://violentmonkey.github.io/)  
> 2. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)  
> 3. Recommended: [Spotify AdBlocker](https://greasyfork.org/en/scripts/522592-spotify-adblocker)  
> 4. Optional - for the lyrics translator inside the stock spotify lyrics view: [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)  
> 5. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js)  
> 6. Open [Spotify Web Player](https://open.spotify.com/)   
> 7. Play a song  
> 8. Click on the Lyrics+ button to open the interface popup and see the song lyrics  

## Make it work on a mobile device

> 1. Download the latest version of Firefox (must be the Original version; Nightly or other releases might break your userscript manager).  
> 2. Install [Violentmonkey](https://violentmonkey.github.io/)    
> 3. Recommended: [Ublock Origin](https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/)  
> 4. Recommended: [Spotify AdBlocker](https://greasyfork.org/en/scripts/522592-spotify-adblocker)  
> 5. Optional - for the lyrics translator inside the stock spotify lyrics view: [Cigi Spotify Translator](https://greasyfork.org/en/scripts/523415-cigi-spotify-translator)  
> 6. Install [Spotifuck](https://raw.githubusercontent.com/Myst1cX/spotifuck-userscript/main/spotifuck-v5.user.js)  
> 7. Install [Spotify Lyrics+](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui-stable.user.js)   
> 8. Install [Chameleon](https://addons.mozilla.org/en-US/android/addon/chameleon-ext/)   
> 9. Chameleon extension settings > Profile Panel (globe icon) > Select Random Profile (Desktop)  
> 10. Chameleon extension settings > Options Panel > Select the 'Profile' option under the 'Screen size' option  
> 11. Go back to Firefox browser > Firefox Settings > Site settings > Click on "DRM-controlled content" and select "Allowed"  
> 12. Restart Firefox  
> 13. Open Spotify Web and login to your account  
> 14. The interface should change to a wider window > If it ever resets, repeat steps 7 and 8 > Keep Desktop Mode Disabled   
> 15. Play a song  
> 16. Click on the Lyrics+ button to open the interface popup and see the song lyrics  

* * * 

> 17. RECOMMENDED: While on the Spotify web instance in Firefox, click on the hamburger menu in the top right corner of the browser and press "Add to home screen".  
> This transforms the website into a PWA (Priority Web Application) and gives you an easy access shortcut to the Spotify player.  
> 18. SIDE NOTE: You can begin playing a song in the web interface and then open the Spotify app - it will let you play music there and control playback without any limitations.  

* * * 

> 19. REMEMBER: PWA's essentially allow running an entire app in your web browser.    
> A good way of finding progressive web apps is through `store.app`  
> The degree to which you can block ads varies depending on the app, but it is often times better than using the actual app - a PWA also uses less storage than installing a native app.  

* * *

## Usage

> 1. **Open/close popup:** Click the Lyrics+ button.  
> 2. **Move/resize:** Drag the header or the triangle in the corner.  
> 3. **Auto-detect logic:** Script automatically chooses the best lyric provider for each track.  
> 4. **Manually switch between lyric providers:** Click between the lyric source provider tabs.  
> 8. **Settings panel:** Click ⚙️ to open/close the settings panel (show/hide lyric source tabs, show/hide seekbar, show/hide playback controls, set timing offset, enable/disable AMOLED theme).   
> 5. **Translate lyrics:** Click 🌐 to toggle translation controls, pick your language, and press on "Translate".  
> 6. **Transliteration:** Click 🔡 (KPoe provider only, when available in the lyric source) to show/hide romanized transliteration alongside lyrics.  
> 7. **Chinese conversion:** Click 简 or 繁 (when Chinese lyrics are detected) to convert between Traditional and Simplified Chinese.    
> 8. **Change font size:** Use the font size's "px" dropdown menu.  
> 9. **Reset:** Click ↻ to restore default popup position/size.  
> 10. **Picture-in-Picture mode:** Turn the feature on to replace the lyrics container with a <video> that streams a canvas rendering of the lyrics. This allows the PiP toggle to appear. Click the PiP toggle to move the lyrics into a floating Picture-in-Picture window while the original lyrics container receives a placeholder. Close the PiP window and toggle the feature off to restore the original lyrics container.  

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
> 11. The "Bearer " prefix will be stripped automatically, so you can enter the whole value out of the box.

## Troubleshooting

> **Lyrics out of sync?** - Adjust the timing offset from the ⚙️ settings menu.  
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
