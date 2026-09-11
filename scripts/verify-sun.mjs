/**
 * Quick sanity checks for NOAA sun position (run: node --experimental-vm-modules scripts/verify-sun.mjs)
 * Expected: NYC summer noon → high elevation, azimuth near south (~180°).
 */
import { getSunPosition } from '../src/sun.js';
import { classifySunSide } from '../src/advise.js';
import { bearingDegrees, angleDiff } from '../src/geo.js';

// New York solar noon ≈ 16:56 UTC on 2024-06-21 (matches ~72.7° elev, az ≈ 180°)
const nycNoon = getSunPosition(40.7128, -74.006, new Date('2024-06-21T16:56:00Z'));
console.log('NYC summer solar noon:', {
  azimuth: nycNoon.azimuth.toFixed(1),
  elevation: nycNoon.elevation.toFixed(1),
});

if (nycNoon.elevation < 70 || nycNoon.elevation > 75) {
  console.error('FAIL: expected ~72.7° summer noon elevation in NYC');
  process.exit(1);
}
if (Math.abs(angleDiff(nycNoon.azimuth, 180)) > 5) {
  console.error('FAIL: expected near-south azimuth at solar noon');
  process.exit(1);
}

// Heading east, sun south → sun on right
const east = classifySunSide(90, 180, 40);
console.log('Heading east, sun south →', east.side);
if (east.side !== 'right') {
  console.error('FAIL: expected right');
  process.exit(1);
}

// Heading west, sun south → sun on left
const west = classifySunSide(270, 180, 40);
console.log('Heading west, sun south →', west.side);
if (west.side !== 'left') {
  console.error('FAIL: expected left');
  process.exit(1);
}

// Night
const night = classifySunSide(90, 180, -5);
if (night.side !== 'night') {
  console.error('FAIL: expected night');
  process.exit(1);
}

const brg = bearingDegrees({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
console.log('Bearing due east:', brg.toFixed(1));
if (Math.abs(brg - 90) > 1) {
  console.error('FAIL: bearing');
  process.exit(1);
}

console.log('All checks passed.');
