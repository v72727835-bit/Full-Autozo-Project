import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { Booking, BookingStatus, cancelBooking, fetchBooking } from '../api/services';
import type { AppNav, AppRoute } from '../navigation/types';
import { gutter, ms, radius, space, useTheme } from '../theme';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { Txt } from '../ui/Text';
import { useToast } from '../ui/Toast';

const CANCELLABLE: BookingStatus[] = ['requested', 'accepted', 'on_the_way'];
const LIVE: BookingStatus[] = ['requested', 'accepted', 'on_the_way', 'in_progress'];
const label = (s: string) => s.replace(/_/g, ' ');
const toneFor = (s: BookingStatus): 'success' | 'danger' | 'warning' | 'muted' =>
  s === 'requested' ? 'warning' : ['cancelled', 'rejected', 'expired'].includes(s) ? 'danger' : s === 'completed' ? 'muted' : 'success';

export function BookingDetailScreen() {
  const navigation = useNavigation<AppNav>();
  const { params } = useRoute<AppRoute<'BookingDetail'>>();
  const { c } = useTheme();
  const toast = useToast();
  const [b, setB] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => fetchBooking(params.id).then((x) => { setB(x); setError(null); return x; }).catch((e) => { setError(getErrorMessage(e)); return null; });

  useEffect(() => {
    load();
    timer.current = setInterval(async () => {
      const x = await load();
      if (x && !LIVE.includes(x.status) && timer.current) { clearInterval(timer.current); timer.current = null; }
    }, 8000);
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (error && !b) return <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}><AppHeader title="Booking" showBack /><EmptyState icon="alert-circle" title="Couldn’t load" message={error} /></View>;
  if (!b) return <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}><AppHeader title="Booking" showBack /></View>;

  const providerName = typeof b.provider === 'object' ? b.provider?.name : undefined;
  const providerPhone = typeof b.provider === 'object' ? b.provider?.phone : undefined;

  const doCancel = async () => {
    setBusy(true);
    try { await cancelBooking(b._id); toast.success('Booking cancelled'); load(); } catch (e) { toast.error(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={[styles.box, { borderColor: c.border, backgroundColor: c.surface }]}>
      <Txt variant="h4" style={{ marginBottom: space.xs }}>{title}</Txt>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}>
      <AppHeader title={b.snapshot.title} showBack />
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: ms(40) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="bodySm" tone="muted">{b.bookingNumber} · ₹{b.price}</Txt>
          <Txt variant="label" tone={toneFor(b.status)}>{label(b.status)}</Txt>
        </View>

        {b.status === 'requested' ? <Txt variant="body" tone="muted" style={{ marginTop: space.sm }}>We’re ringing nearby providers. The first to accept takes your booking.</Txt> : null}
        {['rejected', 'expired'].includes(b.status) ? <Txt variant="body" tone="danger" style={{ marginTop: space.sm }}>No provider could take this booking. Any payment will be refunded.</Txt> : null}

        {LIVE.includes(b.status) && b.completionOtp ? (
          <Card title={`Completion OTP · ${b.bookingNumber}`}>
            <Txt variant="bodySm" tone="muted">Give this to the provider only after the work is done. The service is completed only with this OTP. Each booking has its own OTP.</Txt>
            <Txt variant="display" tone="brand" style={{ letterSpacing: 6, marginTop: space.xs }}>{b.completionOtp}</Txt>
          </Card>
        ) : null}

        {providerName ? (
          <Card title="Your provider">
            <Txt variant="body">{providerName}{providerPhone ? ` · ${providerPhone}` : ''}</Txt>
            {providerPhone ? <Button label="Call provider" variant="secondary" size="sm" style={{ marginTop: space.sm, alignSelf: 'flex-start' }} onPress={() => Linking.openURL(`tel:${providerPhone}`)} /> : null}
          </Card>
        ) : null}

        <Card title="Service address">
          <Txt variant="body">{b.address.name} · {b.address.phone}</Txt>
          <Txt variant="bodySm" tone="muted">{b.address.line1}{b.address.line2 ? `, ${b.address.line2}` : ''}, {b.address.city}, {b.address.state} {b.address.pincode}</Txt>
          {b.scheduledAt ? <Txt variant="bodySm" tone="muted" style={{ marginTop: space.xs }}>Scheduled: {new Date(b.scheduledAt).toLocaleString()}</Txt> : null}
          {b.note ? <Txt variant="bodySm" tone="muted" style={{ marginTop: space.xs }}>Note: {b.note}</Txt> : null}
        </Card>

        {CANCELLABLE.includes(b.status) ? (
          <Button label="Cancel booking" variant="danger" loading={busy} style={{ marginTop: space.md }} onPress={doCancel} />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.lg, padding: space.md, marginTop: space.md },
});
