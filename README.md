# SPOTIFY WEB LYRICS PLUS USERSCRIPT

> Injects a powerful lyrics popup into the Spotify Web Player.  
> Supports synced & unsynced lyrics from multiple providers, popup customization, font controls, timing offset, and more.  
> **Works best with [Violentmonkey](https://violentmonkey.github.io/)!**

* * *

## Retrieve your Musixmatch user token

> Step 1: First of all, go to [Musixmatch](https://www.musixmatch.com/) and click on the "Login" button on the top of the screen
> Step 2: Select "Community" as your product and sign in using your Google account.
> Step 3: Go back to MusixMatch, press F12 on your keyboard (or right click and "Inspect")
> Step 4: Click on the Network tab, and you'll see the "www.musixmatch.com" domain
> Step 5: Click on "www.musixmatch.com" and go to the "Cookies" section.
> Step 6: Scroll down, and you'll see musixmatchUserToken. Right-click on the content of the musixmatchUserToken and select "Copy value". 
> Step 7: Go to [JSON Formatter](https://jsonformatter.curiousconcept.com/). Paste the content, and then click "Process".
> Step 8: Copy the corresponding value of web-desktop-app-v1.0 > this is your user token
> Step 9: Choose the Musixmatch Provider in our Lyrics+ Popup Interface and enter the value
> DONE :)

## Features

#### MULTI-PROVIDER LYRICS (LRCLIB, KPoe, Genius)

> Get synced lyrics from LRCLIB and KPoe (Musixmatch & Apple), or fallback to unsynced from Genius.

#### POPUP WINDOW

> Move and resize anywhere on your screen
> Remembers position, size, font, provider
> Reset button to restore default popup position/size 

#### LYRICS TIMING OFFSET

> ⚙️ Fine-tune lyric timing in milliseconds for perfect sync

#### PLAYBACK CONTROLS

>  Play, pause, next, previous track directly from the popup

#### PROVIDER TABS

> Instantly switch between lyric sources

#### FONT SIZE PICKER

> Choose your favorite lyrics text size

#### AUTO-DETECT

> Script automatically picks the best provider for each track

#### STATE SAVING

> Remembers your popup settings and preferences


## Screenshots

(Coming Soon)


## Installation

> 1.  Install [Violentmonkey](https://violentmonkey.github.io/) 
> 2.  [Click here to install the userscript.](https://raw.githubusercontent.com/Myst1cX/spotify-web-lyrics-plus/main/pip-gui.user.js)
> 3.  Open [Spotify Web Player](https://open.spotify.com/).
> 4.  Click the **Lyrics+** button next to playback controls.


## Usage

> 1. **Open/close popup:** Click the Lyrics+ button.
> 2. **Move/resize:** Drag the header or the triangle in the corner.
> 3. **Switch provider:** Use the top tabs.
> 4. **Change font size:** Use the dropdown at top right.
> 5. **Playback controls:** Use play, pause, next, previous inside the popup.
> 6. **Timing offset:** Click ⚙️, adjust ms if lyrics are early/late (collapsable).
> 7. **Show/hide controls:** Click 🎛️ for extra playback options (collapsable).
> 8. **Reset:** Click ↻ to restore default popup position/size.

* * *

> **TIP:** All your settings are remembered, so you always return to where you left off!


## Troubleshooting
> **Lyrics out of sync?** Adjust the timing offset for perfect sync. 
> **Popup not showing?** Make sure you’re using [open.spotify.com](https://open.spotify.com/) and the userscript is enabled. 
> **Mobile?** Use desktop mode for best experience. Will fine-tube for better compatibility soon.

* * *

> Enjoy! For feedback or bug reports, open an issue:  
> [https://github.com/Myst1cX/spotify-web-lyrics-plus/issues](https://github.com/Myst1cX/spotify-web-lyrics-plus/issues)


## Credits

> Lyrics from [LRCLIB](https://lrclib.net/), [KPoe](https://github.com/ibratabian17/KPoe), [Genius](https://genius.com/).  
> Powered by [Spotify](https://open.spotify.com/).


## License

> This project is licensed under the [MIT License](https://github.com/Myst1cX/spotify-web-lyrics-plus/blob/main/LICENSE).
