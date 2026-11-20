import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { createBooking, fareFor, fetchService, priceLabel, ServiceListing } from '../api/services';
import { fetchAddresses } from '../api/user';
import { WEB_URL } from '../config';
import { tokenStore } from '../storage/tokens';
import type { AppNav, AppRoute } from '../navigation/types';
import { gutter, ms, radius, space, useTheme } from '../theme';
import { Address } from '../types';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Feedback';
import { SmartImage } from '../ui/SmartImage';
import { Txt } from '../ui/Text';
import { useToast } from '../ui/Toast';

const DAYS: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

export function ServiceDetailScreen() {
  const navigation = useNavigation<AppNav>();
  const { params } = useRoute<AppRoute<'ServiceDetail'>>();
  const { c } = useTheme();
  const toast = useToast();

  const [service, setService] = useState<ServiceListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrId, setAddrId] = useState<string>('');
  const [payment, setPayment] = useState<'cod' | 'online'>('cod');
  const [note, setNote] = useState('');
  const [km, setKm] = useState('');
  const [booking, setBooking] = useState(false);
  const [photo, setPhoto] = useState(0);

  useEffect(() => {
    fetchService(params.idOrSlug).then(setService).catch((e) => setError(getErrorMessage(e)));
    fetchAddresses().then((a) => {
      setAddresses(a);
      setAddrId((a.find((x) => x.isDefault) ?? a[0])?._id ?? '');
    }).catch(() => undefined);
  }, [params.idOrSlug]);

  if (error) return <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}><AppHeader title={params.title ?? 'Service'} showBack /><EmptyState icon="alert-circle" title="Couldn’t load" message={error} /></View>;
  if (!service) return <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}><AppHeader title={params.title ?? 'Service'} showBack /></View>;

  const providerName = typeof service.provider === 'object' ? service.provider?.name : undefined;
  const addr = addresses.find((a) => a._id === addrId);

  const book = async () => {
    if (!addr) { toast.error('Please add a delivery address first.'); return; }
    const perKm = service.priceUnit === 'per_km';
    if (perKm && !(Number(km) > 0)) { toast.error('Enter how many km you need this service for.'); return; }
    setBooking(true);
    try {
      const created = await createBooking({
        serviceId: service._id,
        note: note.trim() || undefined,
        ...(perKm ? { distanceKm: Number(km) } : {}),
        paymentMethod: payment,
        address: {
          name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, landmark: addr.landmark,
          city: addr.city, state: addr.state, pincode: addr.pincode, location: addr.location,
        },
      });
      if ('requiresPayment' in created) {
        // Razorpay runs on the website; the booking starts ringing providers once payment is verified there.
        const token = await tokenStore.getAccess();
        const hash = `o=${encodeURIComponent(created.razorpayOrderId)}&k=${encodeURIComponent(created.keyId)}&a=${created.amount}&t=${encodeURIComponent(token ?? '')}&x=booking`;
        await Linking.openURL(`${WEB_URL}/pay#${hash}`);
        navigation.replace('BookingDetail', { id: created.bookingId });
        return;
      }
      toast.success('Booking placed! Finding a provider…');
      navigation.replace('BookingDetail', { id: created._id });
    } catch (e) {
      toast.error(getErrorMessage(e));
      setBooking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}>
      <AppHeader title={service.title} showBack />
      <ScrollView contentContainerStyle={{ padding: gutter, paddingBottom: ms(120) }}>
        {service.images?.[0] ? <SmartImage uri={service.images[photo] ?? service.images[0]} style={styles.hero} full /> : null}
        {service.images && service.images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, marginTop: space.xs }}>
            {service.images.map((u, i) => (
              <Pressable key={u} onPress={() => setPhoto(i)} style={[styles.thumbWrap, { borderColor: i === photo ? c.brand : c.border }]}>
                <SmartImage uri={u} style={styles.thumb} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Txt variant="h2" style={{ marginTop: space.md }}>{service.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
          <Txt variant="price" tone="brand">{priceLabel(service.price, service.priceUnit, service)}</Txt>
          {service.mrp && service.mrp > service.price ? <Txt variant="bodySm" tone="muted" style={{ textDecorationLine: 'line-through' }}>₹{service.mrp}</Txt> : null}
          <Txt variant="caption" tone="muted">~{service.durationMins} min</Txt>
        </View>
        <Txt variant="bodySm" tone="muted" style={{ marginTop: space.xxs }}>
          {providerName ? `by ${providerName}` : ''}{service.ratingCount > 0 ? ` · ★ ${service.rating.toFixed(1)} (${service.ratingCount})` : ''}
        </Txt>

        {service.description ? <Txt variant="body" style={{ marginTop: space.md }}>{service.description}</Txt> : null}
        {service.video ? (
          <Button label="Watch video of the work" icon="play-circle-outline" variant="secondary" style={{ marginTop: space.md }} onPress={() => Linking.openURL(service.video!)} />
        ) : null}

        {service.availability && service.availability.length > 0 ? (
          <View style={[styles.box, { borderColor: c.border, backgroundColor: c.surface }]}>
            <Txt variant="h4">Available hours</Txt>
            {service.availability.map((a, i) => (
              <Txt key={i} variant="bodySm" tone="muted">{DAYS[a.day] ?? a.day}: {a.open}–{a.close}</Txt>
            ))}
          </View>
        ) : null}

        <Txt variant="h4" style={{ marginTop: space.lg, marginBottom: space.xs }}>Service address</Txt>
        {addresses.length === 0 ? (
          <Button label="Add an address" variant="secondary" onPress={() => navigation.navigate('AddressForm')} />
        ) : (
          addresses.map((a) => {
            const on = a._id === addrId;
            return (
              <Pressable key={a._id} onPress={() => setAddrId(a._id)} style={[styles.addr, { borderColor: on ? c.brand : c.border, backgroundColor: c.surface }]}>
                <Txt variant="label">{a.name} · {a.phone}</Txt>
                <Txt variant="bodySm" tone="muted">{a.line1}, {a.city}, {a.state} {a.pincode}</Txt>
              </Pressable>
            );
          })
        )}

        <Txt variant="h4" style={{ marginTop: space.lg, marginBottom: space.xs }}>Payment</Txt>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(['cod', 'online'] as const).map((m) => {
            const on = payment === m;
            return (
              <Pressable key={m} onPress={() => setPayment(m)} style={[styles.pay, { borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brandSurface : c.surface }]}>
                <Txt variant="label" tone={on ? 'brand' : 'body'}>{m === 'cod' ? 'Pay after service' : 'Pay online'}</Txt>
              </Pressable>
            );
          })}
        </View>

        {service.priceUnit === 'per_km' ? (
          <>
            <Txt variant="h4" style={{ marginTop: space.lg, marginBottom: space.xs }}>How many km? (e.g. distance to tow)</Txt>
            <TextInput
              value={km}
              onChangeText={(v) => setKm(v.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="e.g. 18"
              placeholderTextColor={c.inkFaint}
              style={[styles.note, { minHeight: ms(48), backgroundColor: c.surface, borderColor: c.border, color: c.ink }]}
            />
            {Number(km) > 0 ? <Txt variant="label" tone="brand" style={{ marginTop: space.xs }}>Fare for {km} km: ₹{fareFor(service, Number(km))} (provider confirms the real km after the trip)</Txt> : null}
          </>
        ) : null}

        <Txt variant="h4" style={{ marginTop: space.lg, marginBottom: space.xs }}>Notes (optional)</Txt>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Anything the provider should know"
          placeholderTextColor={c.inkFaint}
          multiline
          style={[styles.note, { backgroundColor: c.surface, borderColor: c.border, color: c.ink }]}
        />
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.border }]}>
        <Button label={service.priceUnit === 'per_km' && Number(km) > 0 ? `Book · ₹${fareFor(service, Number(km))}` : `Book · ${priceLabel(service.price, service.priceUnit, service)}`} size="lg" loading={booking} onPress={book} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: ms(190), borderRadius: radius.lg },
  thumbWrap: { borderWidth: 2, borderRadius: radius.sm, overflow: 'hidden' },
  thumb: { width: ms(64), height: ms(48) },
  box: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginTop: space.md, gap: space.xxs },
  addr: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  pay: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  note: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: ms(70), textAlignVertical: 'top' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: gutter, borderTopWidth: 1 },
});
