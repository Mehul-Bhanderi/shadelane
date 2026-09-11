import { getSunPosition } from './sun.js';
import { angleDiff, densifyRoute, distanceMeters, timestampRoute } from './geo.js';

/** Relative azimuth thresholds (degrees from heading). */
const FRONT_BACK_HALF = 35; // |rel| < 35 → front; |rel| > 145 → back
const OVERHEAD_ELEV = 72; // sun nearly overhead → neither side dominates

/**
 * Adaptive sample spacing — short city hops get dense samples so left/right
 * isn’t a single coarse segment.
 * @param {number} distanceMeters
 */
export function sampleStepMeters(distanceMeters) {
  if (distanceMeters < 1500) return 35;
  if (distanceMeters < 3000) return 50;
  if (distanceMeters < 6000) return 75;
  if (distanceMeters < 15000) return 120;
  if (distanceMeters < 40000) return 250;
  if (distanceMeters < 80000) return 450;
  return 700;
}

/**
 * Ensure enough samples on very short polylines (few OSRM vertices).
 * @param {{lat:number, lon:number}[]} coords
 * @param {number} distanceMeters
 */
export function densifyForJourney(coords, distanceMeters) {
  const step = sampleStepMeters(distanceMeters);
  let dense = densifyRoute(coords, step);

  const minSamples =
    distanceMeters < 3000 ? 28 : distanceMeters < 10000 ? 22 : 16;

  if (dense.length < minSamples && distanceMeters > 40) {
    const tighter = Math.max(20, distanceMeters / minSamples);
    dense = densifyRoute(coords, tighter);
  }

  return dense;
}

/**
 * Classify sun relative to vehicle heading.
 * relative = sunAzimuth − heading, normalized to [-180, 180]
 * positive → sun clockwise from nose → RIGHT side of vehicle
 * negative → LEFT side
 */
export function classifySunSide(heading, sunAzimuth, elevation) {
  if (elevation < 0) {
    return { side: 'night', relative: null, label: 'Night / below horizon' };
  }
  if (elevation >= OVERHEAD_ELEV) {
    return { side: 'overhead', relative: angleDiff(sunAzimuth, heading), label: 'Overhead' };
  }

  const relative = angleDiff(sunAzimuth, heading);
  const abs = Math.abs(relative);

  if (abs <= FRONT_BACK_HALF) {
    return { side: 'front', relative, label: 'Ahead' };
  }
  if (abs >= 180 - FRONT_BACK_HALF) {
    return { side: 'back', relative, label: 'Behind' };
  }
  if (relative > 0) {
    return { side: 'right', relative, label: 'Right window' };
  }
  return { side: 'left', relative, label: 'Left window' };
}

/**
 * Analyze a full route for seat recommendation.
 * @param {{
 *   coordinates: {lat:number, lon:number}[],
 *   durationSeconds: number,
 *   distanceMeters: number,
 * }} route
 * @param {Date} depart
 * @param {'shade'|'sun'} preference
 * @param {{ mode?: string }} [meta]
 */
