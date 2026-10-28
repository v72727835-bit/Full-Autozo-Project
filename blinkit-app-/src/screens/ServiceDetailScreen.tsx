import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { createBooking, fetchService, priceLabel, ServiceListing } from '../api/services';
import { fetchAddresses } from '../api/user';
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
  const [booking, setBooking] = useState(false);

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
    setBooking(true);
    try {
      const created = await createBooking({
        serviceId: service._id,
        note: note.trim() || undefined,
        paymentMethod: payment,
        address: {
          name: addr.name, phone: addr.phone, line1: addr.line1, line2: addr.line2, landmark: addr.landmark,
          city: addr.city, state: addr.state, pincode: addr.pincode, location: addr.location,
        },
      });
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
        {service.images?.[0] ? <SmartImage uri={service.images[0]} style={styles.hero} full /> : null}
        <Txt variant="h2" style={{ marginTop: space.md }}>{service.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs }}>
          <Txt variant="price" tone="brand">{priceLabel(service.price, service.priceUnit)}</Txt>
          {service.mrp && service.mrp > service.price ? <Txt variant="bodySm" tone="muted" style={{ textDecorationLine: 'line-through' }}>₹{service.mrp}</Txt> : null}
          <Txt variant="caption" tone="muted">~{service.durationMins} min</Txt>
        </View>
        <Txt variant="bodySm" tone="muted" style={{ marginTop: space.xxs }}>
          {providerName ? `by ${providerName}` : ''}{service.ratingCount > 0 ? ` · ★ ${service.rating.toFixed(1)} (${service.ratingCount})` : ''}
        </Txt>

        {service.description ? <Txt variant="body" style={{ marginTop: space.md }}>{service.description}</Txt> : null}

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
        <Button label={`Book · ${priceLabel(service.price, service.priceUnit)}`} size="lg" loading={booking} onPress={book} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', height: ms(190), borderRadius: radius.lg },
  box: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginTop: space.md, gap: space.xxs },
  addr: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  pay: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: space.md, alignItems: 'center' },
  note: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: ms(70), textAlignVertical: 'top' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: gutter, borderTopWidth: 1 },
});
