import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { MyPlan, startPlanPayment } from '../api/provider';
import { WEB_URL } from '../config';
import { tokenStore } from '../storage/tokens';
import { colors } from '../theme';
import { Btn, Card, ErrorText, H, Pill, money } from '../ui';

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export const planLocked = (plan: MyPlan | null) => !!plan && plan.required && !plan.active;

/**
 * "My plan": the provider's current plan and the plans the super admin offers. Paying opens the
 * website's /pay page (Razorpay runs there); coming back to the app reloads the plan.
 */
export default function PlanScreen({ plan, onReload }: { plan: MyPlan | null; onReload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const buy = async (planId: string) => {
    setBusy(planId);
    setError('');
    try {
      const order = await startPlanPayment(planId);
      const token = await tokenStore.getAccess();
      const hash = `o=${encodeURIComponent(order.razorpayOrderId)}&k=${encodeURIComponent(order.keyId)}&a=${order.amount}&t=${encodeURIComponent(token ?? '')}&x=plan`;
      await Linking.openURL(`${WEB_URL}/pay#${hash}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onReload(); setRefreshing(false); }} />}>
      <H title="My plan" sub="A running plan lets you add services and get new bookings." center />
      <ErrorText message={error} />
      <View style={{ padding: 16, paddingTop: 8, gap: 12 }}>
        {!plan ? null : (
          <Card>
            {!plan.required ? (
              <Text style={{ color: colors.text }}>Plans are switched off right now. Everything is free to use.</Text>
            ) : plan.active ? (
              <View style={{ gap: 6 }}>
                <Pill text="Running" tone="success" />
                <Text style={{ color: colors.text }}>Your plan runs until {longDate(plan.until!)} ({plan.daysLeft} day{plan.daysLeft === 1 ? '' : 's'} left). Buying again adds the days after this date.</Text>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <Pill text={plan.until ? 'Ended' : 'No plan'} tone="danger" />
                <Text style={{ color: colors.text }}>{plan.until ? `Your plan ended on ${longDate(plan.until)}.` : 'You do not have a plan yet.'} Pick a plan below to add services and get bookings.</Text>
              </View>
            )}
          </Card>
        )}
        {plan?.plans.map((p) => (
          <Card key={p._id}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{p.name}</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 4 }}>{money(p.price)}</Text>
            <Text style={{ color: colors.muted }}>for {p.days} days</Text>
            {p.description ? <Text style={{ color: colors.text, marginTop: 6 }}>{p.description}</Text> : null}
            <View style={{ marginTop: 12 }}>
              <Btn title={busy === p._id ? 'Opening payment…' : plan.active ? 'Renew with this plan' : 'Buy now'} disabled={!!busy || !plan.canPayOnline} onPress={() => buy(p._id)} />
            </View>
          </Card>
        ))}
        {plan && plan.plans.length === 0 ? <Text style={{ color: colors.muted, textAlign: 'center' }}>No plans are offered right now. Please contact Autozo.</Text> : null}
        {plan && plan.plans.length > 0 && !plan.canPayOnline ? <Text style={{ color: colors.muted, textAlign: 'center' }}>Online payment is switched off right now. Please contact Autozo.</Text> : null}
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 4 }}>After paying, come back here and pull down to refresh.</Text>
      </View>
    </ScrollView>
  );
}
