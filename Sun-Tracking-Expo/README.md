# ShadeLane (Expo)

Native **React Native / Expo** rewrite of ShadeLane — recommends which window to sit by (left or right) based on your route and the sun’s position.

This folder is a **separate app**. It does **not** replace:

- The Vite/Leaflet web app in the repo root
- The Capacitor wrap in `Sun-Tracking-Mobile`

| Project | What it is |
|---------|------------|
| `Sun-Tracking-Main/` (root) | Original web app (Vite + Leaflet) |
| `Sun-Tracking-Mobile/` | Capacitor shell around the web build |
| **`Sun-Tracking-Expo/`** (this app) | Native RN rewrite for Expo Go |

## Requirements

- Node.js 20+ recommended
- [Expo Go](https://expo.dev/go) on a physical Android or iOS phone (easiest path on Windows)
- Same Wi‑Fi as your computer for QR scanning (or use tunnel mode)

No API keys required (same public services as the web app):

- Place search — [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)
- Reverse geocode — [Nominatim](https://nominatim.org/)
- Routes — public [OSRM](https://project-osrm.org/) demo
- Map — `react-native-maps` (Apple Maps on iOS / Google Maps tiles in Expo Go on Android)

## Run with Expo Go (recommended)

```bash
cd "Sun-Tracking-Expo"
npm install
npm start
```

Or:

```bash
npx expo start
```

If port 8081 is already in use (for example by the Vite web app), Expo will ask for another port, or you can set one:

```bash
npx expo start --port 8082
```

1. Install **Expo Go** from the Play Store / App Store.
2. Scan the QR code shown in the terminal (or Expo Dev Tools in the browser).
   - **Android:** Expo Go → Scan QR code (or Camera app, depending on device).
   - **iOS:** Camera app → open in Expo Go.
3. If the device cannot reach your PC (corporate Wi‑Fi, etc.):

```bash
npx expo start --tunnel
```

## Android emulator

1. Install Android Studio and create an AVD.
2. Start the emulator, then:

```bash
npm start
```

Press `a` in the Expo CLI, or:

```bash
npx expo start --android
```

## iOS simulator

Requires a **Mac** with Xcode. On Windows you cannot run the iOS simulator — use Expo Go on a physical iPhone instead.

On a Mac:

```bash
npx expo start --ios
```

## Web

```bash
npx expo start --web
```

Web is supported for a quick smoke test. Maps behavior may differ from native (`react-native-maps` on web is limited). Prefer Expo Go for the real experience.

## How to use

1. Enter **origin** and **destination** (autocomplete), or **tap the map** to drop pins.
2. Optional: **+** adds a via stop; **◎** uses GPS for origin; **⇅** swaps ends.
3. Choose **Drive / Walk / Bike**, departure time, and **Shade** or **Sun**.
4. Tap **Find my seat**.

You’ll get:

- Seat recommendation card (left / right / either)
- Color-coded route (sun left / right / front-back-night)
- Alternative routes when OSRM returns them
- Timeline scrubber (‹ ›) with live sun-side label
- Recent trips (AsyncStorage), km/mi toggle, map style toggle
- Share advice via the system share sheet

## Ported vs deferred

### Ported (MVP)

- Open-Meteo search, Nominatim reverse, OSRM routing (drive/walk/bike + alternatives)
- NOAA/Meeus sun position + seat-side algorithm (same logic as web `advise.js` / `sun.js` / `geo.js`)
- Map with origin/destination/via markers and colored route segments
- Preference (shade/sun), mode, departure time
- Seat verdict, percentages, limitations note
- Timeline scrub + scrub marker
- Recent trips, units toggle, share advice

### Deferred / different from web

- Shareable URL query params / deep links
- Draggable map pins (tap-to-set + search instead)
- Pixel-perfect web panel / Leaflet CARTO light-dark tiles (uses platform map styles)
- Continuous scrubber slider (step buttons for reliability on RN)
- Copy-to-clipboard share link (uses native Share sheet for advice text)

## Project layout

```
Sun-Tracking-Expo/
  App.tsx                 # Main UI + planner flow
  src/
    lib/                  # Ported core logic (geo, sun, advise, route, time)
    components/           # PlaceSearch, RouteMap
    theme.ts
  README.md
```

## Troubleshooting

- **QR won’t connect:** same Wi‑Fi, or use `--tunnel`.
- **Maps blank on Android emulator:** ensure Google Play system image / Play Services AVD.
- **Location denied:** grant location when prompted, or type an origin instead.
- **OSRM / Nominatim errors:** public demos rate-limit; wait and retry.
