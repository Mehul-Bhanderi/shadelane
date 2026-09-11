import './style.css';
import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { searchPlaces, fetchRoutes, reverseGeocode } from './route.js';
import {
  analyzeJourney,
  recommendationLabel,
  recommendationShort,
} from './advise.js';
import { wallTimeToDate } from './time.js';
import { distanceMeters } from './geo.js';

const isNative = Capacitor.isNativePlatform();

async function initNativeShell() {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#c5d9e4' });
  } catch {
    /* StatusBar unavailable on some platforms */
  }
  document.body.classList.add('is-native');
  App.addListener('backButton', ({ canGoBack }) => {
    const sheet = document.getElementById('settings-sheet');
    if (sheet && !sheet.hidden) {
      closeSettings();
      return;
    }
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
}

async function getDevicePosition() {
  if (isNative) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== 'granted') {
      const asked = await Geolocation.requestPermissions();
      if (asked.location !== 'granted') {
        throw new Error('Location permission denied or unavailable.');
      }
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation isn’t available in this browser.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      () => reject(new Error('Location permission denied or unavailable.')),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });
}

const SIDE_COLORS = {
  left: '#E07A3A',
  right: '#2A8F8A',
  front: '#8A93A0',
  back: '#8A93A0',
  overhead: '#8A93A0',
  night: '#3D4A5C',
};

const RECENT_KEY = 'shadelane-recent-v1';
const UNITS_KEY = 'shadelane-units';
const THEME_KEY = 'shadelane-theme';
const PREF_KEY = 'shadelane-default-pref';
const APP_VERSION = '1.0.0';
const NEAR_SAME_M = 60;

const form = document.getElementById('planner-form');
const originInput = document.getElementById('origin-input');
const destInput = document.getElementById('destination-input');
const viaInput = document.getElementById('via-input');
const originList = document.getElementById('origin-suggestions');
const destList = document.getElementById('destination-suggestions');
const viaList = document.getElementById('via-suggestions');
const departInput = document.getElementById('depart-input');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');
const resultsEl = document.getElementById('results');
const routesPanel = document.getElementById('routes-panel');
const routeList = document.getElementById('route-list');
const seatCard = document.getElementById('seat-card');
const mapLegend = document.getElementById('map-legend');
const panel = document.getElementById('panel');
const scrubber = document.getElementById('scrubber');
const viaRow = document.getElementById('via-row');

const selected = {
  origin: null,
  destination: null,
  via: null,
};

/** @type {import('leaflet').Map} */
let map;
/** @type {import('leaflet').TileLayer} */
let tileLayer;
/** @type {import('leaflet').LayerGroup} */
let routeLayer;
/** @type {import('leaflet').LayerGroup} */
let altLayer;
/** @type {import('leaflet').Marker|null} */
let originMarker = null;
/** @type {import('leaflet').Marker|null} */
let destMarker = null;
/** @type {import('leaflet').Marker|null} */
let viaMarker = null;
/** @type {import('leaflet').Marker|null} */
let scrubMarker = null;

let routeBundle = null;
let selectedRouteIndex = 0;
let currentAnalysis = null;
let units = localStorage.getItem(UNITS_KEY) === 'mi' ? 'mi' : 'km';
let mapTheme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
let pinTarget = 'auto'; // next map click: origin | destination | via | auto
let reverseBusy = false;

const TILES = {
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap &copy; CARTO',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; OpenStreetMap &copy; CARTO',
  },
};

function pinIcon(kind) {
  return L.divIcon({
    className: 'pin-icon',
    html: `<div class="pin pin--${kind}"></div>`,
    iconSize: kind === 'via' ? [22, 22] : [28, 28],
    iconAnchor: kind === 'via' ? [11, 22] : [14, 28],
  });
}

