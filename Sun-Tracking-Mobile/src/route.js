/**
 * Free geocoding (Open-Meteo + Nominatim reverse) + routes (OSRM public demo).
 * No API keys required. Debounce callers; respect public rate limits.
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

/** @typedef {'driving'|'walking'|'cycling'} JourneyMode */

/**
 * @param {string} query
 * @param {number} [count=5]
 * @returns {Promise<{name:string, lat:number, lon:number, label:string, timezone:string|null}[]>}
 */
export async function searchPlaces(query, count = 5) {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('name', q);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url);
  if (!res.ok) throw new Error('Place search failed. Try again in a moment.');
  const data = await res.json();
  const results = data.results || [];

  return results.map((r) => {
    const parts = [r.name, r.admin1, r.country].filter(Boolean);
    return {
      name: r.name,
      lat: r.latitude,
      lon: r.longitude,
      label: parts.join(', '),
      timezone: r.timezone || null,
    };
  });
}

/**
 * Reverse-geocode a map pin (Nominatim). Falls back to coordinate label.
 * @param {number} lat
 * @param {number} lon
 */
export async function reverseGeocode(lat, lon) {
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '16');
  url.searchParams.set('addressdetails', '0');

  try {
    // Browsers cannot set User-Agent; Nominatim allows anonymous reverse with CORS.
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('reverse failed');
    const data = await res.json();
    const label =
      data.display_name ||
      `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    return {
      name: data.name || label.split(',')[0],
      lat,
      lon,
      label,
      timezone: null,
    };
  } catch {
    return {
      name: 'Dropped pin',
      lat,
      lon,
      label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      timezone: null,
    };
  }
}

/**
 * @param {{lat:number, lon:number}} origin
 * @param {{lat:number, lon:number}} destination
 * @param {{
 *   mode?: JourneyMode,
 *   via?: {lat:number, lon:number}|null,
 *   alternatives?: boolean,
 * }} [opts]
 * @returns {Promise<{
 *   routes: {
 *     coordinates: {lat:number, lon:number}[],
 *     durationSeconds: number,
 *     distanceMeters: number,
 *     summary: string,
 *   }[],
 *   mode: JourneyMode,
 * }>}
 */
export async function fetchRoutes(origin, destination, opts = {}) {
  const mode = opts.mode || 'driving';
  const points = [origin];
  if (opts.via) points.push(opts.via);
  points.push(destination);

  const path = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const alts = opts.alternatives !== false ? 'true' : 'false';
  const url = `${OSRM_BASE}/${mode}/${path}?overview=full&geometries=geojson&alternatives=${alts}&steps=false`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not fetch a ${mode} route. The routing service may be busy — try again.`
    );
  }
  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No ${mode} route found between those places.`);
  }

  const routes = data.routes.map((route, i) => {
    const coordinates = route.geometry.coordinates.map(([lon, lat]) => ({
      lat,
      lon,
    }));
    return {
      coordinates,
      durationSeconds: route.duration,
      distanceMeters: route.distance,
      summary: routeLabel(route, i, mode),
    };
  });

  return { routes, mode };
}

/** @deprecated use fetchRoutes */
export async function fetchDrivingRoute(origin, destination) {
  const { routes } = await fetchRoutes(origin, destination, {
    mode: 'driving',
    alternatives: false,
  });
  return routes[0];
}

function routeLabel(route, index, mode) {
  const km = route.distance / 1000;
  const min = Math.round(route.duration / 60);
  const modeWord =
    mode === 'walking' ? 'Walk' : mode === 'cycling' ? 'Bike' : 'Drive';
  if (index === 0) return `${modeWord} · fastest`;
  return `Alt ${index} · ${formatShortDuration(min)} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function formatShortDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
