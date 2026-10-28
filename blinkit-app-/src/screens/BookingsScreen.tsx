import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { Booking, BookingStatus, listBookings } from '../api/services';
import type { AppNav } from '../navigation/types';
import { gutter, ms, radius, space, useTheme } from '../theme';
import { AppHeader } from '../ui/AppHeader';
import { EmptyState } from '../ui/Feedback';
import { RowSkeleton } from '../ui/Skeleton';
import { Txt } from '../ui/Text';

type ToneName = 'success' | 'danger' | 'warning' | 'muted';
const TONE: Record<BookingStatus, ToneName> = {
  requested: 'warning', accepted: 'success', on_the_way: 'success', in_progress: 'success',
  completed: 'muted', cancelled: 'danger', rejected: 'danger', expired: 'danger',
};
const label = (s: string) => s.replace(/_/g, ' ');

export function BookingsScreen() {
  const navigation = useNavigation<AppNav>();
  const { c } = useTheme();
  const [items, setItems] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      listBookings()
        .then((r) => { if (live) { setItems(r); setError(null); } })
        .catch((e) => { if (live) { setError(getErrorMessage(e)); setItems([]); } });
      return () => { live = false; };
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}>
      <AppHeader title="My bookings" showBack />
      {items === null ? (
        <View style={{ paddingHorizontal: gutter }}>{[0, 1, 2].map((i) => <RowSkeleton key={i} />)}</View>
      ) : items.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No bookings yet" message={error ?? 'Book a service and track it here.'} actionLabel="Browse services" onAction={() => navigation.navigate('Services')} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b._id}
          contentContainerStyle={{ padding: gutter, gap: space.sm }}
          renderItem={({ item }) => (
            <Pressable onPress={() => navigation.navigate('BookingDetail', { id: item._id })} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h4" numberOfLines={1} style={{ flex: 1 }}>{item.snapshot.title}</Txt>
                <Txt variant="caption" tone={TONE[item.status]}>{label(item.status)}</Txt>
              </View>
              <Txt variant="bodySm" tone="muted" style={{ marginTop: space.xxs }}>{item.bookingNumber} · ₹{item.price} · {new Date(item.createdAt).toLocaleDateString()}</Txt>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.md },
});
