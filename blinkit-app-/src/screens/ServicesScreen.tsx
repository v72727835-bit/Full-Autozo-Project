import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { fetchServiceCategories, listServices, priceLabel, ServiceCategory, ServiceListing } from '../api/services';
import type { AppNav } from '../navigation/types';
import { gutter, ms, radius, space, useTheme } from '../theme';
import { AppHeader } from '../ui/AppHeader';
import { EmptyState } from '../ui/Feedback';
import { RowSkeleton } from '../ui/Skeleton';
import { SmartImage } from '../ui/SmartImage';
import { Txt } from '../ui/Text';

const providerName = (s: ServiceListing) => (typeof s.provider === 'object' ? s.provider?.name : undefined);

export function ServicesScreen() {
  const navigation = useNavigation<AppNav>();
  const { c } = useTheme();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ServiceListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServiceCategories().then(setCats).catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    setItems(null);
    const t = setTimeout(() => {
      listServices({ category: category || undefined, q: q.trim() || undefined })
        .then((r) => { if (live) { setItems(r); setError(null); } })
        .catch((e) => { if (live) { setError(getErrorMessage(e)); setItems([]); } });
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [category, q]);

  const chips = useMemo(() => [{ _id: '', name: 'All', slug: '' } as ServiceCategory, ...cats], [cats]);

  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceSunken }}>
      <AppHeader title="Services" showBack subtitle="Book a trusted local pro" />
      <View style={{ paddingHorizontal: gutter, paddingTop: space.sm }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search services…"
          placeholderTextColor={c.inkFaint}
          style={[styles.search, { backgroundColor: c.surface, borderColor: c.border, color: c.ink }]}
        />
        <FlatList
          horizontal
          data={chips}
          keyExtractor={(x) => x._id || 'all'}
          showsHorizontalScrollIndicator={false}
          style={{ marginVertical: space.sm }}
          renderItem={({ item }) => {
            const on = category === item._id;
            return (
              <Pressable
                onPress={() => setCategory(item._id)}
                style={[styles.chip, { borderColor: on ? c.brand : c.border, backgroundColor: on ? c.brand : c.surface }]}
              >
                <Txt variant="label" tone={on ? 'onBrand' : 'body'}>{item.name}</Txt>
              </Pressable>
            );
          }}
        />
      </View>

      {items === null ? (
        <View style={{ paddingHorizontal: gutter }}>{[0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}</View>
      ) : items.length === 0 ? (
        <EmptyState icon="search" title="No services found" message={error ?? 'Try another category or search.'} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s._id}
          contentContainerStyle={{ padding: gutter, gap: space.sm }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('ServiceDetail', { idOrSlug: item.slug, title: item.title })}
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
            >
              <SmartImage uri={item.images?.[0]} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Txt variant="h4" numberOfLines={1}>{item.title}</Txt>
                {providerName(item) ? <Txt variant="bodySm" tone="muted">by {providerName(item)}</Txt> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs }}>
                  <Txt variant="price" tone="brand">{priceLabel(item.price, item.priceUnit)}</Txt>
                  <Txt variant="caption" tone="muted">
                    {item.ratingCount > 0 ? `★ ${item.rating.toFixed(1)} (${item.ratingCount})` : 'New'} · ~{item.durationMins}m
                  </Txt>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { height: ms(44), borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: ms(14) },
  chip: { paddingHorizontal: space.md, paddingVertical: ms(7), borderRadius: radius.pill, borderWidth: 1, marginRight: space.xs },
  card: { flexDirection: 'row', gap: space.md, padding: space.sm, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  thumb: { width: ms(68), height: ms(68), borderRadius: radius.md },
});
