import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { searchPlaces, type Place } from '../lib/route';
import { colors } from '../theme';

type Props = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (place: Place) => void;
  rightSlot?: React.ReactNode;
  dotColor: string;
};

export function PlaceSearch({
  label,
  placeholder,
  value,
  onChangeText,
  onSelect,
  rightSlot,
  dotColor,
}: Props) {
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const places = await searchPlaces(q, 6);
      setSuggestions(places);
      setOpen(places.length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(value), 280);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, runSearch]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.field}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={(t) => {
              onChangeText(t);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.inkSoft}
            autoCorrect={false}
            autoCapitalize="words"
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
          />
        </View>
        {loading ? <ActivityIndicator color={colors.teal} /> : null}
        {rightSlot}
      </View>
      {open ? (
        <View style={styles.list}>
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={suggestions}
            keyExtractor={(item, i) => `${item.lat},${item.lon},${i}`}
            renderItem={({ item }) => (
              <Pressable
                style={styles.item}
                onPress={() => {
                  onSelect(item);
                  setOpen(false);
                  setSuggestions([]);
                }}
              >
                <Text style={styles.itemText} numberOfLines={2}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 14,
  },
  field: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.inkSoft,
    marginBottom: 2,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.ink,
  },
  list: {
    marginLeft: 20,
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    maxHeight: 180,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  itemText: { color: colors.ink, fontSize: 14 },
});
