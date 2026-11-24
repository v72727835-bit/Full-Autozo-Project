import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/AuthLayout';
import { fetchMyPlan, startPlanPayment, syncPlanPayments } from '../api/rider';
import { ManualPay } from '../components/ManualPay';
import { OnlinePay, PayOrder } from '../components/OnlinePay';
import { getErrorMessage } from '../api/client';
import { MyPlan } from '../types';
import { colors, radius, shadow } from '../theme';
import { FadeSlide } from '../components/anim';

const money = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * The rider's plan: how long it runs and the plans the super admin offers. Paying opens the
 * payment window inside the app (Razorpay runs in it); the plan starts as soon as the payment is done.
 */
export default function PlanScreen({ onChanged }: { onChanged?: () => void }) {
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState<PayOrder | null>(null);

  const load = useCallback(async () => {
    try {
      setPlan(await fetchMyPlan());
      setError('');
      onChanged?.();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [onChanged]);
  useEffect(() => {
    load();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  const buy = async (planId: string) => {
    setBusy(planId);
    setError('');
    try {
      setPaying(await startPlanPayment(planId));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {error ? <ErrorBanner message={error} /> : null}
      {plan ? (
        <FadeSlide>
          <View style={[styles.status, plan.required && !plan.active ? styles.statusOff : styles.statusOn]}>
            <Ionicons name={plan.required && !plan.active ? 'alert-circle' : 'checkmark-circle'} size={22} color="#fff" />
            <Text style={styles.statusText}>
              {!plan.required
                ? 'Plans are switched off right now. You get orders for free.'
                : plan.active
                  ? `Your plan runs until ${longDate(plan.until!)} (${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'} left).`
                  : `${plan.until ? `Your plan ended on ${longDate(plan.until)}.` : 'You do not have a plan yet.'} Buy a plan to get new orders.`}
            </Text>
          </View>
        </FadeSlide>
      ) : null}

      {plan?.plans.map((p, i) => (
        <FadeSlide key={p._id} delay={60 + i * 40}>
          <View style={styles.card}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.price}>{money(p.price)}</Text>
            <Text style={styles.muted}>for {p.days} days</Text>
            {p.description ? <Text style={styles.desc}>{p.description}</Text> : null}
            <Button
              title={plan.active ? 'Renew with this plan' : 'Buy now'}
              loading={busy === p._id}
              disabled={!!busy || !plan.canPayOnline}
              onPress={() => buy(p._id)}
              style={{ marginTop: 14 }}
            />
            <ManualPay purpose="subscription" planId={p._id} planName={p.name} amount={p.price} onDone={() => void load()} />
          </View>
        </FadeSlide>
      ))}
      {plan && plan.plans.length === 0 ? <Text style={styles.note}>No plans are offered right now. Please contact autozo.</Text> : null}
      {plan && plan.plans.length > 0 && !plan.canPayOnline ? <Text style={styles.note}>Online payment is switched off right now. Please contact autozo.</Text> : null}
      {plan?.active ? <Text style={styles.note}>Buying again adds the days after your current plan ends.</Text> : null}
      <Text style={styles.note}>After paying, come back here and pull down to refresh.</Text>
    </ScrollView>
    <OnlinePay
      order={paying}
      kind="plan"
      onPaid={() => { setPaying(null); void load(); }}
      onClose={() => { setPaying(null); void syncPlanPayments().catch(() => undefined).then(() => load()); }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 30 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: radius.lg, marginBottom: 14 },
  statusOn: { backgroundColor: colors.success },
  statusOff: { backgroundColor: '#B91C1C' },
  statusText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, marginBottom: 12, ...shadow },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  price: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 4 },
  muted: { color: colors.muted },
  desc: { color: colors.text, marginTop: 8 },
  note: { color: colors.muted, textAlign: 'center', marginTop: 8 },
});
