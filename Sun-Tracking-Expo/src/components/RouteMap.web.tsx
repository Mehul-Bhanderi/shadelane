import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Segment } from '../lib/advise';
import type { Place, RouteResult } from '../lib/route';
import { colors, SIDE_COLORS } from '../theme';

type Props = {
  origin: Place | null;
  destination: Place | null;
  via: Place | null;
  analysisSegments: Segment[] | null;
  altRoutes: RouteResult[];
  activeRouteIndex: number;
  scrubIndex: number;
  mapType: 'standard' | 'mutedStandard';
  onMapPress: (lat: number, lon: number) => void;
  onSelectAlt: (index: number) => void;
};

/**
 * Web fallback: react-native-maps whitescreens in browsers.
 * Keeps the rest of the UI usable; full map works in Expo Go / native.
 */
export function RouteMap({
  origin,
  destination,
  via,
  analysisSegments,
  scrubIndex,
  mapType,
  onMapPress,
}: Props) {
  const scrub = analysisSegments?.[scrubIndex];
  const bg = mapType === 'mutedStandard' ? '#9eb6c4' : colors.mapBg;

  return (
    <View style={[styles.wrap, { backgroundColor: bg }]}>
      <View style={styles.grid} pointerEvents="none" />
      <View style={styles.card}>
        <Text style={styles.title}>Map on device</Text>
        <Text style={styles.body}>
          Interactive maps need Expo Go or a native build. Plan trips here; open
          this project in Expo Go for the full map.
        </Text>
        {origin ? (
          <Text style={styles.pin}>
            <Text style={{ color: colors.teal }}>● </Text>
            Origin: {origin.label}
          </Text>
        ) : null}
        {via ? (
          <Text style={styles.pin}>
            <Text style={{ color: '#5b7c99' }}>● </Text>
            Stop: {via.label}
          </Text>
        ) : null}
        {destination ? (
          <Text style={styles.pin}>
            <Text style={{ color: colors.sun }}>● </Text>
            Destination: {destination.label}
          </Text>
        ) : null}
        {scrub ? (
          <Text style={styles.pin}>
            <Text style={{ color: SIDE_COLORS[scrub.side] || colors.tealDeep }}>
              ●{' '}
            </Text>
            Along ride: {scrub.sideLabel}
          </Text>
        ) : null}
        {!origin && !destination ? (
          <Text style={styles.hint}>
            Use the panel below to search places, or tap to drop a demo pin.
          </Text>
        ) : null}
        <Pressable
          style={styles.demoBtn}
          onPress={() => onMapPress(37.7749, -122.4194)}
        >
          <Text style={styles.demoBtnText}>Drop demo pin (SF)</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(16,37,50,0.08)',
  },
  card: {
    maxWidth: 420,
    width: '100%',
    backgroundColor: colors.paperTranslucent,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.tealDeep,
  },
  body: {
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  pin: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  demoBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.teal,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  demoBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
