import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { providerDashboard, setAvailability } from '../api/provider';
import { useAuth } from '../context/AuthContext';
import { colors, radius, softShadow } from '../theme';
import { ProviderDashboard } from '../types';
import { Card, Center, ErrorText, money, Section, StatTile } from '../ui';

export default function DashboardScreen() {
  const { me, reload } = useAuth();
  const [d, setD] = useState<ProviderDashboard | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [available, setAvail] = useState(!me?.providerBusy);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try { setD(await providerDashboard()); setError(''); }
    catch (e) { setError(getErrorMessage(e)); }
    finally { if (isRefresh) setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (v: boolean) => {
    setAvail(v);
    try { await setAvailability(v); await reload(); } catch { setAvail(!v); }
  };

  const approved = me?.providerStatus === 'approved';

  if (!d && !error) return <Center />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
      <ErrorText message={error} />

      {!approved ? (
        <View style={[st.banner, { backgroundColor: colors.dangerSoft }]}>
          <Text style={{ color: colors.danger, fontWeight: '700' }}>Your account is waiting for admin approval. You can’t take bookings or add services until it’s approved.</Text>
        </View>
      ) : (
        <Card style={st.availCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.availTitle}>{available ? 'You’re online' : 'You’re offline'}</Text>
            <Text style={st.availSub}>{available ? 'New bookings will ring on your phone.' : 'Turn on to receive new bookings.'}</Text>
          </View>
          <Switch value={available} onValueChange={toggle} trackColor={{ true: colors.primary }} />
        </Card>
      )}

      {d?.blockedByDues ? (
        <View style={[st.banner, { backgroundColor: colors.dangerSoft, marginTop: 10 }]}>
          <Text style={{ color: colors.danger, fontWeight: '800' }}>New bookings are stopped — {money(d.due ?? 0)} commission due</Text>
          <Text style={{ color: colors.danger, marginTop: 4 }}>Open Wallet and pay it. Bookings start again once the office confirms it.</Text>
        </View>
      ) : null}

      {d ? (
        <>
          <Section title="Overview" />
          <View style={st.grid}>
            <StatTile label="Total services" num={d.totalServices} icon="construct-outline" accent="blue" />
            <StatTile label="Active" num={d.activeServices} icon="checkmark-circle-outline" accent="emerald" />
            <StatTile label="Bookings" num={d.bookings} icon="receipt-outline" accent="violet" />
            <StatTile label="Today" num={d.todaysBookings} icon="calendar-outline" accent="amber" />
            <StatTile label="Earnings" num={d.earnings} fmt={money} icon="wallet-outline" accent="orange" />
          </View>

          {Object.keys(d.bookingsByStatus).length > 0 ? (
            <>
              <Section title="Bookings by status" />
              <Card>
                {Object.entries(d.bookingsByStatus).map(([k, v]) => (
                  <View key={k} style={st.row}>
                    <Text style={st.rowLabel}>{k.replace(/_/g, ' ')}</Text>
                    <Text style={st.rowVal}>{v}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  banner: { padding: 14, borderRadius: radius.md, marginBottom: 14 },
  availCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6, ...softShadow },
  availTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  availSub: { color: colors.muted, marginTop: 2, fontSize: 12.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { color: colors.text, textTransform: 'capitalize' },
  rowVal: { color: colors.text, fontWeight: '800' },
});
