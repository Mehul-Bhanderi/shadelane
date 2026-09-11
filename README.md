# ShadeLane

**ShadeLane** recommends which window to sit by — left or right — based on your route and the sun’s position. It works for short city hops (a few km / minutes) and longer trips, with a Google Maps–style full-bleed map and floating directions panel.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview
```

## Mobile / store apps

| App | Path | Package |
|-----|------|---------|
| Capacitor (recommended for stores) | `Sun-Tracking-Mobile/` | `com.shadelane.app` |
| Expo (alternate) | `Sun-Tracking-Expo/` | `com.shadelane.expo` |

Publish guide: **[STORE_PUBLISH.md](./STORE_PUBLISH.md)**  
Listing + Data safety drafts: `store/`

No API keys required for the Capacitor/web builds:

- Place search — [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api)
- Reverse geocode (map pins) — [Nominatim](https://nominatim.org/)
- Routes (drive / walk / bike + alternatives) — public [OSRM](https://project-osrm.org/) demo server
- Map tiles — CARTO / OpenStreetMap

Please use search and routing reasonably (debounced autocomplete; avoid hammering public endpoints).

## How to use (Maps-like UI)

1. The **map is the main canvas**. The directions panel floats on the left (desktop) or as a **bottom sheet** (mobile).
2. Set **origin** and **destination** by typing (autocomplete), clicking the map, dragging pins, or **Use my location** (◎) for origin.
3. Optional: **+** adds one intermediate stop; **⇅** swaps ends.
4. Pick a **journey mode**: Drive, Walk, or Bike.
5. Set **departure** time and whether you want **Shade** or **Sun**.
6. Click **Find my seat** (or let it refresh after both pins are set).

You’ll get:

- A live **seat recommendation card** on the map (left / right / either)
- **Color-coded route** segments (sun left / right / front-back-night) plus a legend
- **Alternative routes** when OSRM returns them — pick one; seat advice updates
- Trip summary: distance, duration, % sun on left vs right
- A **timeline scrubber** — drag to see sun side at that moment along the ride
- **Recent trips** (localStorage), **km/mi** toggle, **light/dark** map tiles
- **Shareable URL** query params and copy-advice / copy-link buttons

Near-identical origin and destination show a clear message instead of a useless route.

### URL params (optional)

`?from=lat,lon&to=lat,lon&fromLabel=…&toLabel=…&depart=YYYY-MM-DDTHH:mm&pref=shade|sun&mode=driving|walking|cycling&units=km|mi`  
Optional: `via`, `viaLabel`.

## Short journeys

City hops are first-class, not an afterthought:

- Sampling spacing tightens for short distances (~35–75 m under ~6 km) with a **minimum sample count** so a 2–5 km hop isn’t one coarse segment.
- Percentages are **distance-weighted** along the path.
- Copy calls out short hops when the left/right call is clear.

## Sun / seat algorithm

1. **Route** — OSRM returns geometry plus duration and distance (optional via-point and alternatives).
2. **Sample** — The path is densified with adaptive step size (denser for short trips). Timestamps use constant-speed travel from the router duration. Heading at each sample is the bearing to the next point.
3. **Sun position** — At each sample, solar **azimuth** (clockwise from true north) and **elevation** use **NOAA / Jean Meeus** formulas. Typical error is well under 1° for travel use.
4. **Side of vehicle** — Relative angle = `normalize(sunAzimuth − heading)` to [−180°, 180°]:
   - **elevation &lt; 0°** → night (no side sun)
   - **elevation ≳ 72°** → overhead
   - **|relative| ≲ 35°** → sun ahead; **|relative| ≳ 145°** → sun behind
   - **relative &gt; 0** → sun to the **right** of travel; **&lt; 0** → **left**
5. **Recommend** — Tallies left vs right over daylight side-sun (distance-weighted). Prefer shade → sit on the less sunny side; prefer sun → sit on the sunnier side. Ambiguous / night trips fall back to “either side.”

**Limitation:** Clear-sky geometry only — clouds, buildings, trees, and tunnels are not modeled.