function scrubIcon() {
  return L.divIcon({
    className: 'pin-icon',
    html: '<div class="scrub-dot"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function setDefaultDepart() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - (now.getMinutes() % 5) + 5);
  now.setSeconds(0);
  now.setMilliseconds(0);
  departInput.value = toLocalInputValue(now);
}

function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('is-error', isError);
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function formatDistance(meters) {
  if (units === 'mi') {
    const mi = meters / 1609.344;
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

function bindAutocomplete(input, list, key) {
  const run = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    try {
      const places = await searchPlaces(q, 6);
      if (!places.length) {
        list.hidden = true;
        list.innerHTML = '';
        return;
      }
      list.innerHTML = places
        .map(
          (p, i) =>
            `<li role="option" tabindex="-1" data-index="${i}">${escapeHtml(p.label)}</li>`
        )
        .join('');
      list._places = places;
      list.hidden = false;
    } catch {
      list.hidden = true;
    }
  }, 280);

  input.addEventListener('input', () => {
    selected[key] = null;
    run();
  });

  input.addEventListener('focus', () => {
    if (list.children.length) list.hidden = false;
  });

  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const place = list._places?.[Number(li.dataset.index)];
    if (!place) return;
    applyPlace(key, place, { autoRoute: true });
    list.hidden = true;
  });

  document.addEventListener('click', (e) => {
    if (!list.contains(e.target) && e.target !== input) list.hidden = true;
  });
}

function applyPlace(key, place, { syncMarker = true, skipUrl = false, autoRoute = false } = {}) {
  selected[key] = place;
  const input =
    key === 'origin' ? originInput : key === 'destination' ? destInput : viaInput;
  if (input) input.value = place.label;
  if (syncMarker) upsertMarker(key, place.lat, place.lon);
  if (!skipUrl) syncUrlFromState();
  if (autoRoute && selected.origin && selected.destination) {
    runAnalysis({ quiet: true });
  }
}

async function resolvePlace(input, key) {
  if (selected[key] && selected[key].label === input.value.trim()) {
    return selected[key];
  }
  const q = input.value.trim();
  if (!q) {
    if (key === 'via') return null;
    throw new Error(`Enter a ${key === 'origin' ? 'starting point' : 'destination'}.`);
  }
  const places = await searchPlaces(q, 1);
  if (!places.length) {
    throw new Error(`Couldn’t find “${q}”. Try a clearer place name.`);
  }
  applyPlace(key, places[0]);
  return places[0];
}

function ensureMap() {
  if (map) return map;

  map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
  }).setView([20, 0], 2);

  setTileTheme(mapTheme);

  routeLayer = L.layerGroup().addTo(map);
  altLayer = L.layerGroup().addTo(map);

  map.on('click', onMapClick);

  // Keep zoom control clear of panel on desktop
  map.zoomControl.setPosition('bottomright');

  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

function setTileTheme(theme) {
  mapTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.body.classList.toggle('theme-dark', theme === 'dark');
  const cfg = TILES[theme];
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(cfg.url, {
    maxZoom: 20,
    attribution: cfg.attr,
  }).addTo(map);
}

function upsertMarker(key, lat, lon) {
  ensureMap();
  const latlng = L.latLng(lat, lon);
  if (key === 'origin') {
    if (originMarker) {
      originMarker.setLatLng(latlng);
    } else {
      originMarker = L.marker(latlng, {
        draggable: true,
        icon: pinIcon('origin'),
        title: 'Origin',
      }).addTo(map);
      originMarker.on('dragend', () => onMarkerDrag('origin', originMarker));
    }
  } else if (key === 'destination') {
    if (destMarker) {
      destMarker.setLatLng(latlng);
    } else {
      destMarker = L.marker(latlng, {
        draggable: true,
        icon: pinIcon('dest'),
        title: 'Destination',
      }).addTo(map);
      destMarker.on('dragend', () => onMarkerDrag('destination', destMarker));
    }
  } else if (key === 'via') {
    viaRow.hidden = false;
    if (viaMarker) {
      viaMarker.setLatLng(latlng);
    } else {
      viaMarker = L.marker(latlng, {
        draggable: true,
        icon: pinIcon('via'),
        title: 'Stop',
      }).addTo(map);
      viaMarker.on('dragend', () => onMarkerDrag('via', viaMarker));
    }
  }
  fitEndpoints();
}

