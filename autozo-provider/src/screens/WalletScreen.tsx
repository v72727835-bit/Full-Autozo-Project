import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { fetchWallet, payDues, payDuesOnline, requestWithdraw, saveWalletAccount, syncDuesPayments, walletTxns } from '../api/provider';
import { ManualPay } from '../components/ManualPay';
import { OnlinePay, PayOrder } from '../components/OnlinePay';
import { colors, radius } from '../theme';
import { ProviderTxn, ProviderWallet } from '../types';
import { Btn, Card, Center, Chips, ErrorText, Input, Pill, Section, StatTile, money, when } from '../ui';

const ENTRY: Record<ProviderTxn['kind'], string> = {
  earning: 'Online booking',
  commission: 'Commission due (cash booking)',
  commission_paid: 'Commission paid',
  withdrawal: 'Withdrawal',
  adjustment: 'Credit from autozo',
};
const sign = (t: ProviderTxn) =>
  t.kind === 'earning' || t.kind === 'adjustment' ? '+' : t.kind === 'withdrawal' || (t.kind === 'commission_paid' && t.method === 'wallet') ? '−' : '';

/**
 * Online bookings are paid to Autozo, so the provider's share collects here and
 * can be withdrawn. Cash bookings are kept by the provider; without a plan the
 * commission on them is a due, and over the limit no new bookings ring until
 * the office confirms it was paid.
 */
