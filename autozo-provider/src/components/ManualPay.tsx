import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getErrorMessage } from '../api/client';
import { colors } from '../theme';

type Purpose = 'rider_cash' | 'provider_dues' | 'subscription';
interface Info { enabled: boolean; payeeName?: string; upiId?: string; qrImage?: string; bankHolder?: string; bankName?: string; bankNumber?: string; bankIfsc?: string; note?: string }
interface Mine { _id: string; purpose: Purpose; amount: number; method: string; reference: string; status: 'pending' | 'confirmed' | 'rejected'; adminNote?: string; planName?: string; createdAt: string }

const money = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString('en-IN')}`;
const STATUS = {
  pending: { label: 'Pending', bg: '#FEF3C7', fg: '#B45309' },
  confirmed: { label: 'Successful', bg: colors.successSoft, fg: colors.success },
  rejected: { label: 'Rejected', bg: colors.dangerSoft, fg: colors.danger },
} as const;
const METHODS = [['upi', 'UPI'], ['qr', 'QR code'], ['bank', 'Bank transfer']] as const;

/**
 * "Pay manually": shows the QR / UPI id / bank details the super admin set, lets the person send the
 * transaction id after paying, and lists their payments as Pending until the office confirms the money
 * (then Successful) or rejects it. Shows nothing while the admin has not switched it on.
 */
export function ManualPay({ purpose, amount, planId, planName, onDone }: { purpose: Purpose; amount?: number; planId?: string; planName?: string; onDone?: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'upi' | 'qr' | 'bank'>('upi');
  const [ref, setRef] = useState('');
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, m] = await Promise.all([api.get('/manual-payment/info'), api.get('/manual-payment/mine')]);
      setInfo(i.data.data);
      setMine(m.data.data);
    } catch { /* the rest of the screen still works */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!info?.enabled) return null;
  const history = mine.filter((p) => p.purpose === purpose).slice(0, 3);
  const waiting = history.find((p) => p.status === 'pending');
  const fixed = purpose === 'subscription';
  const owed = fixed ? amount ?? 0 : Math.max(0, amount ?? 0);
  const pay = fixed ? owed : Number(asked) || owed;
  const canPay = !waiting && (fixed ? !!planId : owed > 0);
  if (!waiting && !canPay && !history.length && !sent) return null;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await api.post('/manual-payment', { purpose, method, reference: ref.trim(), amount: pay, ...(planId ? { planId } : {}) });
      setSent(true); setOpen(false); setRef(''); setAsked('');
      await load();
      onDone?.();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <View style={st.card}>
      <Text style={st.title}>Pay by UPI / QR / bank{planName ? ` · ${planName}` : ''}</Text>
      {waiting ? (
        <Text style={st.muted}>Your payment of {money(waiting.amount)} is waiting for the office to confirm.</Text>
      ) : canPay ? (
        <Text style={st.muted}>{fixed ? `Pay ${money(owed)}` : `Pay up to ${money(owed)}`} to the account below, then send the transaction id.</Text>
      ) : null}
      {sent && !waiting ? <Text style={st.ok}>Sent. It stays Pending until the office confirms it.</Text> : null}

      {canPay && !open ? (
        <Pressable style={st.btn} onPress={() => { setOpen(true); setSent(false); }} accessibilityRole="button"><Text style={st.btnText}>Pay manually</Text></Pressable>
      ) : null}

      {open ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          {info.qrImage ? <Image source={{ uri: info.qrImage }} style={st.qr} resizeMode="contain" /> : null}
          {info.payeeName ? <Text style={st.line}>Pay to: <Text style={st.bold}>{info.payeeName}</Text></Text> : null}
          {info.upiId ? <Text style={st.line} selectable>UPI id: <Text style={st.bold}>{info.upiId}</Text></Text> : null}
          {info.bankNumber ? (
            <Text style={st.line} selectable>
              Bank: <Text style={st.bold}>{[info.bankHolder, info.bankName].filter(Boolean).join(' · ')}</Text>{'\n'}A/c <Text style={st.bold}>{info.bankNumber}</Text>{info.bankIfsc ? <>  IFSC <Text style={st.bold}>{info.bankIfsc}</Text></> : null}
            </Text>
          ) : null}
          {info.note ? <Text style={st.muted}>{info.note}</Text> : null}
          <View style={st.chips}>
            {METHODS.map(([k, label]) => (
              <Pressable key={k} onPress={() => setMethod(k)} style={[st.chip, method === k && st.chipOn]}><Text style={[st.chipText, method === k && { color: '#fff' }]}>{label}</Text></Pressable>
            ))}
          </View>
          {fixed ? <Text style={st.line}>Amount: <Text style={st.bold}>{money(owed)}</Text></Text> : (
            <TextInput style={st.input} value={asked} onChangeText={(v) => setAsked(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder={`Amount you paid (up to ${Math.floor(owed)})`} placeholderTextColor={colors.muted} />
          )}
          <TextInput style={st.input} value={ref} onChangeText={setRef} autoCapitalize="characters" placeholder="Transaction id (UTR) after paying" placeholderTextColor={colors.muted} />
          {error ? <Text style={st.err}>{error}</Text> : null}
          <Pressable style={[st.btn, (busy || ref.trim().length < 6 || pay <= 0) && { opacity: 0.5 }]} disabled={busy || ref.trim().length < 6 || pay <= 0} onPress={submit} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>I have paid {money(pay)}</Text>}
          </Pressable>
          <Pressable onPress={() => setOpen(false)}><Text style={[st.muted, { textAlign: 'center' }]}>Cancel</Text></Pressable>
        </View>
      ) : null}

      {history.length ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {history.map((p) => (
            <View key={p._id} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.line}>{money(p.amount)} · {p.method.toUpperCase()}</Text>
                <Text style={st.muted}>{p.reference}{p.adminNote ? ` · ${p.adminNote}` : ''}</Text>
              </View>
              <View style={[st.pill, { backgroundColor: STATUS[p.status].bg }]}><Text style={[st.pillText, { color: STATUS[p.status].fg }]}>{STATUS[p.status].label}</Text></View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginVertical: 8, backgroundColor: colors.card },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  muted: { color: colors.muted, marginTop: 4, lineHeight: 19, fontSize: 13 },
  ok: { color: colors.success, marginTop: 6, fontWeight: '700' },
  line: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '800' },
  qr: { width: 190, height: 190, alignSelf: 'center', backgroundColor: '#fff', borderRadius: 10 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, backgroundColor: '#fff' },
  btn: { marginTop: 10, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  err: { color: colors.danger, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 12, fontWeight: '800' },
});