async function onMarkerDrag(key, marker) {
  const { lat, lng } = marker.getLatLng();
  if (reverseBusy) return;
  reverseBusy = true;
  setStatus('Updating place name…');
  try {
    const place = await reverseGeocode(lat, lng);
    applyPlace(key, place, { syncMarker: false });
    setStatus('');
    if (selected.origin && selected.destination) {
      await runAnalysis({ quiet: true });
    }
  } catch (err) {
    setStatus(err.message || 'Could not update pin.', true);
  } finally {
    reverseBusy = false;
  }
}

async function onMapClick(e) {
  if (reverseBusy) return;
  const { lat, lng } = e.latlng;
  let key = pinTarget;
  if (key === 'auto') {
    if (!selected.origin) key = 'origin';
    else if (!selected.destination) key = 'destination';
    else key = 'destination';
  }
  reverseBusy = true;
  setStatus('Looking up that spot…');
  try {
    const place = await reverseGeocode(lat, lng);
    applyPlace(key, place);
    pinTarget = 'auto';
    document.getElementById('map-hint').textContent =
      'Tip: click the map to set points, or drag the pins.';
    setStatus('');
    if (selected.origin && selected.destination) {
      await runAnalysis({ quiet: true });
    }
  } catch (err) {
    setStatus(err.message || 'Map lookup failed.', true);
  } finally {
    reverseBusy = false;
  }
}

function fitEndpoints() {
  const pts = [];
  if (originMarker) pts.push(originMarker.getLatLng());
  if (viaMarker) pts.push(viaMarker.getLatLng());
  if (destMarker) pts.push(destMarker.getLatLng());
  if (pts.length === 1) {
    map.setView(pts[0], Math.max(map.getZoom(), 13));
  } else if (pts.length > 1) {
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 15 });
  }
}

function clearRouteLayers() {
  if (routeLayer) routeLayer.clearLayers();
  if (altLayer) altLayer.clearLayers();
  if (scrubMarker) {
    map.removeLayer(scrubMarker);
    scrubMarker = null;
  }
}

function renderAlternatives(routes, activeIndex) {
  altLayer.clearLayers();
  routes.forEach((r, i) => {
    if (i === activeIndex) return;
    const latlngs = r.coordinates.map((c) => [c.lat, c.lon]);
    L.polyline(latlngs, {
      color: '#7a8b98',
      weight: 5,
      opacity: 0.45,
      lineCap: 'round',
      interactive: true,
    })
      .on('click', () => selectRoute(i))
      .addTo(altLayer);
  });
}

function renderColoredRoute(segments) {
  routeLayer.clearLayers();
  for (let i = 1; i < segments.length; i++) {
    const a = segments[i - 1];
    const b = segments[i];
    const color = SIDE_COLORS[a.side] || SIDE_COLORS.front;
    L.polyline(
      [
        [a.lat, a.lon],
        [b.lat, b.lon],
      ],
      { color, weight: 6, opacity: 0.92, lineCap: 'round' }
    ).addTo(routeLayer);
  }
  const latlngs = segments.map((s) => [s.lat, s.lon]);
  if (latlngs.length) {
    map.fitBounds(latlngs, { padding: [56, 56], maxZoom: 16 });
  }
  setTimeout(() => map.invalidateSize(), 60);
}

function renderRouteList(routes, activeIndex) {
  if (!routes.length) {
    routesPanel.hidden = true;
    return;
  }
  routesPanel.hidden = routes.length < 2;
  routeList.innerHTML = routes
    .map((r, i) => {
      const seatHint = '';
      return `
      <button type="button" class="route-option ${i === activeIndex ? 'is-selected' : ''}" data-index="${i}" role="option" aria-selected="${i === activeIndex}">
        <span class="route-option__title">${escapeHtml(r.summary)}</span>
        <span class="route-option__meta">${formatDuration(Math.max(1, Math.round(r.durationSeconds / 60)))} · ${formatDistance(r.distanceMeters)}${seatHint}</span>
      </button>`;
    })
    .join('');
}

