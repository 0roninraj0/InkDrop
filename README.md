# InkDrop — offline premium comic reader (Android)

CBZ · ZIP · CBR · RAR · PDF. No internet permission, no backend, no analytics. Everything stays on the phone.

## Get the APK (free, ~5 minutes, no Android Studio)
1. Create a GitHub repo and push this folder (`git init && git add . && git commit -m init && git push`).
2. Open the repo → **Actions → Build InkDrop APK → Run workflow** (it also runs on every push).
3. When it finishes, download the **InkDrop-apk** artifact, unzip, copy `app-debug.apk` to your phone, tap it, allow "install unknown apps".

Or build locally (needs JDK 21 + Android SDK):
```
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
```

## Try it in a browser first
`npm install && npm run dev` — pick a folder of comics (files are kept in memory for that session only; the APK keeps permanent folder access).

## Features
- Folder picker (Android system picker, permission persisted) → recursive scan → covers + page counts built in the background.
- Auto-collections: strips `[groups]`, `(year)`, `v01 / Vol 2 / Ch.10 / #3 / 003`, tolerates small spelling differences.
- Manual: long-press → Move to collection / new collection, "Add comics manually" inside a collection, make standalone, reset to auto, rename.
- Reader: Comic (LTR), Manga (RTL), Manhwa (vertical scroll). Swipe, tap zones, scroll, pinch / double-tap zoom.
- Swipe animations: 3D page flip (drag-follows-finger), slide, or instant.
- Colour modes: B&W, Auto B&W (cleans colourless pages only), Sepia, Night; bamboo-paper texture; eye protection (+ auto 7 pm–6 am); brightness.
- Library views: All, Recently read, Unread, Ongoing, Newly added (last 14 days), Completed, Favourites; sort by recent / added / name / progress; collections or flat comics; grid or list.
- Track bar like a music player: liquid scrubber with page-preview bubble, play = auto page turn, previous/next issue.
- AMOLED black + fluorescent orange, glass panels, water ripples and liquid progress (toggle off in Settings to save battery).

## Layout
`src/` web app (Preact) · `android/` Capacitor project incl. `ComicFsPlugin.java` (folder access via Storage Access Framework) · `.github/workflows/build-apk.yml`.

## Notes
- The CI build is a **debug-signed** APK: fine for personal use. For Play Store you need a release keystore.
- Real RAR (.cbr) archives are loaded fully into memory to read them; many `.cbr` files are really ZIPs and are detected automatically (those stream page by page).