export default function WalletScreen() {
  const [w, setW] = useState<ProviderWallet | null>(null);
  const [rows, setRows] = useState<ProviderTxn[]>([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [payBy, setPayBy] = useState<'wallet' | 'cash' | 'upi'>('cash');
  const [payRef, setPayRef] = useState('');
  const [paying, setPaying] = useState<PayOrder | null>(null);
  const [acct, setAcct] = useState({ upi: '', bankHolder: '', bankNumber: '', bankIfsc: '' });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [d, t] = await Promise.all([fetchWallet(), walletTxns({ page: 1, limit: 40 })]);
      setW(d);
      setRows(t.items);
      setAcct({ upi: d.account?.upi ?? '', bankHolder: d.account?.bankHolder ?? '', bankNumber: d.account?.bankNumber ?? '', bankIfsc: d.account?.bankIfsc ?? '' });
      if (d.balance > 0) setPayBy((m) => (m === 'cash' ? 'wallet' : m));
      setError('');
    } catch (e) { setError(getErrorMessage(e)); }
    finally { if (isRefresh) setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key); setNote(''); setError('');
    try { await fn(); setNote(done); await load(); } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(''); }
  };

  if (!w) return error ? <ScrollView contentContainerStyle={{ padding: 14 }}><ErrorText message={error} /></ScrollView> : <Center />;
  const openDue = Math.max(0, w.due - w.duePending);

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}>
      {w.blocked ? (
        <View style={[st.banner, { backgroundColor: colors.dangerSoft }]}>
          <Text style={{ color: colors.danger, fontWeight: '800' }}>New bookings are stopped</Text>
          <Text style={{ color: colors.danger, marginTop: 4 }}>
            You owe {money(w.due)} commission on cash bookings. Pay it below — bookings start again once the office confirms it.
          </Text>
        </View>
      ) : null}
      <Text style={st.hint}>
        {w.hasPlan ? 'Your plan is running: no commission on your bookings.' : `No plan: autozo keeps ${w.planCommissionPct}% on each completed booking. Buy a plan for 0% commission.`}
      </Text>

      <ErrorText message={error} />
      {note ? <View style={st.ok}><Text style={st.okText}>{note}</Text></View> : null}

      <View style={st.grid}>
        <StatTile label="Wallet balance" num={w.balance} fmt={money} icon="wallet-outline" accent="emerald" hint="Online bookings" />
        <StatTile label="Commission due" num={w.due} fmt={money} icon="alert-circle-outline" accent={w.due > 0 ? 'orange' : 'blue'} hint={w.duePending > 0 ? `Waiting ${money(w.duePending)}` : `Limit ${money(w.dueLimit)}`} />
        <StatTile label="Cash you collected" num={w.cashCollected} fmt={money} icon="cash-outline" accent="amber" hint={`${w.cashBookings} cash bookings`} />
        <StatTile label="Paid out" num={w.paidOut} fmt={money} icon="arrow-up-circle-outline" accent="violet" hint={w.pendingWithdraw ? `Waiting ${money(w.pendingWithdraw)}` : undefined} />
      </View>

      <Section title="Pay commission" />
      <Card>
        {openDue <= 0 ? (
          <Text style={st.muted}>{w.duePending > 0 ? 'Your payment is waiting for the office to confirm.' : 'Nothing due.'}</Text>
        ) : (
          <>
            <Text style={st.big}>Due now: {money(openDue)}</Text>
            <Btn
              title={busy === 'online' ? 'Opening payment…' : `Pay ${money(openDue)} online`}
              disabled={busy === 'online'}
              onPress={() => run('online', async () => { setPaying(await payDuesOnline()); }, '')}
            />
            <Text style={[st.muted, { marginTop: 10 }]}>Pays autozo right here in the app and clears your commission at once. Or record a payment you made another way:</Text>
            <Chips value={payBy} onChange={setPayBy} options={[
              ...(w.balance > 0 ? [['wallet', `From wallet (${money(w.balance)})`] as const] : []),
              ['cash', 'Cash at office'] as const,
              ['upi', 'UPI to autozo'] as const,
            ]} />
            {payBy === 'upi' ? <Input label="UPI transaction id" value={payRef} onChangeText={setPayRef} placeholder="e.g. 4321XXXXXXXX" /> : null}
            <View style={{ marginTop: 10 }}>
              <Btn
                title={busy === 'due' ? 'Saving…' : payBy === 'wallet' ? `Pay ${money(Math.min(openDue, w.balance))} from wallet` : `I paid ${money(openDue)}`}
                disabled={busy === 'due' || (payBy === 'upi' && !payRef.trim())}
                onPress={() => run('due', () => payDues({ method: payBy, reference: payRef.trim() || undefined }),
                  payBy === 'wallet' ? 'Commission paid from your wallet.' : 'Payment recorded. Bookings start again once the office confirms it.')}
              />
            </View>
          </>
        )}
      </Card>

      <ManualPay purpose="provider_dues" amount={openDue} onDone={() => void load()} />

      <Section title="Withdraw" />
      <Card>
        <Text style={st.muted}>Online-booking money only. Smallest withdrawal is {money(w.minWithdraw)}.</Text>
        <Input label="Amount (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`up to ${Math.floor(w.balance)}`} />
        <Chips value={method} onChange={setMethod} options={[['upi', `UPI${acct.upi ? ` (${acct.upi})` : ''}`], ['bank', `Bank${acct.bankNumber ? ` (${acct.bankNumber.slice(-4)})` : ''}`]] as const} />
        <View style={{ marginTop: 10 }}>
          <Btn title={busy === 'wd' ? 'Requesting…' : 'Request withdrawal'} disabled={busy === 'wd' || w.balance < w.minWithdraw || !Number(amount)}
            onPress={() => run('wd', async () => { await requestWithdraw(Number(amount), method); setAmount(''); }, 'Withdrawal requested. The autozo team will verify and pay it.')} />
        </View>
      </Card>

      <Section title="Payout account" />
      <Card>
        <Input label="UPI id" value={acct.upi} onChangeText={(v) => setAcct({ ...acct, upi: v })} placeholder="name@bank" />
        <Text style={[st.muted, { marginTop: 8 }]}>…or a bank account:</Text>
        <Input label="Account holder name" value={acct.bankHolder} onChangeText={(v) => setAcct({ ...acct, bankHolder: v })} />
        <Input label="Account number" value={acct.bankNumber} onChangeText={(v) => setAcct({ ...acct, bankNumber: v })} keyboardType="numeric" />
        <Input label="IFSC" value={acct.bankIfsc} onChangeText={(v) => setAcct({ ...acct, bankIfsc: v.toUpperCase() })} />
        <View style={{ marginTop: 10 }}>
          <Btn title={busy === 'acct' ? 'Saving…' : 'Save account'} tone="outline" disabled={busy === 'acct'}
            onPress={() => run('acct', () => saveWalletAccount({ upi: acct.upi || undefined, bankHolder: acct.bankHolder || undefined, bankNumber: acct.bankNumber || undefined, bankIfsc: acct.bankIfsc || undefined }), 'Payout account saved.')} />
        </View>
      </Card>

      <Section title="Passbook" />
      <Card>
        {rows.length === 0 ? <Text style={st.muted}>No entries yet. They appear when you complete bookings.</Text> : rows.map((t) => (
          <View key={t._id} style={st.txn}>
            <View style={{ flex: 1 }}>
              <Text style={st.txnTitle}>{ENTRY[t.kind]}{t.kind === 'commission_paid' && t.method ? ` · ${t.method}` : ''}</Text>
              <Text style={st.muted} numberOfLines={2}>{t.note || ''}{t.reference ? ` · ref ${t.reference}` : ''} · {when(t.createdAt)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[st.txnAmt, t.kind === 'commission' && { color: colors.danger }]}>{sign(t)}{money(t.amount)}</Text>
              <Pill text={t.status} tone={t.status === 'rejected' ? 'danger' : t.status === 'pending' ? 'warn' : 'success'} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
    <OnlinePay
      order={paying}
      kind="dues"
      onPaid={() => { setPaying(null); setNote('Payment received. Your commission is cleared.'); void load(); }}
      onClose={() => { setPaying(null); void syncDuesPayments().catch(() => undefined).then(() => load()); }}
    />
    </>
  );
}

const st = StyleSheet.create({
  banner: { padding: 14, borderRadius: radius.md, marginBottom: 12 },
  hint: { color: colors.muted, fontSize: 12.5, marginBottom: 10 },
  ok: { padding: 12, borderRadius: radius.md, backgroundColor: '#E7F7EE', marginBottom: 10 },
  okText: { color: '#1A7F43', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  muted: { color: colors.muted, fontSize: 12.5 },
  big: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  txn: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  txnTitle: { color: colors.text, fontWeight: '700' },
  txnAmt: { color: colors.text, fontWeight: '800' },
});