function renderTimeline(segments) {
  const el = document.getElementById('timeline');
  el.innerHTML = '';
  if (!segments.length) return;

  const n = segments.length;
  const buckets = Math.min(64, n);
  const size = Math.ceil(n / buckets);

  for (let i = 0; i < n; i += size) {
    const slice = segments.slice(i, i + size);
    const tally = {};
    for (const s of slice) tally[s.side] = (tally[s.side] || 0) + 1;
    const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const bar = document.createElement('div');
    bar.className = 'timeline__bar';
    bar.style.background = SIDE_COLORS[dominant] || SIDE_COLORS.front;
    bar.title = `${slice[0].sideLabel} · ${formatTime(slice[0].time)}`;
    el.appendChild(bar);
  }

  document.getElementById('timeline-start').textContent = formatTime(
    segments[0].time
  );
  document.getElementById('timeline-end').textContent = formatTime(
    segments[segments.length - 1].time
  );

  scrubber.max = String(Math.max(0, segments.length - 1));
  scrubber.value = '0';
  updateScrubber(0);
}

function updateScrubber(index) {
  if (!currentAnalysis?.segments?.length) return;
  const segs = currentAnalysis.segments;
  const i = Math.min(Math.max(0, Number(index) || 0), segs.length - 1);
  const s = segs[i];
  const live = document.getElementById('scrubber-live');
  live.textContent = `${formatTime(s.time)} · ${s.sideLabel}`;

  ensureMap();
  if (!scrubMarker) {
    scrubMarker = L.marker([s.lat, s.lon], {
      icon: scrubIcon(),
      interactive: false,
      zIndexOffset: 600,
    }).addTo(map);
  } else {
    scrubMarker.setLatLng([s.lat, s.lon]);
  }
}

function renderVerdict(analysis) {
  const title = recommendationLabel(analysis.recommendation, analysis.preference);
  document.getElementById('verdict-eyebrow').textContent =
    analysis.preference === 'shade' ? 'Best seat for shade' : 'Best seat for sun';
  document.getElementById('verdict-title').textContent = title;
  document.getElementById('verdict-body').textContent = analysis.explanation;

  const p = analysis.percentages;
  const stats = document.getElementById('stats');
  stats.innerHTML = `
    <li><strong>${p.left}%</strong> sun on left</li>
    <li><strong>${p.right}%</strong> sun on right</li>
    <li><strong>${p.front + p.back + p.overhead}%</strong> front / back / overhead</li>
    <li><strong>${p.night}%</strong> night</li>
    <li><strong>${formatDuration(analysis.durationMin)}</strong> · ${formatDistance(analysis.distanceMeters)}</li>
  `;

  const notes = [];
  notes.push(
    'Cloud cover, tunnels, and roadside shade aren’t modeled — clear-sky geometry only.'
  );
  if (analysis.veryShort) {
    notes.push(
      `Short hop sampled at ${analysis.sampleCount} points for a confident left/right call.`
    );
  } else if (analysis.shortTrip) {
    notes.push('City-scale trip: denser sampling keeps turns from washing out.');
  }
  if (analysis.confidence === 'close') {
    notes.push('Left and right are close — either window is fine.');
  }
  if (analysis.confidence === 'night') {
    notes.push('Consider a daytime departure if sun/shade matters.');
  }
  document.getElementById('limitation-note').textContent = notes.join(' ');

  // Floating seat card
  seatCard.hidden = false;
  document.getElementById('seat-card-eyebrow').textContent =
    analysis.preference === 'shade' ? 'Sit for shade' : 'Sit for sun';
  document.getElementById('seat-card-title').textContent = recommendationShort(
    analysis.recommendation
  );
  document.getElementById('seat-card-meta').textContent = `${formatDuration(
    analysis.durationMin
  )} · ${formatDistance(analysis.distanceMeters)} · L ${p.left}% / R ${p.right}%`;

  mapLegend.hidden = false;
  resultsEl.hidden = false;
}

