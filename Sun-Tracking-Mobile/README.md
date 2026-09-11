# ShadeLane Mobile

Native **Android** and **iOS** app for [ShadeLane](../README.md) — seat advice from your route and the sun.

## Approach

**Capacitor** wraps the existing Vite + Leaflet web app in native shells.

Why Capacitor (not Expo/React Native):

- The web app is **vanilla JS + Leaflet**, not React
- Capacitor reuses the same UI, routing, and sun logic with almost no rewrite
- Expo would require a full native UI rewrite and map stack change

## Folder layout

```
Sun-Tracking-Main/                 ← original web project (unchanged)
└── Sun-Tracking-Mobile/           ← this Capacitor app (copy + native shells)
    ├── src/                       ← same ShadeLane app logic
    ├── android/                   ← Android Studio project
    ├── ios/                       ← Xcode project (build on macOS)
    ├── dist/                      ← Vite build (synced into native apps)
    └── capacitor.config.json
```

The original web project at the repo root is **not** modified by this mobile app.

## Prerequisites

- Node.js 18+
- **Android:** Android Studio + Android SDK (emulator or device)
- **iOS:** macOS + Xcode 15+ (required to build/run iOS; the `ios/` folder can still be generated on Windows)

## Setup

```bash
cd Sun-Tracking-Mobile
npm install
npm run sync
```

`npm run sync` builds the web assets and copies them into the Android/iOS projects.

## Run on Android

```bash
cd Sun-Tracking-Mobile
npm run android
```

Or manually:

```bash
npm run sync
npx cap open android
```

In Android Studio: select an emulator or device → **Run**.

## Run on iOS (macOS only)

```bash
cd Sun-Tracking-Mobile
npm run ios
```

Or:

```bash
npm run sync
npx cap open ios
```

In Xcode: pick a simulator or device → **Run**.

First time on a physical iPhone: set your Team under **Signing & Capabilities**.

## Web preview (same UI in the browser)

```bash
cd Sun-Tracking-Mobile
npm run dev
```

Opens on port **5174** so it does not clash with the original web app on 5173.

## App identity

| Setting | Value |
|--------|--------|
| App name | ShadeLane |
| Package / bundle ID | `com.shadelane.app` |
| Platforms | Android + iOS |

## Features preserved

- Full-bleed Leaflet map + bottom/side directions panel
- Place search, map pins, via stop, drive/walk/bike
- Sun/shade seat recommendation, colored route, timeline scrubber
- Recent trips, km/mi, light/dark tiles, share/copy
- Native geolocation permissions via `@capacitor/geolocation`
- Status bar styling and Android back-button handling

## Limitations

- **iOS builds require a Mac** with Xcode. On Windows you can develop/sync the project, but you cannot compile or run the iOS app locally.
- Still depends on public APIs (OSRM, Open-Meteo, Nominatim, CARTO tiles) — needs network access.
- Clear-sky sun geometry only (same as the web app).
- For store release you will add icons/splash screens and signing certificates.

## Updating after code changes

Edit files under `Sun-Tracking-Mobile/src` (or `index.html`), then:

```bash
npm run sync
```

Re-run from Android Studio / Xcode, or use Live Reload during development if you point Capacitor `server.url` at your Vite dev server (optional; not enabled by default).
