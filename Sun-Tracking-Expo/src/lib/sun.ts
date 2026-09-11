/**
 * Solar position from lat/lon/time using NOAA / Jean Meeus algorithms.
 * Azimuth: degrees clockwise from true north.
 * Elevation: degrees above horizon (refraction-corrected).
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function toJulianDate(date: Date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function atmosphericRefraction(elevationDeg: number) {
  if (elevationDeg > 85) return 0;
  const h = elevationDeg;
  if (elevationDeg > 5) {
    return (
      (1 / 3600) *
      (58.1 / Math.tan(h * DEG) -
        0.07 / Math.pow(Math.tan(h * DEG), 3) +
        0.000086 / Math.pow(Math.tan(h * DEG), 5))
    );
  }
  if (elevationDeg > -0.575) {
    return (
      (1 / 3600) *
      (1735 + h * (-518.2 + h * (103.4 + h * (-12.79 + h * 0.711))))
    );
  }
  return (1 / 3600) * (-20.774 / Math.tan(h * DEG));
}

export function getSunPosition(latDeg: number, lonDeg: number, date: Date) {
  const jd = toJulianDate(date);
  const jc = (jd - 2451545) / 36525;

  let L0 = (280.46646 + jc * (36000.76983 + 0.0003032 * jc)) % 360;
  if (L0 < 0) L0 += 360;

  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  const MRad = M * DEG;

  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);

  const C =
    Math.sin(MRad) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * MRad) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * MRad) * 0.000289;

  const sunTrueLong = L0 + C;

  const omega = 125.04 - 1934.136 * jc;
  const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const sunAppLongRad = sunAppLong * DEG;

  const seconds = 21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813));
  const meanObliq = 23 + (26 + seconds / 60) / 60;
  const obliqCorr = meanObliq + 0.00256 * Math.cos(omega * DEG);
  const obliqRad = obliqCorr * DEG;

  const declRad = Math.asin(Math.sin(obliqRad) * Math.sin(sunAppLongRad));
  const decl = declRad * RAD;

  const y = Math.tan(obliqRad / 2) ** 2;
  const eqTime =
    4 *
    RAD *
    (y * Math.sin(2 * L0 * DEG) -
      2 * e * Math.sin(MRad) +
      4 * e * y * Math.sin(MRad) * Math.cos(2 * L0 * DEG) -
      0.5 * y * y * Math.sin(4 * L0 * DEG) -
      1.25 * e * e * Math.sin(2 * MRad));

  const utcMinutes =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;

  const trueSolarTime = (utcMinutes + eqTime + 4 * lonDeg) % 1440;
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const latRad = latDeg * DEG;
  const haRad = hourAngle * DEG;

  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * RAD;

  const azDenom = Math.cos(latRad) * Math.sin(zenith * DEG);
  let azimuth: number;
  if (Math.abs(azDenom) > 0.0001) {
    let azRad = Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          (Math.sin(latRad) * Math.cos(zenith * DEG) - Math.sin(declRad)) /
            azDenom
        )
      )
    );
    if (hourAngle > 0) {
      azimuth = (azRad * RAD + 180) % 360;
    } else {
      azimuth = (540 - azRad * RAD) % 360;
    }
  } else {
    azimuth = latDeg > 0 ? 180 : 0;
  }

  const elevGeometric = 90 - zenith;
  const refraction = atmosphericRefraction(elevGeometric);
  const elevation = elevGeometric + refraction;

  return {
    azimuth: ((azimuth % 360) + 360) % 360,
    elevation,
    zenith: 90 - elevation,
    declination: decl,
    equationOfTime: eqTime,
  };
}