export function analyzeJourney(route, depart, preference, meta = {}) {
  const dense = densifyForJourney(route.coordinates, route.distanceMeters);
  const samples = timestampRoute(dense, depart, route.durationSeconds);

  const segments = samples.map((s) => {
    const sun = getSunPosition(s.lat, s.lon, s.time);
    const cls = classifySunSide(s.heading, sun.azimuth, sun.elevation);
    return {
      ...s,
      sunAzimuth: sun.azimuth,
      sunElevation: sun.elevation,
      side: cls.side,
      relative: cls.relative,
      sideLabel: cls.label,
    };
  });

  const counts = {
    left: 0,
    right: 0,
    front: 0,
    back: 0,
    overhead: 0,
    night: 0,
  };

  // Weight by along-route distance so short dense trips stay fair
  const weights = { left: 0, right: 0, front: 0, back: 0, overhead: 0, night: 0 };
  let totalWeight = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    counts[seg.side] = (counts[seg.side] || 0) + 1;
    const next = segments[i + 1];
    const w = next ? Math.max(distanceMeters(seg, next), 1) : 1;
    weights[seg.side] = (weights[seg.side] || 0) + w;
    totalWeight += w;
  }

  const n = segments.length || 1;
  const pct = (k) =>
    totalWeight > 0
      ? Math.round((weights[k] / totalWeight) * 100)
      : Math.round((counts[k] / n) * 100);

  const daylightSides = weights.left + weights.right;
  const nightPct = pct('night');
  const shortTrip =
    route.durationSeconds < 20 * 60 || route.distanceMeters < 8000;
  const veryShort =
    route.durationSeconds < 8 * 60 || route.distanceMeters < 2500;

  let recommendation;
  let explanation;
  let confidence;

  if (nightPct >= 90) {
    recommendation = 'either';
    explanation =
      'The sun stays below the horizon for nearly the whole trip — seat side won’t matter for sunlight.';
    confidence = 'night';
  } else if (daylightSides < totalWeight * 0.06 && counts.left + counts.right < 3) {
    recommendation = 'either';
    const frontBack = pct('front') + pct('back') + pct('overhead');
    explanation =
      frontBack > 40
        ? `Sun is mostly ahead, behind, or overhead (~${frontBack}% of the path), so left and right windows see similar light.`
        : 'Not enough clear left/right sun exposure to pick a side confidently.';
    confidence = 'ambiguous';
  } else {
    const leftShare = weights.left / Math.max(daylightSides, 1e-6);
    const rightShare = weights.right / Math.max(daylightSides, 1e-6);
    const sunnier = leftShare >= rightShare ? 'left' : 'right';
    const shadier = sunnier === 'left' ? 'right' : 'left';
    const sunPctOfDaylight = Math.round(Math.max(leftShare, rightShare) * 100);
    const sunPctOfTrip = pct(sunnier);
    const margin = Math.abs(leftShare - rightShare);

    if (preference === 'shade') {
      recommendation = shadier;
      explanation = veryShort
        ? `Short hop: sun favors the ${sunnier} window (~${sunPctOfTrip}% of the path). Sit ${shadier} for more shade.`
        : `Sun hits the ${sunnier} window for ~${sunPctOfTrip}% of the trip (~${sunPctOfDaylight}% of clear side-sun). Sit on the ${shadier} for more shade.`;
    } else {
      recommendation = sunnier;
      explanation = veryShort
        ? `Short hop: sun favors the ${sunnier} window (~${sunPctOfTrip}% of the path). Sit ${sunnier} to catch it.`
        : `Sun hits the ${sunnier} window for ~${sunPctOfTrip}% of the trip (~${sunPctOfDaylight}% of clear side-sun). Sit on the ${sunnier} to catch more sun.`;
    }
    confidence = margin < 0.12 ? 'close' : 'clear';
  }

  const durationMin = Math.max(1, Math.round(route.durationSeconds / 60));
  const distanceKm = route.distanceMeters / 1000;

  return {
    segments,
    counts,
    weights,
    percentages: {
      left: pct('left'),
      right: pct('right'),
      front: pct('front'),
      back: pct('back'),
      overhead: pct('overhead'),
      night: pct('night'),
    },
    recommendation,
    preference,
    explanation,
    confidence,
    durationMin,
    distanceKm,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    arrive: samples.length ? samples[samples.length - 1].time : depart,
    shortTrip,
    veryShort,
    sampleCount: segments.length,
    mode: meta.mode || 'driving',
  };
}

export function recommendationLabel(rec, preference) {
  if (rec === 'either') return 'Either side works';
  if (rec === 'left') {
    return preference === 'shade'
      ? 'Left window (more shade)'
      : 'Left window (more sun)';
  }
  return preference === 'shade'
    ? 'Right window (more shade)'
    : 'Right window (more sun)';
}

export function recommendationShort(rec) {
  if (rec === 'either') return 'Either side';
  if (rec === 'left') return 'Left window';
  return 'Right window';
}
