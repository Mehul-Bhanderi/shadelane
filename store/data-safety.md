# Google Play Data safety — ShadeLane answers

Use these answers in Play Console → App content → Data safety. Adjust if you add analytics, ads, accounts, or your own backend.

## Does your app collect or share any of the required user data types?
**Yes** (location is processed for reverse geocoding; approximate location may be processed by map tile providers)

## Location
| Type | Collected? | Shared? | Ephemeral? | Required? | Purpose |
|------|------------|---------|------------|-----------|---------|
| Approximate location | Yes (when user taps locate / map pin reverse geocode) | Yes — Nominatim (and map providers as needed) | Yes for network request; not stored on ShadeLane servers (none exist) | No — app works with typed addresses | App functionality |
| Precise location | Yes (same as above) | Yes — Nominatim | Same | No | App functionality |

## App activity / personal info / financial / etc.
**No** for accounts, contacts, photos, files, health, financial, messages, calendar, web history, app interactions analytics, crash logs (unless you later add a crash SDK).

## Device or other IDs
**No** unless a future SDK introduces them — currently no ads/analytics SDKs in Capacitor store build.

## Data handling
- Encrypted in transit: **Yes** (HTTPS)
- Users can request deletion: local data cleared via Settings → Clear recent trips / uninstall
- Committed to follow Play Families policies if targeting children: **No** (not directed at children)

## Third parties to disclose in privacy policy / Data safety notes
- Open-Meteo Geocoding
- OSRM public router
- OpenStreetMap Nominatim
- CARTO / OpenStreetMap tiles

## Apple App Privacy (nutrition labels)
- Precise Location: used for App Functionality, not linked to identity, not used for tracking
- Tracking: **No**
- No other collected data types unless you add SDKs
