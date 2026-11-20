import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { setServiceRadius } from '../api/provider';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { Btn, Card, Section } from '../ui';

const MIN_KM = 1;
const MAX_KM = 100;
const QUICK_KM = [5, 10, 25, 50, 100] as const;
const clamp = (km: number) => Math.min(MAX_KM, Math.max(MIN_KM, Math.round(km)));

export default function AccountScreen() {
  const { me, signOut, reload } = useAuth();
  const saved = me?.providerRadiusKm ?? 10;
  const [km, setKm] = useState(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setKm(saved); }, [saved]);
  if (!me) return null;
  const app = me.providerApplication;
  const rows: [string, string][] = [
    ['Name', me.name],
    ['Phone', me.phone],
    ...(me.email ? ([['Email', me.email]] as [string, string][]) : []),
    ...(me.providerId ? ([['Provider ID', me.providerId]] as [string, string][]) : []),
    ['Status', me.providerStatus ?? '-'],
    ...(app?.firm ? ([['Business', app.firm]] as [string, string][]) : []),
    ...(app?.city ? ([['Base', `${app.city}${app.state ? `, ${app.state}` : ''}`]] as [string, string][]) : []),
  ];

  // Steps of 1 km up to 10 km, then 5 km, so a long way is quick to reach.
  const step = (dir: 1 | -1) => setKm((v) => clamp(v + dir * (v + (dir === -1 ? -1 : 0) < 10 ? 1 : 5)));
  const save = async () => {
    setSaving(true);
    try {
      await setServiceRadius(km);
      await reload();
      Alert.alert('Saved', `Customers up to ${km} km from your base can now find and book you.`);
    } catch (err) {
      Alert.alert('Could not save', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 14 }}>
      <Section title="My account" />
      <Card>
        {rows.map(([k, v]) => (
          <View key={k} style={st.row}>
            <Text style={st.k}>{k}</Text>
            <Text style={st.v}>{v}</Text>
          </View>
        ))}
      </Card>

      <Section title="Service area" />
      <Card>
        <Text style={st.hint}>How far from your base will you travel? Customers beyond this distance will not see your services or be able to book you.</Text>
        <View style={st.stepper}>
          <Pressable onPress={() => step(-1)} disabled={km <= MIN_KM} style={[st.stepBtn, km <= MIN_KM && st.stepOff]} accessibilityLabel="Decrease radius">
            <Text style={st.stepText}>−</Text>
          </Pressable>
          <View style={st.kmBox}>
            <Text style={st.km}>{km}</Text>
            <Text style={st.kmUnit}>km</Text>
          </View>
          <Pressable onPress={() => step(1)} disabled={km >= MAX_KM} style={[st.stepBtn, km >= MAX_KM && st.stepOff]} accessibilityLabel="Increase radius">
            <Text style={st.stepText}>+</Text>
          </Pressable>
        </View>
        <View style={st.chips}>
          {QUICK_KM.map((q) => (
            <Pressable key={q} onPress={() => setKm(q)} style={[st.chip, km === q && st.chipOn]}>
              <Text style={[st.chipText, km === q && st.chipTextOn]}>{q} km</Text>
            </Pressable>
          ))}
        </View>
        <Btn title={saving ? 'Saving…' : km === saved ? 'Saved' : 'Save service area'} onPress={() => void save()} disabled={saving || km === saved} />
      </Card>

      <View style={{ marginTop: 16 }}>
        <Btn title="Log out" tone="danger" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  k: { color: colors.muted },
  v: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
  hint: { color: colors.muted, marginBottom: 12, lineHeight: 19 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 12 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.35 },
  stepText: { color: colors.primary, fontSize: 26, fontWeight: '800', lineHeight: 30 },
  kmBox: { minWidth: 90, alignItems: 'center' },
  km: { color: colors.text, fontSize: 34, fontWeight: '800' },
  kmUnit: { color: colors.muted, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700' },
  chipTextOn: { color: '#fff' },
});