function getMode() {
  const el = form.querySelector('input[name="mode"]:checked');
  return el?.value || 'driving';
}

function getPreference() {
  return form.preference.value === 'sun' ? 'sun' : 'shade';
}

async function runAnalysis({ quiet = false } = {}) {
  ensureMap();
  submitBtn.disabled = true;
  if (!quiet) setStatus('Tracing route and reading the sky…');

  try {
    const [origin, destination] = await Promise.all([
      resolvePlace(originInput, 'origin'),
      resolvePlace(destInput, 'destination'),
    ]);

    let via = null;
    if (!viaRow.hidden && viaInput.value.trim()) {
      via = await resolvePlace(viaInput, 'via');
    }

    const gap = distanceMeters(origin, destination);
    if (gap < NEAR_SAME_M && !via) {
      throw new Error(
        'Origin and destination are almost the same spot. Pick two places at least a short walk apart.'
      );
    }

    const depart = wallTimeToDate(departInput.value, origin.timezone);
    if (Number.isNaN(depart.getTime())) {
      throw new Error('Enter a valid departure date and time.');
    }

    const preference = getPreference();
    const mode = getMode();

    const bundle = await fetchRoutes(origin, destination, {
      mode,
      via,
      alternatives: true,
    });

    routeBundle = bundle;
    selectedRouteIndex = 0;

    applySelectedRoute(depart, preference);
    saveRecent({
      origin,
      destination,
      via,
      mode,
      preference,
      depart: departInput.value,
    });
    renderRecent();
    syncUrlFromState();

    if (!quiet) {
      setStatus(
        bundle.routes.length > 1
          ? `Ready — ${bundle.routes.length} routes. Pick one or scrub the timeline.`
          : 'Ready — seat advice is on the map.'
      );
    }
    panel.classList.remove('is-collapsed');
  } catch (err) {
    setStatus(err.message || 'Something went wrong.', true);
    if (!quiet) {
      resultsEl.hidden = true;
      seatCard.hidden = true;
      mapLegend.hidden = true;
      routesPanel.hidden = true;
      clearRouteLayers();
    }
  } finally {
    submitBtn.disabled = false;
  }
}

function applySelectedRoute(depart, preference) {
  if (!routeBundle?.routes?.length) return;
  const route = routeBundle.routes[selectedRouteIndex];
  const analysis = analyzeJourney(route, depart, preference, {
    mode: routeBundle.mode,
  });
  currentAnalysis = analysis;

  renderRouteList(routeBundle.routes, selectedRouteIndex);
  renderAlternatives(routeBundle.routes, selectedRouteIndex);
  renderColoredRoute(analysis.segments);
  renderVerdict(analysis);
  renderTimeline(analysis.segments);
}

function selectRoute(index) {
  if (!routeBundle?.routes?.[index]) return;
  selectedRouteIndex = index;
  const origin = selected.origin;
  const depart = wallTimeToDate(departInput.value, origin?.timezone);
  applySelectedRoute(depart, getPreference());
  setStatus(`Using route ${index + 1} of ${routeBundle.routes.length}.`);
}

function syncUrlFromState() {
  const params = new URLSearchParams();
  if (selected.origin) {
    params.set('from', `${selected.origin.lat.toFixed(5)},${selected.origin.lon.toFixed(5)}`);
    params.set('fromLabel', selected.origin.label);
  }
  if (selected.destination) {
    params.set('to', `${selected.destination.lat.toFixed(5)},${selected.destination.lon.toFixed(5)}`);
    params.set('toLabel', selected.destination.label);
  }
  if (selected.via && !viaRow.hidden) {
    params.set('via', `${selected.via.lat.toFixed(5)},${selected.via.lon.toFixed(5)}`);
    params.set('viaLabel', selected.via.label);
  }
  if (departInput.value) params.set('depart', departInput.value);
  params.set('pref', getPreference());
  params.set('mode', getMode());
  params.set('units', units);
  const qs = params.toString();
  const url = `${location.pathname}${qs ? `?${qs}` : ''}`;
  history.replaceState(null, '', url);
}

