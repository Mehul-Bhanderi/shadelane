/** Geospatial helpers: bearings, distances, route sampling. */

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export type LatLon = { lat: number; lon: number };

export function toRad(deg: number) {
  return deg * DEG;
}

export function toDeg(rad: number) {
  return rad * RAD;
}

/** Haversine distance in meters. */
export function distanceMeters(a: LatLon, b: LatLon) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a → b, degrees clockwise from north [0, 360). */
export function bearingDegrees(a: LatLon, b: LatLon) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;
}

/** Normalize angle difference to [-180, 180]. */
export function angleDiff(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

/**
 * Densify a polyline to roughly equal spacing, preserving order.
 */
export function densifyRoute(coords: LatLon[], stepMeters = 400): LatLon[] {
  if (coords.length < 2) return coords.slice();

  const out: LatLon[] = [{ ...coords[0] }];
  let carry = 0;

  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const segLen = distanceMeters(a, b);
    if (segLen < 1e-6) continue;

    let dist = stepMeters - carry;
    while (dist < segLen) {
      const t = dist / segLen;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lon: a.lon + (b.lon - a.lon) * t,
      });
      dist += stepMeters;
    }
    carry = segLen - (dist - stepMeters);
  }

  const last = coords[coords.length - 1];
  const prev = out[out.length - 1];
  if (distanceMeters(prev, last) > 1) out.push({ ...last });
  return out;
}

export type TimedPoint = LatLon & {
  time: Date;
  heading: number;
  frac: number;
  distanceAlongM: number;
};

/**
 * Assign timestamps along a densified route using constant speed from duration.
 */
export function timestampRoute(
  points: LatLon[],
  depart: Date,
  durationSeconds: number
): TimedPoint[] {
  if (points.length === 0) return [];

  let total = 0;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1], points[i]);
    cum.push(total);
  }

  const durationMs = Math.max(durationSeconds, 60) * 1000;
  const start = depart.getTime();

  return points.map((p, i) => {
    const frac = total > 0 ? cum[i] / total : 0;
    const time = new Date(start + frac * durationMs);
    const next = points[Math.min(i + 1, points.length - 1)];
    const prev = points[Math.max(i - 1, 0)];
    const heading =
      i < points.length - 1
        ? bearingDegrees(p, next)
        : bearingDegrees(prev, p);
    return { ...p, time, heading, frac, distanceAlongM: cum[i] };
  });
}
