import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { sellerDashboard } from '../api/seller';
import { Dashboard } from '../types';
import { colors } from '../theme';
import { Card, Center, ErrorText, H, Pill, STATUS_LABEL, money, row, statusTone, when } from '../ui';
import { AnimatedNumber, FadeSlide } from '../components/anim';

export default function DashboardScreen() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setD(await sellerDashboard()); setError(''); } catch (e) { setError(getErrorMessage(e)); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!d) return error ? <Center><ErrorText message={error} /></Center> : <Center />;
  const by = d.orders.byStatus;
  const active = (by.accepted ?? 0) + (by.preparing ?? 0) + (by.ready_for_pickup ?? 0) + (by.out_for_delivery ?? 0);
  const max = Math.max(1, ...d.trend.map((t) => t.revenue));
  const stat = (label: string, value: string, hint: string, color = colors.text, num?: number, fmt?: (n: number) => string) => (
    <Card style={{ flex: 1, minWidth: '45%' }}>
      <Text style={{ color: colors.muted, fontSize: 12.5 }}>{label}</Text>
      {num !== undefined ? (
        <AnimatedNumber value={num} format={fmt} style={{ color, fontSize: 22, fontWeight: '800', marginVertical: 2 }} />
      ) : (
        <Text style={{ color, fontSize: 22, fontWeight: '800', marginVertical: 2 }}>{value}</Text>
      )}
      <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
    </Card>
  );

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <H title="Dashboard" sub="How your warehouse is doing today." />
      <ErrorText message={error} />
      <View style={{ padding: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {stat("Today's orders", '', `${d.orders.total} orders in all`, colors.text, d.today.orders)}
          {stat("Today's sales", '', `${money(d.deliveredRevenue)} delivered`, colors.success, d.today.revenue, money)}
          {stat('Waiting to accept', String(by.placed ?? 0), `${active} in progress`, '#B45309')}
          {stat('Low / out of stock', `${d.lowStock.length} / ${d.outOfStock}`, `${d.products.live} live · ${d.products.off} off`, colors.danger)}
        </View>

        <FadeSlide delay={60}><Card style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 10 }}>Sales, last 7 days</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 6 }}>
            {d.trend.map((t) => (
              <View key={t.date} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <View style={{ width: '100%', height: Math.max(3, (t.revenue / max) * 90), backgroundColor: colors.primary, borderRadius: 4 }} />
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 3 }}>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</Text>
              </View>
            ))}
          </View>
        </Card></FadeSlide>

        <FadeSlide delay={120}><Card>
          <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Order pipeline</Text>
          {(['placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'] as const).map((st) => (
            <View key={st} style={[row, { paddingVertical: 5 }]}><Pill text={STATUS_LABEL[st]} tone={statusTone(st)} /><Text style={{ fontWeight: '700' }}>{by[st] ?? 0}</Text></View>
          ))}
        </Card></FadeSlide>

        <FadeSlide delay={180}><Card>
          <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Best sellers</Text>
          {d.topProducts.length === 0 ? <Text style={{ color: colors.muted }}>No sales yet.</Text> : d.topProducts.map((p) => (
            <View key={p._id} style={[row, { paddingVertical: 5 }]}><Text style={{ flex: 1 }}>{p.name}</Text><Text style={{ color: colors.muted }}>{p.qty} sold · {money(p.revenue)}</Text></View>
          ))}
        </Card></FadeSlide>

        <Card>
          <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Running low</Text>
          {d.lowStock.length === 0 ? <Text style={{ color: colors.muted }}>Everything is well stocked.</Text> : d.lowStock.map((p) => (
            <View key={p._id} style={[row, { paddingVertical: 5 }]}><Text style={{ flex: 1 }}>{p.name} <Text style={{ color: colors.muted }}>{p.unit}</Text></Text><Pill text={`${p.stock} left`} tone="warn" /></View>
          ))}
        </Card>

        <Card>
          <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Recent orders</Text>
          {d.recent.length === 0 ? <Text style={{ color: colors.muted }}>No orders yet.</Text> : d.recent.map((o) => (
            <View key={o._id} style={[row, { paddingVertical: 6 }]}>
              <View><Text style={{ fontWeight: '700' }}>#{o.orderNumber}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{when(o.createdAt)} · {o.paymentMethod === 'cod' ? 'COD' : 'Paid online'}</Text></View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}><Text style={{ fontWeight: '700' }}>{money(o.total)}</Text><Pill text={STATUS_LABEL[o.status] ?? o.status} tone={statusTone(o.status)} /></View>
            </View>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}