function parseLatLon(s) {
  if (!s) return null;
  const parts = s.split(',').map((x) => Number(x.trim()));
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null;
  return { lat: parts[0], lon: parts[1] };
}

async function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const from = parseLatLon(params.get('from'));
  const to = parseLatLon(params.get('to'));
  const via = parseLatLon(params.get('via'));

  if (params.get('units') === 'mi' || params.get('units') === 'km') {
    units = params.get('units');
    localStorage.setItem(UNITS_KEY, units);
    document.getElementById('units-btn').textContent = units;
  }

  const mode = params.get('mode');
  if (mode && ['driving', 'walking', 'cycling'].includes(mode)) {
    const radio = form.querySelector(`input[name="mode"][value="${mode}"]`);
    if (radio) radio.checked = true;
  }

  const pref = params.get('pref');
  if (pref === 'sun' || pref === 'shade') {
    const radio = form.querySelector(`input[name="preference"][value="${pref}"]`);
    if (radio) radio.checked = true;
  }

  if (params.get('depart')) {
    departInput.value = params.get('depart');
  }

  if (from) {
    applyPlace(
      'origin',
      {
        name: params.get('fromLabel') || 'Origin',
        lat: from.lat,
        lon: from.lon,
        label: params.get('fromLabel') || `${from.lat}, ${from.lon}`,
        timezone: null,
      },
      { skipUrl: true }
    );
  }
  if (to) {
    applyPlace(
      'destination',
      {
        name: params.get('toLabel') || 'Destination',
        lat: to.lat,
        lon: to.lon,
        label: params.get('toLabel') || `${to.lat}, ${to.lon}`,
        timezone: null,
      },
      { skipUrl: true }
    );
  }
  if (via) {
    viaRow.hidden = false;
    applyPlace(
      'via',
      {
        name: params.get('viaLabel') || 'Stop',
        lat: via.lat,
        lon: via.lon,
        label: params.get('viaLabel') || `${via.lat}, ${via.lon}`,
        timezone: null,
      },
      { skipUrl: true }
    );
  }

  if (from && to) {
    await runAnalysis({ quiet: false });
  }
}

function saveRecent(trip) {
  try {
    const list = loadRecent().filter(
      (t) =>
        !(
          t.origin?.label === trip.origin.label &&
          t.destination?.label === trip.destination.label
        )
    );
    list.unshift({
      ...trip,
      savedAt: Date.now(),
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* ignore quota */
  }
}

function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function renderRecent() {
  const list = loadRecent();
  const section = document.getElementById('recent-section');
  const ul = document.getElementById('recent-list');
  if (!list.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  ul.innerHTML = list
    .map((t, i) => {
      const viaBit = t.via ? ` via ${escapeHtml(t.via.label.split(',')[0])}` : '';
      return `<li>
        <button type="button" class="recent-item" data-index="${i}">
          <span class="recent-item__route">${escapeHtml(t.origin.label.split(',')[0])} → ${escapeHtml(t.destination.label.split(',')[0])}${viaBit}</span>
          <span class="recent-item__meta">${escapeHtml(t.mode || 'driving')} · ${escapeHtml(t.preference || 'shade')}</span>
        </button>
      </li>`;
    })
    .join('');
}

async function loadRecentTrip(index) {
  const trip = loadRecent()[index];
  if (!trip) return;
  applyPlace('origin', trip.origin);
  applyPlace('destination', trip.destination);
  if (trip.via) {
    viaRow.hidden = false;
    applyPlace('via', trip.via);
  } else {
    clearVia();
  }
  if (trip.depart) departInput.value = trip.depart;
  const modeRadio = form.querySelector(`input[name="mode"][value="${trip.mode || 'driving'}"]`);
  if (modeRadio) modeRadio.checked = true;
  const prefRadio = form.querySelector(
    `input[name="preference"][value="${trip.preference || 'shade'}"]`
  );
  if (prefRadio) prefRadio.checked = true;
  await runAnalysis();
}

function clearVia() {
  selected.via = null;
  viaInput.value = '';
  viaRow.hidden = true;
  if (viaMarker) {
    map.removeLayer(viaMarker);
    viaMarker = null;
  }
}

function shareAdviceText() {
  if (!currentAnalysis || !selected.origin || !selected.destination) return '';
  const a = currentAnalysis;
  return [
    `ShadeLane seat advice`,
    `${selected.origin.label} → ${selected.destination.label}`,
    recommendationLabel(a.recommendation, a.preference),
    a.explanation,
    `${formatDuration(a.durationMin)} · ${formatDistance(a.distanceMeters)} · Left ${a.percentages.left}% / Right ${a.percentages.right}%`,
    location.href,
  ].join('\n');
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(okMsg);
  } catch {
    setStatus('Could not copy — select the URL bar instead.', true);
  }
}

// —— Event wiring ——
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runAnalysis();
});

