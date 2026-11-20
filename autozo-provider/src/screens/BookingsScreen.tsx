import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { cancelBooking, providerBookings, setBookingStatus } from '../api/provider';
import { colors, radius } from '../theme';
import { BookingRow, BookingStatus } from '../types';
import { Btn, Card, Center, Empty, ErrorText, Input, Pill, when } from '../ui';
import { Tone } from '../ui';

const FORWARD: Record<string, { to: BookingStatus; label: string }> = {
  accepted: { to: 'on_the_way', label: 'Start travelling' },
  on_the_way: { to: 'in_progress', label: 'Start work' },
  in_progress: { to: 'completed', label: 'Complete (enter OTP)' },
};
const tone = (s: BookingStatus): Tone => (s === 'completed' ? 'success' : ['cancelled', 'rejected', 'expired'].includes(s) ? 'danger' : s === 'requested' ? 'warn' : 'brand');
const nameOf = (v: { name?: string; phone?: string } | string | undefined) => (typeof v === 'object' ? v?.name : undefined);
const phoneOf = (v: { name?: string; phone?: string } | string | undefined) => (typeof v === 'object' ? v?.phone : undefined);

export default function BookingsScreen() {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<BookingRow | null>(null);
  const [otp, setOtp] = useState('');
  const [km, setKm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try { const { items } = await providerBookings({ page: 1, limit: 50 }); setRows(items); setError(''); }
    catch (e) { setError(getErrorMessage(e)); setRows([]); }
    finally { if (isRefresh) setRefreshing(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => load(), 15000); return () => clearInterval(t); }, [load]);

  /** Pay-after-service per-km job: the real distance sets the final price. */
  const perKmCash = (b: BookingRow) => b.snapshot.priceUnit === 'per_km' && b.paymentMethod === 'cod';
  const fareFor = (b: BookingRow, d: number) => Math.round(b.snapshot.price + Math.max(0, d - (b.snapshot.includedKm ?? 0)) * (b.snapshot.perKmRate ?? 0));

  const advance = async (b: BookingRow) => {
    const step = FORWARD[b.status];
    if (!step) return;
    setBusy(true); setError('');
    try { await setBookingStatus(b._id, step.to, step.to === 'completed' ? otp : undefined, step.to === 'completed' && perKmCash(b) && Number(km) > 0 ? Number(km) : undefined); setActive(null); setOtp(''); setKm(''); load(); }
    catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };
  const drop = async (b: BookingRow) => {
    setBusy(true); setError('');
    try { await cancelBooking(b._id); setActive(null); load(); }
    catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  if (rows === null) return <Center />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
        <ErrorText message={error} />
        {rows.length === 0 ? <Empty text="No bookings yet. Accepted bookings appear here." /> : (
          rows.map((b) => (
            <Pressable key={b._id} onPress={() => { setActive(b); setOtp(''); }}>
              <Card style={st.card}>
                <View style={{ flex: 1 }}>
                  <Text style={st.title}>{b.snapshot.title}</Text>
                  <Text style={st.sub}>{b.bookingNumber} · ₹{b.price} · {when(b.createdAt)}</Text>
                </View>
                <Pill text={b.status.replace(/_/g, ' ')} tone={tone(b.status)} />
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Modal visible={!!active} animationType="slide" onRequestClose={() => setActive(null)}>
        {active ? (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 50 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={st.h}>{active.snapshot.title}</Text>
              <Pill text={active.status.replace(/_/g, ' ')} tone={tone(active.status)} />
            </View>
            <Text style={st.sub}>{active.bookingNumber} · ₹{active.price} · {active.paymentMethod.toUpperCase()}</Text>

            <Card style={{ marginTop: 14 }}>
              <Text style={st.lbl}>Customer</Text>
              <Text style={st.val}>{nameOf(active.customer) ?? '-'}{phoneOf(active.customer) ? ` · ${phoneOf(active.customer)}` : ''}</Text>
              {phoneOf(active.customer) ? <View style={{ marginTop: 8 }}><Btn title="Call customer" tone="outline" small onPress={() => Linking.openURL(`tel:${phoneOf(active.customer)}`)} /></View> : null}
            </Card>

            <Card style={{ marginTop: 10 }}>
              <Text style={st.lbl}>Address</Text>
              <Text style={st.val}>{active.address.line1}{active.address.line2 ? `, ${active.address.line2}` : ''}, {active.address.city}, {active.address.state} {active.address.pincode}</Text>
              {active.address.location ? <View style={{ marginTop: 8 }}><Btn title="Open in maps" tone="outline" small onPress={() => Linking.openURL(`https://www.google.com/maps?q=${active.address.location!.lat},${active.address.location!.lng}`)} /></View> : null}
              {active.scheduledAt ? <Text style={[st.val, { marginTop: 8 }]}>Scheduled: {new Date(active.scheduledAt).toLocaleString()}</Text> : null}
              {active.note ? <Text style={[st.val, { marginTop: 8 }]}>Note: {active.note}</Text> : null}
            </Card>

            {active.status === 'in_progress' && perKmCash(active) ? (
              <View style={{ marginTop: 14 }}>
                <Input label={`Real distance in km (customer entered ${active.distanceKm ?? '?'} km)`} value={km} onChangeText={(v) => setKm(v.replace(/[^\d.]/g, ''))} keyboardType="numeric" placeholder={String(active.distanceKm ?? '')} />
                {Number(km) > 0 ? <Text style={st.val}>Final fare: ₹{fareFor(active, Number(km))}</Text> : null}
              </View>
            ) : null}

            {active.status === 'in_progress' ? (
              <View style={{ marginTop: 14 }}><Input label={`Completion OTP for ${active.bookingNumber} (ask the customer)`} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 4))} keyboardType="numeric" placeholder="4-digit OTP" /></View>
            ) : null}

            <ErrorText message={error} />
            <View style={{ marginTop: 14, gap: 8 }}>
              {FORWARD[active.status] ? <Btn title={FORWARD[active.status].label} onPress={() => advance(active)} disabled={busy || (active.status === 'in_progress' && otp.length !== 4)} /> : null}
              {['accepted', 'on_the_way'].includes(active.status) ? <Btn title="Can't do it — release" tone="danger" onPress={() => drop(active)} disabled={busy} /> : null}
              <Btn title="Close" tone="outline" onPress={() => setActive(null)} />
            </View>
          </ScrollView>
        ) : null}
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, marginTop: 2, fontSize: 12.5 },
  h: { fontSize: 20, fontWeight: '800', color: colors.text },
  lbl: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  val: { color: colors.text, marginTop: 4, fontSize: 14 },
});
