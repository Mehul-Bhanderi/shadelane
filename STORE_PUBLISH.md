# ShadeLane — Publish to Play Store & App Store

**Primary store binary:** `Sun-Tracking-Mobile` (Capacitor) — package `com.shadelane.app`  
**Optional alternate:** `Sun-Tracking-Expo` — package `com.shadelane.expo` (do **not** publish both under the same public name)

This project is now store-hardened in code (privacy, settings, icons, SDK 36, manifests). The steps below require **your** paid developer accounts and signing secrets.

---

## What was implemented in the repo

- In-app **Settings** (units, theme, default shade/sun preference, clear recent trips, About)
- Bundled **Privacy Policy** + **Terms** (`public/legal/` → packaged in Capacitor `dist/legal/`)
- Offline banner
- Android: target/compile **API 36**, branded adaptive icon, brand colors, HTTPS-only network security, backup disabled, R8 minify, deep link scheme `shadelane://`
- iOS: when-in-use location only, privacy manifest, export compliance flag, URL scheme, version `1.0.0` (2)
- Expo: `eas.json`, versionCode/buildNumber, settings modal, privacy URLs in config
- Store copy + Data safety answers in `/store`

---

## Risky steps — need your permission / accounts (not automated)

| Item | Why | Cost / risk |
|------|-----|-------------|
| Google Play Console account | Required to upload AAB | One-time ~$25 |
| Apple Developer Program | Required to upload IPA | ~$99/year |
| Upload keystore / signing certs | Signs release builds | Losing the key blocks updates |
| Hosting privacy URL on HTTPS | Stores require a public privacy URL | Domain + hosting |
| Production routing backend | Public OSRM/Nominatim can rate-limit | Ops cost if you self-host |
| Google Maps API key (Expo Android maps) | Optional; Capacitor uses Leaflet | Billing if misconfigured |
| Actual store submission | Legal/content review | Rejection possible |

**Ask before:** creating paid accounts, generating production keystores in shared folders, buying domains, or submitting builds.

---

## Before you submit (checklist)

1. Replace `support@shadelane.app` and `https://shadelane.app/...` with your real support email and hosted legal URLs (update `public/legal/*`, Settings links, Expo `app.json` extra, and `/store/listing-copy.md`).
2. Host `privacy.html` and `terms.html` on HTTPS and paste those URLs into Play Console + App Store Connect.
3. Create screenshots on a real device (see `/store/listing-copy.md`).
4. Complete Play **Data safety** using `/store/data-safety.md`.
5. Complete Apple **App Privacy** questionnaire (same disclosures).
6. Decide production routing: keep public demos only for low traffic, or self-host OSRM / licensed geocoder.

---

## Android release (Capacitor)

```bash
cd Sun-Tracking-Mobile
npm install
npm run sync
```

Generate an upload keystore **on your machine** (do not commit `.jks` or passwords):

```bash
keytool -genkey -v -keystore shadelane-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias shadelane
```

Copy `android/keystore.properties.example` → `android/keystore.properties` and fill values. Then add a `signingConfigs` block in `android/app/build.gradle` that reads that file (template in example comments / STORE notes).

Open Android Studio:

```bash
npm run cap:android
```

Build → Generate Signed Bundle / APK → **Android App Bundle (.aab)** → upload to Play Console (Internal testing first).

Play Console also needs:
- App name, descriptions (`store/listing-copy.md`)
- Icon 512 (`store/assets/icon-512.png`)
- Feature graphic 1024×500 (create separately)
- Privacy policy URL
- Data safety form

---

## iOS release (Capacitor)

Requires a Mac with Xcode.

```bash
cd Sun-Tracking-Mobile
npm run sync
npm run cap:ios
```

In Xcode:
1. Set your **Team** (Apple Developer)
2. Confirm bundle id `com.shadelane.app`
3. Archive → Distribute App → App Store Connect

App Store Connect needs:
- Privacy Policy URL
- Support URL
- Age rating questionnaire
- App Privacy answers
- Screenshots for required device sizes

---

## Expo alternate path

```bash
cd Sun-Tracking-Expo
npx eas-cli login
npx eas init   # replace projectId in app.json
npx eas build --platform all --profile production
npx eas submit --platform all --profile production
```

Do **not** publish Expo under the same store listing as Capacitor (`com.shadelane.app` vs `com.shadelane.expo`).

---

## Recommended ship order

1. Host legal pages
2. Internal Play track + TestFlight
3. Fix review feedback
4. Production release
5. Later: self-hosted routing if traffic grows