routeList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-index]');
  if (!btn) return;
  selectRoute(Number(btn.dataset.index));
});

scrubber.addEventListener('input', () => {
  updateScrubber(scrubber.value);
});

document.getElementById('swap-btn').addEventListener('click', () => {
  const o = selected.origin;
  const d = selected.destination;
  const oVal = originInput.value;
  const dVal = destInput.value;
  originInput.value = dVal;
  destInput.value = oVal;
  selected.origin = d;
  selected.destination = o;

  if (originMarker && destMarker) {
    const ol = originMarker.getLatLng();
    const dl = destMarker.getLatLng();
    originMarker.setLatLng(dl);
    destMarker.setLatLng(ol);
  } else if (d) {
    upsertMarker('origin', d.lat, d.lon);
  }
  if (o) upsertMarker('destination', o.lat, o.lon);

  syncUrlFromState();
  if (selected.origin && selected.destination) runAnalysis({ quiet: true });
});

document.getElementById('locate-btn').addEventListener('click', async () => {
  setStatus('Finding your location…');
  try {
    const coords = await getDevicePosition();
    const place = await reverseGeocode(coords.latitude, coords.longitude);
    applyPlace('origin', place);
    setStatus('Origin set to your location.');
    if (selected.destination) await runAnalysis({ quiet: true });
  } catch (err) {
    setStatus(err.message || 'Could not use your location.', true);
  }
});

document.getElementById('add-via-btn').addEventListener('click', () => {
  viaRow.hidden = false;
  viaInput.focus();
  pinTarget = 'via';
  document.getElementById('map-hint').textContent =
    'Click the map to place your stop, or type a place name.';
});

document.getElementById('clear-via-btn').addEventListener('click', () => {
  clearVia();
  syncUrlFromState();
  if (selected.origin && selected.destination) runAnalysis({ quiet: true });
});

document.getElementById('units-btn').addEventListener('click', () => {
  units = units === 'km' ? 'mi' : 'km';
  localStorage.setItem(UNITS_KEY, units);
  document.getElementById('units-btn').textContent = units;
  syncSettingsForm();
  syncUrlFromState();
  if (currentAnalysis) {
    renderVerdict(currentAnalysis);
    if (routeBundle) renderRouteList(routeBundle.routes, selectedRouteIndex);
  }
});

document.getElementById('theme-btn').addEventListener('click', () => {
  ensureMap();
  setTileTheme(mapTheme === 'dark' ? 'light' : 'dark');
  syncSettingsForm();
});

document.getElementById('panel-toggle').addEventListener('click', () => {
  panel.classList.toggle('is-collapsed');
  setTimeout(() => map?.invalidateSize(), 200);
});

document.getElementById('panel-handle').addEventListener('click', () => {
  panel.classList.toggle('is-collapsed');
  setTimeout(() => map?.invalidateSize(), 200);
});

document.getElementById('share-btn').addEventListener('click', () => {
  syncUrlFromState();
  copyText(location.href, 'Share link copied.');
});

document.getElementById('copy-rec-btn').addEventListener('click', () => {
  copyText(shareAdviceText(), 'Recommendation copied.');
});

