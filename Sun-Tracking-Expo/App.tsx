import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlaceSearch } from './src/components/PlaceSearch';
import { RouteMap } from './src/components/RouteMap';
import {
  analyzeJourney,
  recommendationLabel,
  recommendationShort,
  type JourneyAnalysis,
  type Preference,
} from './src/lib/advise';
import { distanceMeters } from './src/lib/geo';
import { formatDistance, formatDuration, formatTime } from './src/lib/format';
import {
  fetchRoutes,
  reverseGeocode,
  searchPlaces,
  type JourneyMode,
  type Place,
  type RouteBundle,
} from './src/lib/route';
import { defaultDepartValue, toLocalInputValue, wallTimeToDate } from './src/lib/time';
import { colors } from './src/theme';
import { SettingsModal } from './src/screens/SettingsModal';

const RECENT_KEY = 'shadelane-expo-recent-v1';
const UNITS_KEY = 'shadelane-expo-units';
const PREF_KEY = 'shadelane-expo-default-pref';
const NEAR_SAME_M = 60;

type RecentTrip = {
  origin: Place;
  destination: Place;
  via: Place | null;
  mode: JourneyMode;
  preference: Preference;
  depart: string;
  savedAt: number;
};

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();
  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [viaText, setViaText] = useState('');
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [via, setVia] = useState<Place | null>(null);
  const [showVia, setShowVia] = useState(false);
  const [mode, setMode] = useState<JourneyMode>('driving');
  const [preference, setPreference] = useState<Preference>('shade');
  const [depart, setDepart] = useState(defaultDepartValue());
  const [showPicker, setShowPicker] = useState(false);
  const [units, setUnits] = useState<'km' | 'mi'>('km');
  const [mapDark, setMapDark] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [routeBundle, setRouteBundle] = useState<RouteBundle | null>(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [analysis, setAnalysis] = useState<JourneyAnalysis | null>(null);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [recent, setRecent] = useState<RecentTrip[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const pinTarget = useRef<'auto' | 'origin' | 'destination' | 'via'>('auto');
  const reverseBusy = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await AsyncStorage.getItem(UNITS_KEY);
        if (u === 'mi' || u === 'km') setUnits(u);
        const p = await AsyncStorage.getItem(PREF_KEY);
        if (p === 'sun' || p === 'shade') setPreference(p);
        const raw = await AsyncStorage.getItem(RECENT_KEY);
        if (raw) setRecent(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 4000);
        await fetch('https://geocoding-api.open-meteo.com/v1/search?name=a&count=1', {
          method: 'HEAD',
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!cancelled) setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    probe();
    const id = setInterval(probe, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const applyAnalysis = useCallback(
    (bundle: RouteBundle, index: number, departWall: string, pref: Preference) => {
      const route = bundle.routes[index];
      if (!route) return;
      const departDate = wallTimeToDate(departWall, origin?.timezone ?? null);
      const result = analyzeJourney(route, departDate, pref, { mode: bundle.mode });
      setAnalysis(result);
      setScrubIndex(0);
    },
    [origin?.timezone]
  );

  const saveRecent = useCallback(async (trip: Omit<RecentTrip, 'savedAt'>) => {
    try {
      const list = recent.filter(
        (t) =>
          !(
            t.origin.label === trip.origin.label &&
            t.destination.label === trip.destination.label
          )
      );
      const next = [{ ...trip, savedAt: Date.now() }, ...list].slice(0, 8);
      setRecent(next);
      await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, [recent]);

  const runAnalysis = useCallback(
    async (
      opts: {
        quiet?: boolean;
        origin?: Place | null;
        destination?: Place | null;
        via?: Place | null;
        showVia?: boolean;
      } = {}
    ) => {
      setLoading(true);
      if (!opts.quiet) {
        setStatus('Tracing route and reading the sky…');
        setStatusError(false);
      }
      try {
        let o = opts.origin !== undefined ? opts.origin : origin;
        let d =
          opts.destination !== undefined ? opts.destination : destination;
        let v = opts.via !== undefined ? opts.via : via;
        const viaVisible =
          opts.showVia !== undefined ? opts.showVia : showVia;
        const oText = o?.label ?? originText;
        const dText = d?.label ?? destText;
        const vText = v?.label ?? viaText;

        if (!o || o.label !== oText.trim()) {
          if (!oText.trim()) throw new Error('Enter a starting point.');
          const places = await searchPlaces(oText, 1);
          if (!places.length) throw new Error(`Couldn’t find “${oText}”.`);
          o = places[0];
          setOrigin(o);
          setOriginText(o.label);
        }
        if (!d || d.label !== dText.trim()) {
          if (!dText.trim()) throw new Error('Enter a destination.');
          const places = await searchPlaces(dText, 1);
          if (!places.length) throw new Error(`Couldn’t find “${dText}”.`);
          d = places[0];
          setDestination(d);
          setDestText(d.label);
        }
        if (viaVisible && (vText.trim() || v)) {
          if (!v || v.label !== vText.trim()) {
            const places = await searchPlaces(vText, 1);
            if (!places.length) throw new Error(`Couldn’t find “${vText}”.`);
            v = places[0];
            setVia(v);
            setViaText(v.label);
          }
        } else {
          v = null;
        }

        const gap = distanceMeters(o, d);
        if (gap < NEAR_SAME_M && !v) {
          throw new Error(
            'Origin and destination are almost the same spot. Pick two places farther apart.'
          );
        }

        const departDate = wallTimeToDate(depart, o.timezone);
        if (Number.isNaN(departDate.getTime())) {
          throw new Error('Enter a valid departure date and time.');
        }

        const bundle = await fetchRoutes(o, d, {
          mode,
          via: v,
          alternatives: true,
        });
        setRouteBundle(bundle);
        setRouteIndex(0);
        const route = bundle.routes[0];
        const result = analyzeJourney(route, departDate, preference, {
          mode: bundle.mode,
        });
        setAnalysis(result);
        setScrubIndex(0);
        await saveRecent({
          origin: o,
          destination: d,
          via: v,
          mode,
          preference,
          depart,
        });
        if (!opts.quiet) {
          setStatus(
            bundle.routes.length > 1
              ? `Ready — ${bundle.routes.length} routes. Pick one or scrub the timeline.`
              : 'Ready — seat advice is on the map.'
          );
        }
        setPanelCollapsed(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setStatus(msg);
        setStatusError(true);
        if (!opts.quiet) {
          setAnalysis(null);
          setRouteBundle(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [
      origin,
      destination,
      via,
      originText,
      destText,
      viaText,
      showVia,
      depart,
      mode,
      preference,
      saveRecent,
    ]
  );

  // Re-analyze preference change without re-fetching route
  useEffect(() => {
    if (!routeBundle) return;
    applyAnalysis(routeBundle, routeIndex, depart, preference);
  }, [preference]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMapPress = async (lat: number, lon: number) => {
    if (reverseBusy.current) return;
    let key = pinTarget.current;
    if (key === 'auto') {
      if (!origin) key = 'origin';
      else if (!destination) key = 'destination';
      else key = 'destination';
    }
    reverseBusy.current = true;
    setStatus('Looking up that spot…');
    setStatusError(false);
    try {
      const place = await reverseGeocode(lat, lon);
      let nextOrigin = origin;
      let nextDest = destination;
      let nextVia = via;
      let nextShowVia = showVia;
      if (key === 'origin') {
        nextOrigin = place;
        setOrigin(place);
        setOriginText(place.label);
      } else if (key === 'via') {
        nextShowVia = true;
        nextVia = place;
        setShowVia(true);
        setVia(place);
        setViaText(place.label);
      } else {
        nextDest = place;
        setDestination(place);
        setDestText(place.label);
      }
      pinTarget.current = 'auto';
      setStatus('');
      if (nextOrigin && nextDest) {
        await runAnalysis({
          quiet: true,
          origin: nextOrigin,
          destination: nextDest,
          via: nextVia,
          showVia: nextShowVia,
        });
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Map lookup failed.');
      setStatusError(true);
    } finally {
      reverseBusy.current = false;
    }
  };

  const locateMe = async () => {
    setStatus('Finding your location…');
    setStatusError(false);
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setStatus('Location permission denied.');
        setStatusError(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const place = await reverseGeocode(
        pos.coords.latitude,
        pos.coords.longitude
      );
      setOrigin(place);
      setOriginText(place.label);
      setStatus('Origin set to your location.');
      if (destination) {
        await runAnalysis({
          quiet: true,
          origin: place,
          destination,
        });
      }
    } catch {
      setStatus('Could not use your location.');
      setStatusError(true);
    }
  };

  const swapEnds = () => {
    const nextOrigin = destination;
    const nextDest = origin;
    const nextOriginText = destText;
    const nextDestText = originText;
    setOrigin(nextOrigin);
    setDestination(nextDest);
    setOriginText(nextOriginText);
    setDestText(nextDestText);
    if (nextOrigin && nextDest) {
      void runAnalysis({
        quiet: true,
        origin: nextOrigin,
        destination: nextDest,
      });
    }
  };

  const selectRoute = (index: number) => {
    if (!routeBundle?.routes[index]) return;
    setRouteIndex(index);
    applyAnalysis(routeBundle, index, depart, preference);
    setStatus(`Using route ${index + 1} of ${routeBundle.routes.length}.`);
    setStatusError(false);
  };

  const loadRecent = (trip: RecentTrip) => {
    setOrigin(trip.origin);
    setDestination(trip.destination);
    setOriginText(trip.origin.label);
    setDestText(trip.destination.label);
    if (trip.via) {
      setShowVia(true);
      setVia(trip.via);
      setViaText(trip.via.label);
    } else {
      setShowVia(false);
      setVia(null);
      setViaText('');
    }
    setMode(trip.mode);
    setPreference(trip.preference);
    if (trip.depart) setDepart(trip.depart);
    setTimeout(() => runAnalysis(), 80);
  };

  const shareAdvice = async () => {
    if (!analysis || !origin || !destination) return;
    const text = [
      'ShadeLane seat advice',
      `${origin.label} → ${destination.label}`,
      recommendationLabel(analysis.recommendation, analysis.preference),
      analysis.explanation,
      `${formatDuration(analysis.durationMin)} · ${formatDistance(
        analysis.distanceMeters,
        units
      )} · Left ${analysis.percentages.left}% / Right ${analysis.percentages.right}%`,
    ].join('\n');
    try {
      await Share.share({ message: text });
    } catch {
      setStatus('Could not open share sheet.');
      setStatusError(true);
    }
  };

  const scrubLive = useMemo(() => {
    if (!analysis?.segments?.length) return '';
    const s = analysis.segments[scrubIndex] ?? analysis.segments[0];
    return `${formatTime(s.time)} · ${s.sideLabel}`;
  }, [analysis, scrubIndex]);

  const timelineBuckets = useMemo(() => {
    if (!analysis?.segments?.length) return [];
    const segs = analysis.segments;
    const n = segs.length;
    const buckets = Math.min(48, n);
    const size = Math.ceil(n / buckets);
    const out: string[] = [];
    for (let i = 0; i < n; i += size) {
      const slice = segs.slice(i, i + size);
      const tally: Record<string, number> = {};
      for (const s of slice) tally[s.side] = (tally[s.side] || 0) + 1;
      const dominant = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
      out.push(dominant);
    }
    return out;
  }, [analysis]);

  const departDate = useMemo(() => {
    const d = new Date(depart);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [depart]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <RouteMap
        origin={origin}
        destination={destination}
        via={showVia ? via : null}
        analysisSegments={analysis?.segments ?? null}
        altRoutes={routeBundle?.routes ?? []}
        activeRouteIndex={routeIndex}
        scrubIndex={scrubIndex}
        mapType={mapDark ? 'mutedStandard' : 'standard'}
        onMapPress={onMapPress}
        onSelectAlt={selectRoute}
      />

      {analysis ? (
        <View style={[styles.seatCard, { top: insets.top + 12 }]}>
          <Text style={styles.seatEyebrow}>
            {preference === 'shade' ? 'Sit for shade' : 'Sit for sun'}
          </Text>
          <Text style={styles.seatTitle}>
            {recommendationShort(analysis.recommendation)}
          </Text>
          <Text style={styles.seatMeta}>
            {formatDuration(analysis.durationMin)} ·{' '}
            {formatDistance(analysis.distanceMeters, units)} · L{' '}
            {analysis.percentages.left}% / R {analysis.percentages.right}%
          </Text>
        </View>
      ) : null}

      {analysis ? (
        <View style={[styles.legend, { bottom: panelCollapsed ? 88 : undefined }]}>
          <Text style={styles.legendItem}>
            <Text style={{ color: colors.left }}>● </Text>Sun left
          </Text>
          <Text style={styles.legendItem}>
            <Text style={{ color: colors.right }}>● </Text>Sun right
          </Text>
          <Text style={styles.legendItem}>
            <Text style={{ color: colors.neutral }}>● </Text>Front / night
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.panelWrap, { paddingBottom: insets.bottom + 8 }]}
        pointerEvents="box-none"
      >
        <View style={[styles.panel, panelCollapsed && styles.panelCollapsed]}>
          <Pressable
            style={styles.handle}
            onPress={() => setPanelCollapsed((c) => !c)}
          >
            <View style={styles.handleBar} />
          </Pressable>

          <View style={styles.panelHead}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark} />
              <Text style={styles.brand}>ShadeLane</Text>
            </View>
            <View style={styles.headActions}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setMapDark((d) => !d)}
                accessibilityLabel="Toggle map theme"
              >
                <Text>◐</Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={async () => {
                  const next = units === 'km' ? 'mi' : 'km';
                  setUnits(next);
                  await AsyncStorage.setItem(UNITS_KEY, next);
                }}
                accessibilityLabel="Toggle distance units"
              >
                <Text style={styles.iconBtnText}>{units}</Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setSettingsOpen(true)}
                accessibilityLabel="Open settings"
              >
                <Text>⚙</Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => setPanelCollapsed((c) => !c)}
                accessibilityLabel="Expand or collapse panel"
              >
                <Text>{panelCollapsed ? '▴' : '▾'}</Text>
              </Pressable>
            </View>
          </View>

          {!panelCollapsed ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.panelBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.tagline}>Sun-smart seats for every journey</Text>

              <PlaceSearch
                label="Origin"
                placeholder="Choose starting point"
                value={originText}
                onChangeText={(t) => {
                  setOriginText(t);
                  setOrigin(null);
                }}
                onSelect={(p) => {
                  setOrigin(p);
                  setOriginText(p.label);
                  if (destination) setTimeout(() => runAnalysis({ quiet: true }), 50);
                }}
                dotColor={colors.teal}
                rightSlot={
                  <Pressable style={styles.iconBtn} onPress={locateMe}>
                    <Text>◎</Text>
                  </Pressable>
                }
              />

              <Pressable style={styles.swapBtn} onPress={swapEnds}>
                <Text style={styles.swapText}>⇅ Swap</Text>
              </Pressable>

              {showVia ? (
                <PlaceSearch
                  label="Stop"
                  placeholder="Add a stop"
                  value={viaText}
                  onChangeText={(t) => {
                    setViaText(t);
                    setVia(null);
                  }}
                  onSelect={(p) => {
                    setVia(p);
                    setViaText(p.label);
                  }}
                  dotColor="#5b7c99"
                  rightSlot={
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setShowVia(false);
                        setVia(null);
                        setViaText('');
                        pinTarget.current = 'auto';
                        if (origin && destination) {
                          setTimeout(() => runAnalysis({ quiet: true }), 50);
                        }
                      }}
                    >
                      <Text>×</Text>
                    </Pressable>
                  }
                />
              ) : null}

              <PlaceSearch
                label="Destination"
                placeholder="Choose destination"
                value={destText}
                onChangeText={(t) => {
                  setDestText(t);
                  setDestination(null);
                }}
                onSelect={(p) => {
                  setDestination(p);
                  setDestText(p.label);
                  if (origin) setTimeout(() => runAnalysis({ quiet: true }), 50);
                }}
                dotColor={colors.sun}
                rightSlot={
                  !showVia ? (
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => {
                        setShowVia(true);
                        pinTarget.current = 'via';
                        setStatus('Tap the map to place your stop, or type a place.');
                      }}
                    >
                      <Text>+</Text>
                    </Pressable>
                  ) : null
                }
              />

              <View style={styles.chipRow}>
                {(['driving', 'walking', 'cycling'] as JourneyMode[]).map((m) => (
                  <Chip
                    key={m}
                    label={m === 'driving' ? 'Drive' : m === 'walking' ? 'Walk' : 'Bike'}
                    active={mode === m}
                    onPress={() => {
                      setMode(m);
                      if (origin && destination) {
                        setTimeout(() => runAnalysis({ quiet: true }), 50);
                      }
                    }}
                  />
                ))}
              </View>

              <View style={styles.metaRow}>
                <Pressable
                  style={styles.departBtn}
                  onPress={() => setShowPicker(true)}
                >
                  <Text style={styles.metaLabel}>Depart</Text>
                  <Text style={styles.departText}>
                    {departDate.toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
                <View style={styles.prefWrap}>
                  <Text style={styles.metaLabel}>I want</Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Shade"
                      active={preference === 'shade'}
                      onPress={() => setPreference('shade')}
                    />
                    <Chip
                      label="Sun"
                      active={preference === 'sun'}
                      onPress={() => setPreference('sun')}
                    />
                  </View>
                </View>
              </View>

              {showPicker ? (
                <DateTimePicker
                  value={departDate}
                  mode="datetime"
                  onChange={(_e, date) => {
                    if (Platform.OS === 'android') setShowPicker(false);
                    if (date) {
                      setDepart(toLocalInputValue(date));
                      if (origin && destination) {
                        setTimeout(() => runAnalysis({ quiet: true }), 50);
                      }
                    }
                  }}
                />
              ) : null}
              {showPicker && Platform.OS === 'ios' ? (
                <Pressable
                  style={styles.donePicker}
                  onPress={() => setShowPicker(false)}
                >
                  <Text style={styles.donePickerText}>Done</Text>
                </Pressable>
              ) : null}

              <Text style={styles.hint}>
                Tip: tap the map to set points. Use ◎ for your location.
              </Text>

              <Pressable
                style={[styles.cta, loading && styles.ctaDisabled]}
                onPress={() => runAnalysis()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaText}>Find my seat</Text>
                )}
              </Pressable>

              {status ? (
                <Text
                  style={[styles.status, statusError && styles.statusError]}
                >
                  {status}
                </Text>
              ) : null}

              {routeBundle && routeBundle.routes.length > 1 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Routes</Text>
                  {routeBundle.routes.map((r, i) => (
                    <Pressable
                      key={i}
                      style={[
                        styles.routeOption,
                        i === routeIndex && styles.routeOptionActive,
                      ]}
                      onPress={() => selectRoute(i)}
                    >
                      <Text style={styles.routeTitle}>{r.summary}</Text>
                      <Text style={styles.routeMeta}>
                        {formatDuration(Math.max(1, Math.round(r.durationSeconds / 60)))}{' '}
                        · {formatDistance(r.distanceMeters, units)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {analysis ? (
                <View style={styles.section}>
                  <Text style={styles.verdictEyebrow}>
                    {preference === 'shade'
                      ? 'Best seat for shade'
                      : 'Best seat for sun'}
                  </Text>
                  <Text style={styles.verdictTitle}>
                    {recommendationLabel(
                      analysis.recommendation,
                      analysis.preference
                    )}
                  </Text>
                  <Text style={styles.verdictBody}>{analysis.explanation}</Text>
                  <Text style={styles.stats}>
                    L {analysis.percentages.left}% · R {analysis.percentages.right}% ·
                    Front/back/overhead{' '}
                    {analysis.percentages.front +
                      analysis.percentages.back +
                      analysis.percentages.overhead}
                    % · Night {analysis.percentages.night}%
                  </Text>
                  <Text style={styles.note}>
                    Cloud cover, tunnels, and roadside shade aren’t modeled —
                    clear-sky geometry only.
                    {analysis.confidence === 'close'
                      ? ' Left and right are close — either window is fine.'
                      : ''}
                  </Text>
                  <Pressable style={styles.ghostBtn} onPress={shareAdvice}>
                    <Text style={styles.ghostBtnText}>Share advice</Text>
                  </Pressable>

                  <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
                    Along the ride
                  </Text>
                  <Text style={styles.scrubLive}>{scrubLive}</Text>
                  <View style={styles.timeline}>
                    {timelineBuckets.map((side, i) => (
                      <View
                        key={i}
                        style={[
                          styles.timelineBar,
                          {
                            backgroundColor:
                              side === 'left'
                                ? colors.left
                                : side === 'right'
                                  ? colors.right
                                  : side === 'night'
                                    ? colors.night
                                    : colors.neutral,
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.scrubRow}>
                    <Pressable
                      style={styles.scrubBtn}
                      onPress={() =>
                        setScrubIndex((i) => Math.max(0, i - 5))
                      }
                    >
                      <Text>‹‹</Text>
                    </Pressable>
                    <Pressable
                      style={styles.scrubBtn}
                      onPress={() =>
                        setScrubIndex((i) => Math.max(0, i - 1))
                      }
                    >
                      <Text>‹</Text>
                    </Pressable>
                    <View style={styles.scrubTrack}>
                      <View style={styles.scrubTrackInner} />
                      <View
                        style={[
                          styles.scrubThumb,
                          {
                            left: `${
                              (scrubIndex /
                                Math.max(analysis.segments.length - 1, 1)) *
                              100
                            }%`,
                          },
                        ]}
                      />
                    </View>
                    <Pressable
                      style={styles.scrubBtn}
                      onPress={() =>
                        setScrubIndex((i) =>
                          Math.min(
                            (analysis.segments.length || 1) - 1,
                            i + 1
                          )
                        )
                      }
                    >
                      <Text>›</Text>
                    </Pressable>
                    <Pressable
                      style={styles.scrubBtn}
                      onPress={() =>
                        setScrubIndex((i) =>
                          Math.min(
                            (analysis.segments.length || 1) - 1,
                            i + 5
                          )
                        )
                      }
                    >
                      <Text>››</Text>
                    </Pressable>
                  </View>
                  <View style={styles.axis}>
                    <Text style={styles.axisText}>
                      {formatTime(analysis.segments[0].time)}
                    </Text>
                    <Text style={styles.axisText}>
                      {formatTime(
                        analysis.segments[analysis.segments.length - 1].time
                      )}
                    </Text>
                  </View>
                  <Text style={styles.scrubHint}>
                    Use ‹ › to scrub along the route ({scrubIndex + 1}/
                    {analysis.segments.length})
                  </Text>
                </View>
              ) : null}

              {recent.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                  {recent.map((t, i) => (
                    <Pressable
                      key={i}
                      style={styles.recentItem}
                      onPress={() => loadRecent(t)}
                    >
                      <Text style={styles.recentRoute} numberOfLines={1}>
                        {t.origin.label.split(',')[0]} →{' '}
                        {t.destination.label.split(',')[0]}
                      </Text>
                      <Text style={styles.recentMeta}>
                        {t.mode} · {t.preference}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <Text style={styles.foot}>
                OSRM · Open-Meteo · OSM · Clear-sky geometry only
              </Text>
            </ScrollView>
          ) : (
            <Pressable onPress={() => setPanelCollapsed(false)}>
              <Text style={styles.collapsedHint}>
                ShadeLane — tap to plan a trip
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      {offline ? (
        <View style={styles.offlineBanner} pointerEvents="none">
          <Text style={styles.offlineText}>
            You’re offline. Search and routing need a network connection.
          </Text>
        </View>
      ) : null}

      <SettingsModal
        visible={settingsOpen}
        units={units}
        mapDark={mapDark}
        preference={preference}
        onClose={() => setSettingsOpen(false)}
        onUnits={async (next) => {
          setUnits(next);
          await AsyncStorage.setItem(UNITS_KEY, next);
        }}
        onMapDark={setMapDark}
        onPreference={async (pref) => {
          setPreference(pref);
          await AsyncStorage.setItem(PREF_KEY, pref);
        }}
        onClearRecent={async () => {
          setRecent([]);
          await AsyncStorage.removeItem(RECENT_KEY);
          setStatus('Recent trips cleared.');
          setStatusError(false);
          setSettingsOpen(false);
        }}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.mapBg },
  panelWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    maxHeight: '72%',
  },
  panel: {
    backgroundColor: colors.paperTranslucent,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
    maxHeight: '100%',
  },
  panelCollapsed: { maxHeight: 72 },
  handle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    width: 14,
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.teal,
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.tealDeep,
    letterSpacing: -0.3,
  },
  headActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,37,50,0.06)',
  },
  iconBtnText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  panelBody: { paddingHorizontal: 14, paddingBottom: 20, gap: 10 },
  tagline: { color: colors.inkSoft, fontSize: 13, marginBottom: 4 },
  swapBtn: { alignSelf: 'center', paddingVertical: 4 },
  swapText: { color: colors.teal, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(16,37,50,0.06)',
  },
  chipActive: { backgroundColor: colors.teal },
  chipText: { color: colors.ink, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  metaRow: { gap: 10 },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 4,
  },
  departBtn: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(16,37,50,0.05)',
  },
  departText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  prefWrap: {},
  donePicker: { alignSelf: 'flex-end', padding: 8 },
  donePickerText: { color: colors.teal, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.inkSoft },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  status: { fontSize: 13, color: colors.inkSoft },
  statusError: { color: colors.error },
  section: { marginTop: 8, gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  routeOption: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  routeOptionActive: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(31,111,106,0.08)',
  },
  routeTitle: { fontWeight: '700', color: colors.ink },
  routeMeta: { color: colors.inkSoft, marginTop: 2, fontSize: 13 },
  verdictEyebrow: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.sun,
    textTransform: 'uppercase',
  },
  verdictTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.4,
  },
  verdictBody: { fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  stats: { fontSize: 13, color: colors.ink, fontWeight: '600' },
  note: { fontSize: 12, color: colors.inkSoft, lineHeight: 17 },
  ghostBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghostBtnText: { color: colors.tealDeep, fontWeight: '600' },
  scrubLive: { fontSize: 14, fontWeight: '600', color: colors.ink },
  timeline: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 },
  timelineBar: { flex: 1 },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scrubBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,37,50,0.06)',
  },
  scrubTrack: { flex: 1, height: 24, justifyContent: 'center' },
  scrubTrackInner: {
    height: 4,
    backgroundColor: colors.line,
    borderRadius: 2,
  },
  scrubThumb: {
    position: 'absolute',
    top: 4,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.tealDeep,
    borderWidth: 2,
    borderColor: '#fff',
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11, color: colors.inkSoft },
  scrubHint: { fontSize: 11, color: colors.inkSoft },
  recentItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  recentRoute: { fontWeight: '600', color: colors.ink },
  recentMeta: { fontSize: 12, color: colors.inkSoft },
  foot: {
    marginTop: 12,
    fontSize: 11,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  collapsedHint: {
    textAlign: 'center',
    paddingBottom: 14,
    color: colors.inkSoft,
    fontWeight: '600',
  },
  offlineBanner: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 30,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  offlineText: {
    color: colors.paper,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  seatCard: {
    position: 'absolute',
    right: 12,
    backgroundColor: colors.paperTranslucent,
    borderRadius: 14,
    padding: 12,
    maxWidth: 180,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  seatEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.sun,
    textTransform: 'uppercase',
  },
  seatTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  seatMeta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  legend: {
    position: 'absolute',
    left: 12,
    bottom: '74%',
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  legendItem: { fontSize: 11, color: colors.ink, fontWeight: '600' },
});
