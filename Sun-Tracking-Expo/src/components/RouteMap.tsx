import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  type Region,
} from 'react-native-maps';
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

type ColoredChunk = {
  color: string;
  coords: { latitude: number; longitude: number }[];
};

function chunkSegments(segments: Segment[]): ColoredChunk[] {
  if (segments.length < 2) return [];
  const chunks: ColoredChunk[] = [];
  let color = SIDE_COLORS[segments[0].side] || colors.neutral;
  let coords = [
    { latitude: segments[0].lat, longitude: segments[0].lon },
  ];

  for (let i = 1; i < segments.length; i++) {
    const nextColor = SIDE_COLORS[segments[i - 1].side] || colors.neutral;
    const pt = { latitude: segments[i].lat, longitude: segments[i].lon };
    if (nextColor !== color) {
      chunks.push({ color, coords });
      color = nextColor;
      coords = [
        {
          latitude: segments[i - 1].lat,
          longitude: segments[i - 1].lon,
        },
        pt,
      ];
    } else {
      coords.push(pt);
    }
  }
  chunks.push({ color, coords });
  return chunks;
}

export function RouteMap({
  origin,
  destination,
  via,
  analysisSegments,
  altRoutes,
  activeRouteIndex,
  scrubIndex,
  mapType,
  onMapPress,
  onSelectAlt,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const chunks = useMemo(
    () => (analysisSegments ? chunkSegments(analysisSegments) : []),
    [analysisSegments]
  );

  const scrubPoint = analysisSegments?.[scrubIndex];

  const initialRegion: Region = {
    latitude: origin?.lat ?? 20,
    longitude: origin?.lon ?? 0,
    latitudeDelta: origin ? 0.08 : 40,
    longitudeDelta: origin ? 0.08 : 40,
  };

  useEffect(() => {
    const pts: { latitude: number; longitude: number }[] = [];
    if (analysisSegments?.length) {
      for (const s of analysisSegments) {
        pts.push({ latitude: s.lat, longitude: s.lon });
      }
    } else {
      if (origin) pts.push({ latitude: origin.lat, longitude: origin.lon });
      if (via) pts.push({ latitude: via.lat, longitude: via.lon });
      if (destination) {
        pts.push({ latitude: destination.lat, longitude: destination.lon });
      }
    }
    if (pts.length === 0) return;
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 80, right: 40, bottom: 320, left: 40 },
        animated: true,
      });
    }, 200);
    return () => clearTimeout(t);
  }, [origin, destination, via, analysisSegments]);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        mapType={mapType === 'mutedStandard' ? 'mutedStandard' : 'standard'}
        onPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          onMapPress(latitude, longitude);
        }}
      >
        {altRoutes.map((r, i) =>
          i === activeRouteIndex ? null : (
            <Polyline
              key={`alt-${i}`}
              coordinates={r.coordinates.map((c) => ({
                latitude: c.lat,
                longitude: c.lon,
              }))}
              strokeColor="rgba(122,139,152,0.55)"
              strokeWidth={4}
              tappable
              onPress={() => onSelectAlt(i)}
            />
          )
        )}

        {chunks.map((chunk, i) => (
          <Polyline
            key={`seg-${i}`}
            coordinates={chunk.coords}
            strokeColor={chunk.color}
            strokeWidth={6}
          />
        ))}

        {origin ? (
          <Marker
            coordinate={{ latitude: origin.lat, longitude: origin.lon }}
            pinColor={colors.teal}
            title="Origin"
            description={origin.label}
          />
        ) : null}
        {via ? (
          <Marker
            coordinate={{ latitude: via.lat, longitude: via.lon }}
            pinColor="#5b7c99"
            title="Stop"
            description={via.label}
          />
        ) : null}
        {destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lon }}
            pinColor={colors.sun}
            title="Destination"
            description={destination.label}
          />
        ) : null}
        {scrubPoint ? (
          <Marker
            coordinate={{
              latitude: scrubPoint.lat,
              longitude: scrubPoint.lon,
            }}
            pinColor={colors.tealDeep}
            title="Along ride"
            description={scrubPoint.sideLabel}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.mapBg },
});
