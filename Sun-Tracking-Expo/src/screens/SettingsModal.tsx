import React from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme';

type Props = {
  visible: boolean;
  units: 'km' | 'mi';
  mapDark: boolean;
  preference: 'shade' | 'sun';
  onClose: () => void;
  onUnits: (units: 'km' | 'mi') => void;
  onMapDark: (dark: boolean) => void;
  onPreference: (pref: 'shade' | 'sun') => void;
  onClearRecent: () => void;
};

const PRIVACY_URL = 'https://shadelane.app/legal/privacy.html';
const TERMS_URL = 'https://shadelane.app/legal/terms.html';
const SUPPORT = 'support@shadelane.app';
const APP_VERSION = '1.0.0';

export function SettingsModal({
  visible,
  units,
  mapDark,
  preference,
  onClose,
  onUnits,
  onMapDark,
  onPreference,
  onClearRecent,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Settings</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close settings" style={styles.close}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.group}>Preferences</Text>
            <Row
              label="Distance units"
              value={units}
              options={['km', 'mi']}
              onChange={(v) => onUnits(v as 'km' | 'mi')}
            />
            <Row
              label="Map theme"
              value={mapDark ? 'dark' : 'light'}
              options={['light', 'dark']}
              onChange={(v) => onMapDark(v === 'dark')}
            />
            <Row
              label="Default preference"
              value={preference}
              options={['shade', 'sun']}
              onChange={(v) => onPreference(v as 'shade' | 'sun')}
            />

            <Text style={styles.group}>Privacy & data</Text>
            <Pressable style={styles.link} onPress={onClearRecent} accessibilityRole="button">
              <Text style={styles.linkText}>Clear recent trips</Text>
            </Pressable>
            <Pressable
              style={styles.link}
              onPress={() => Linking.openURL(PRIVACY_URL)}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>Privacy Policy</Text>
            </Pressable>
            <Pressable
              style={styles.link}
              onPress={() => Linking.openURL(TERMS_URL)}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>Terms of Use</Text>
            </Pressable>
            <Text style={styles.note}>
              Location is used only when you tap Use my location. Recent trips stay on this device.
            </Text>

            <Text style={styles.group}>About</Text>
            <Text style={styles.about}>
              ShadeLane · v{APP_VERSION}{'\n'}
              Sun-smart seat advice using clear-sky solar geometry.{'\n'}
              Map data © OpenStreetMap contributors · Routing via OSRM · Places via Open-Meteo
            </Text>
            <Pressable
              style={styles.link}
              onPress={() => Linking.openURL(`mailto:${SUPPORT}`)}
              accessibilityRole="link"
            >
              <Text style={styles.linkText}>Contact support</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((opt) => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === opt }}
            style={[styles.chip, value === opt && styles.chipOn]}
          >
            <Text style={[styles.chipText, value === opt && styles.chipTextOn]}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,37,50,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.tealDeep,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31,111,106,0.08)',
  },
  closeText: { fontSize: 22, color: colors.ink },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  group: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.inkSoft,
    fontWeight: '700',
  },
  row: {
    marginBottom: 10,
  },
  rowLabel: { color: colors.ink, marginBottom: 6, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,37,50,0.12)',
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.ink, fontWeight: '600', textTransform: 'capitalize' },
  chipTextOn: { color: '#fff' },
  link: {
    marginVertical: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(31,111,106,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(16,37,50,0.12)',
  },
  linkText: { color: colors.tealDeep, fontWeight: '700' },
  note: { marginTop: 8, color: colors.inkSoft, fontSize: 13, lineHeight: 18 },
  about: { color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
});
