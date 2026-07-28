# Anti Instagram JS

A browser extension that removes Instagram's login wall so you can browse profiles and view posts without logging in.

## Showcase

| Without Extension | With Extension |
|:---:|:---:|
| ![Blocked](screenshots/insta-blocked.png) | ![Unblocked](screenshots/insta-unblocked.png) |

## What it does

- **Removes the login wall popup** — that "Sieh dir das vollständige Profil in der App an" dialog? Gone. Instantly.
- **Removes the dark backdrop** — gets rid of the dark overlay that blocks you from interacting with the page.
- **Removes invisible click interceptors** — Instagram places invisible full-screen divs over posts to intercept clicks and trigger the login wall. Removed.
- **Direct post navigation** — clicking a post navigates directly to the post URL instead of triggering Instagram's JS login wall.
- **Unlocks scroll** — restores page scroll so you can browse the full profile.
- **On/Off toggle** — turn the whole thing off with one click if you want Instagram's default behavior back.
- **Block counter** — keeps track of how many login walls have been bypassed. Reset it anytime.

## How to install (Chrome / Brave / Edge)

1. Download or clone this repo
2. Open `chrome://extensions/` (or `brave://extensions/` / `edge://extensions/`)
3. Turn on **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Pick the folder you downloaded
6. Go to any Instagram profile — the login wall is gone

## How to install (Firefox / LibreWolf)

1. Download or clone this repo
2. Zip the contents of the folder (the `manifest.json` must be at the root of the zip, not inside a subfolder)
3. Open `about:debugging#/runtime/this-firefox`
4. Click **Load Temporary Add-on**
5. Select the `.zip` file you created
6. Done — visit any Instagram profile

> **Note for Flatpak users:** If you're running Firefox or LibreWolf as a Flatpak, loading `manifest.json` directly won't work due to sandbox restrictions. Use the `.zip` method above instead.

## Using the popup

Click the extension icon in your toolbar to open the popup. From there you can:

- Toggle the extension on/off
- See how many login walls have been bypassed
- Reset the counter

All settings are saved automatically and apply immediately — no reload needed.

## Files

- `manifest.json` — Extension manifest (Manifest V3)
- `content.js` — Content script that removes login walls, backdrops, and click interceptors
- `styles.css` — CSS that hides login walls before they render
- `background.js` — Background script that manages state and counter
- `popup.html` / `popup.css` / `popup.js` — Popup UI with toggle and counter
- `icons/` — Extension icons

## Tested on

- **Google Chrome** — works
- **Brave** — works
- **Mozilla Firefox** — works
- **LibreWolf** — works (load via zip if using Flatpak)

## Notes

- This is for personal use. It bypasses Instagram's login wall, so use it responsibly.
- Instagram may change their DOM structure at any time, which could break the extension. If something stops working, check back for updates.
- Stories cannot be viewed without logging in — Instagram requires authentication at the server level for story content.
- Works on Chromium-based browsers (Chrome, Brave, Edge) and Firefox/LibreWolf.