document.getElementById('recent-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-index]');
  if (!btn) return;
  loadRecentTrip(Number(btn.dataset.index));
});

const settingsSheet = document.getElementById('settings-sheet');
const offlineBanner = document.getElementById('offline-banner');

function syncSettingsForm() {
  const unitsSel = document.getElementById('settings-units');
  const themeSel = document.getElementById('settings-theme');
  const prefSel = document.getElementById('settings-pref');
  if (unitsSel) unitsSel.value = units;
  if (themeSel) themeSel.value = mapTheme;
  if (prefSel) prefSel.value = getPreference();
  const ver = document.getElementById('settings-version');
  if (ver) ver.textContent = APP_VERSION;
}

function openSettings() {
  syncSettingsForm();
  settingsSheet.hidden = false;
  document.getElementById('settings-close')?.focus();
}

function closeSettings() {
  if (!settingsSheet) return;
  settingsSheet.hidden = true;
}

function updateOnlineStatus() {
  if (!offlineBanner) return;
  offlineBanner.hidden = navigator.onLine;
}

document.getElementById('settings-btn')?.addEventListener('click', openSettings);
document.getElementById('settings-close')?.addEventListener('click', closeSettings);
document.getElementById('settings-backdrop')?.addEventListener('click', closeSettings);

document.getElementById('settings-units')?.addEventListener('change', (e) => {
  units = e.target.value === 'mi' ? 'mi' : 'km';
  localStorage.setItem(UNITS_KEY, units);
  document.getElementById('units-btn').textContent = units;
  syncUrlFromState();
  if (currentAnalysis) {
    renderVerdict(currentAnalysis);
    if (routeBundle) renderRouteList(routeBundle.routes, selectedRouteIndex);
  }
});

document.getElementById('settings-theme')?.addEventListener('change', (e) => {
  ensureMap();
  setTileTheme(e.target.value === 'dark' ? 'dark' : 'light');
});

document.getElementById('settings-pref')?.addEventListener('change', (e) => {
  const pref = e.target.value === 'sun' ? 'sun' : 'shade';
  localStorage.setItem(PREF_KEY, pref);
  const radio = form.querySelector(`input[name="preference"][value="${pref}"]`);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  }
});

document.getElementById('clear-recent-btn')?.addEventListener('click', () => {
  localStorage.removeItem(RECENT_KEY);
  renderRecent();
  setStatus('Recent trips cleared.');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsSheet && !settingsSheet.hidden) closeSettings();
});

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// Re-run when preference / mode / depart change after a route exists
form.querySelectorAll('input[name="preference"], input[name="mode"]').forEach((el) => {
  el.addEventListener('change', () => {
    if (el.name === 'preference') {
      localStorage.setItem(PREF_KEY, getPreference());
    }
    if (el.name === 'mode' && selected.origin && selected.destination) {
      runAnalysis({ quiet: true });
    } else if (el.name === 'preference' && routeBundle) {
      const depart = wallTimeToDate(departInput.value, selected.origin?.timezone);
      applySelectedRoute(depart, getPreference());
      syncUrlFromState();
    }
  });
});

departInput.addEventListener(
  'change',
  debounce(() => {
    if (selected.origin && selected.destination) runAnalysis({ quiet: true });
  }, 400)
);

bindAutocomplete(originInput, originList, 'origin');
bindAutocomplete(destInput, destList, 'destination');
bindAutocomplete(viaInput, viaList, 'via');

document.getElementById('units-btn').textContent = units;
setDefaultDepart();

const savedPref = localStorage.getItem(PREF_KEY);
if (savedPref === 'sun' || savedPref === 'shade') {
  const radio = form.querySelector(`input[name="preference"][value="${savedPref}"]`);
  if (radio) radio.checked = true;
}

ensureMap();
renderRecent();
syncSettingsForm();

if (mapTheme === 'dark') {
  document.body.classList.add('theme-dark');
}

initNativeShell().finally(() => {
  restoreFromUrl().catch(() => {
    /* ignore bad URL state */
  });
});
