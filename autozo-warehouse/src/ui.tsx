import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { colors, radius, shadow } from './theme';

export const money = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
export const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const STATUS_LABEL: Record<string, string> = {
  placed: 'New', accepted: 'Accepted', preparing: 'Preparing', ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', rejected: 'Rejected',
};
export type Tone = 'brand' | 'success' | 'danger' | 'warn' | 'muted';
export const statusTone = (s: string): Tone => (s === 'delivered' ? 'success' : s === 'cancelled' || s === 'rejected' ? 'danger' : s === 'placed' ? 'warn' : 'brand');

const TONES: Record<Tone, { bg: string; fg: string }> = {
  brand: { bg: colors.primarySoft, fg: colors.primaryDark },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warn: { bg: '#FEF3C7', fg: '#B45309' },
  muted: { bg: '#F1F5F9', fg: colors.muted },
};

export function Pill({ text, tone = 'brand' }: { text: string; tone?: Tone }) {
  return <View style={[s.pill, { backgroundColor: TONES[tone].bg }]}><Text style={[s.pillText, { color: TONES[tone].fg }]}>{text}</Text></View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) { return <View style={[s.card, style]}>{children}</View>; }
export function H({ title, sub }: { title: string; sub?: string }) {
  return <View style={s.head}><Text style={s.title}>{title}</Text>{sub ? <Text style={s.sub}>{sub}</Text> : null}</View>;
}
export function Center({ children }: { children?: React.ReactNode }) { return <View style={s.center}>{children ?? <ActivityIndicator color={colors.primary} size="large" />}</View>; }
export function Empty({ text }: { text: string }) { return <View style={s.center}><Text style={s.sub}>{text}</Text></View>; }
export function ErrorText({ message }: { message: string }) { return message ? <View style={s.err}><Text style={s.errText}>{message}</Text></View> : null; }
export function Btn({ title, onPress, tone = 'primary', disabled, small }: { title: string; onPress: () => void; tone?: 'primary' | 'outline' | 'danger'; disabled?: boolean; small?: boolean }) {
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.dangerSoft : 'transparent';
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? colors.danger : colors.primary;
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 7 }).start();
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={() => !disabled && to(0.96)} onPressOut={() => to(1)}>
      <Animated.View style={[s.btn, small && s.btnSm, { backgroundColor: bg, borderColor: tone === 'outline' ? colors.primary : bg, transform: [{ scale }] }, disabled && { opacity: 0.6 }]}>
        <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
      </Animated.View>
    </Pressable>
  );
}
export function Chips<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {options.map(([v, label]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[s.chip, value === v && s.chipOn]}>
          <Text style={[s.chipText, value === v && { color: '#fff' }]}>{label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
export function SearchBar({ value, onChangeText, onSubmit, placeholder }: { value: string; onChangeText: (t: string) => void; onSubmit: () => void; placeholder: string }) {
  return <TextInput style={s.search} value={value} onChangeText={onChangeText} onSubmitEditing={onSubmit} returnKeyType="search" placeholder={placeholder} placeholderTextColor="#94A3B8" autoCapitalize="none" />;
}
export function Input({ label, value, onChangeText, keyboardType, multiline, placeholder, secure }: { label: string; value: string; onChangeText: (t: string) => void; keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'decimal-pad'; multiline?: boolean; placeholder?: string; secure?: boolean }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, multiline && { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} value={value} onChangeText={onChangeText} keyboardType={keyboardType} multiline={multiline} placeholder={placeholder} placeholderTextColor="#94A3B8" secureTextEntry={secure} autoCapitalize="none" />
    </View>
  );
}
export const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' };

const s = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 12, ...shadow },
  head: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  err: { backgroundColor: colors.dangerSoft, padding: 10, borderRadius: radius.md, marginHorizontal: 16, marginBottom: 8 },
  errText: { color: colors.danger, fontSize: 13.5, fontWeight: '500' },
  btn: { height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1.5 },
  btnSm: { height: 36, paddingHorizontal: 12 },
  btnText: { fontSize: 15, fontWeight: '700' },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: '#E2E8F0' },
  chipOn: { backgroundColor: colors.primary },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.text },
  search: { height: 44, marginHorizontal: 16, marginVertical: 6, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 15, color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 5 },
  input: { height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 12, fontSize: 15, color: colors.text },
});
