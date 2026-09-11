import { getSunPosition } from './sun';
import {
  angleDiff,
  densifyRoute,
  distanceMeters,
  timestampRoute,
  type LatLon,
} from './geo';

const FRONT_BACK_HALF = 35;
const OVERHEAD_ELEV = 72;

export type SunSide =
  | 'left'
  | 'right'
  | 'front'
  | 'back'
  | 'overhead'
  | 'night';

export type Preference = 'shade' | 'sun';
export type Recommendation = 'left' | 'right' | 'either';

export type RouteInput = {
  coordinates: LatLon[];
  durationSeconds: number;
  distanceMeters: number;
};

export type Segment = LatLon & {
  time: Date;
  heading: number;
  frac: number;
  distanceAlongM: number;
  sunAzimuth: number;
  sunElevation: number;
  side: SunSide;
  relative: number | null;
  sideLabel: string;
};

export type JourneyAnalysis = {
  segments: Segment[];
  counts: Record<SunSide, number>;
  weights: Record<SunSide, number>;
  percentages: Record<SunSide, number>;
  recommendation: Recommendation;
  preference: Preference;
  explanation: string;
  confidence: 'night' | 'ambiguous' | 'close' | 'clear';
  durationMin: number;
  distanceKm: number;
  distanceMeters: number;
  durationSeconds: number;
  arrive: Date;
  shortTrip: boolean;
  veryShort: boolean;
  sampleCount: number;
  mode: string;
};

export function sampleStepMeters(distanceMeters: number) {
  if (distanceMeters < 1500) return 35;
  if (distanceMeters < 3000) return 50;
  if (distanceMeters < 6000) return 75;
  if (distanceMeters < 15000) return 120;
  if (distanceMeters < 40000) return 250;
  if (distanceMeters < 80000) return 450;
  return 700;
}

export function densifyForJourney(coords: LatLon[], distanceMeters: number) {
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

export function classifySunSide(
  heading: number,
  sunAzimuth: number,
  elevation: number
) {
  if (elevation < 0) {
    return {
      side: 'night' as const,
      relative: null,
      label: 'Night / below horizon',
    };
  }
  if (elevation >= OVERHEAD_ELEV) {
    return {
      side: 'overhead' as const,
      relative: angleDiff(sunAzimuth, heading),
      label: 'Overhead',
    };
  }

  const relative = angleDiff(sunAzimuth, heading);
  const abs = Math.abs(relative);

  if (abs <= FRONT_BACK_HALF) {
    return { side: 'front' as const, relative, label: 'Ahead' };
  }
  if (abs >= 180 - FRONT_BACK_HALF) {
    return { side: 'back' as const, relative, label: 'Behind' };
  }
  if (relative > 0) {
    return { side: 'right' as const, relative, label: 'Right window' };
  }
  return { side: 'left' as const, relative, label: 'Left window' };
}

export function analyzeJourney(
  route: RouteInput,
  depart: Date,
  preference: Preference,
  meta: { mode?: string } = {}
): JourneyAnalysis {
  const dense = densifyForJourney(route.coordinates, route.distanceMeters);
  const samples = timestampRoute(dense, depart, route.durationSeconds);

  const segments: Segment[] = samples.map((s) => {
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

  const counts: Record<SunSide, number> = {
    left: 0,
    right: 0,
    front: 0,
    back: 0,
    overhead: 0,
    night: 0,
  };

  const weights: Record<SunSide, number> = {
    left: 0,
    right: 0,
    front: 0,
    back: 0,
    overhead: 0,
    night: 0,
  };
  let totalWeight = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    counts[seg.side] += 1;
    const next = segments[i + 1];
    const w = next ? Math.max(distanceMeters(seg, next), 1) : 1;
    weights[seg.side] += w;
    totalWeight += w;
  }

  const n = segments.length || 1;
  const pct = (k: SunSide) =>
    totalWeight > 0
      ? Math.round((weights[k] / totalWeight) * 100)
      : Math.round((counts[k] / n) * 100);

  const daylightSides = weights.left + weights.right;
  const nightPct = pct('night');
  const shortTrip =
    route.durationSeconds < 20 * 60 || route.distanceMeters < 8000;
  const veryShort =
    route.durationSeconds < 8 * 60 || route.distanceMeters < 2500;

  let recommendation: Recommendation;
  let explanation: string;
  let confidence: JourneyAnalysis['confidence'];

  if (nightPct >= 90) {
    recommendation = 'either';
    explanation =
      'The sun stays below the horizon for nearly the whole trip — seat side won’t matter for sunlight.';
    confidence = 'night';
  } else if (
    daylightSides < totalWeight * 0.06 &&
    counts.left + counts.right < 3
  ) {
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

export function recommendationLabel(
  rec: Recommendation,
  preference: Preference
) {
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

export function recommendationShort(rec: Recommendation) {
  if (rec === 'either') return 'Either side';
  if (rec === 'left') return 'Left window';
  return 'Right window';
}
