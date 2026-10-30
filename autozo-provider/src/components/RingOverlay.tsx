import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { acceptRing, declineRing, providerRing } from '../api/provider';
import { RingItem } from '../types';
import { bell } from '../lib/bell';
import { colors, radius } from '../theme';

const POLL_MS = 5000;

/**
 * The persistent booking bell. While any booking is ringing this provider, a
 * full-screen card buzzes and stays up until they accept one or dismiss it.
 * Accepting takes the booking (stopping everyone else's ring); dismissing lets
 * the other nearby providers keep ringing.
 */
export default function RingOverlay({ onAccepted }: { onAccepted?: () => void }) {
  const [ring, setRing] = useState<RingItem[]>([]);
  const [busy, setBusy] = useState('');
  // The in-app bell only plays while the app is on screen; in the background the ring push rings instead.
  const [onScreen, setOnScreen] = useState(AppState.currentState === 'active');
  const alive = useRef(true);

  const poll = async () => {
    try { const items = await providerRing(); if (alive.current) setRing(items); } catch { /* retry next tick */ }
  };

  useEffect(() => {
    alive.current = true;
    poll();
    let timer: ReturnType<typeof setInterval> | null = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      setOnScreen(s === 'active');
      if (s === 'active') { poll(); if (!timer) timer = setInterval(poll, POLL_MS); }
      else if (timer) { clearInterval(timer); timer = null; }
    });
    return () => { alive.current = false; if (timer) clearInterval(timer); sub.remove(); bell.stop(); };
  }, []);

  // Loud bell while something is ringing and the app is on screen; stop the moment it clears.
  useEffect(() => {
    if (ring.length > 0 && onScreen) bell.start(); else bell.stop();
    return () => bell.stop();
  }, [ring.length, onScreen]);

  if (ring.length === 0) return null;

  const accept = async (r: RingItem) => {
    setBusy(r.dispatchId);
    try {
      await acceptRing(r.dispatchId);
      bell.stop();
      setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
      onAccepted?.();
    } catch { poll(); } finally { setBusy(''); }
  };
  const dismiss = async (r: RingItem) => {
    setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
    try { await declineRing(r.dispatchId); } catch { /* ignore */ }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={st.backdrop}>
        <View style={st.card}>
          <Text style={st.bell}>🔔</Text>
          <Text style={st.title}>New booking{ring.length > 1 ? `s (${ring.length})` : ''}!</Text>
          <Text style={st.sub}>A customer is waiting. Accept before another provider does.</Text>
          {ring.map((r) => (
            <View key={r.dispatchId} style={st.row}>
              <Pressable style={[st.btn, st.accept]} disabled={busy === r.dispatchId} onPress={() => accept(r)}>
                {busy === r.dispatchId ? <ActivityIndicator color="#fff" /> : <Text style={st.acceptText}>Accept</Text>}
              </Pressable>
              <Pressable style={[st.btn, st.dismiss]} onPress={() => dismiss(r)}><Text style={st.dismissText}>Dismiss</Text></Pressable>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,18,32,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 24, width: '100%', maxWidth: 400, alignItems: 'center' },
  bell: { fontSize: 46 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8, textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: colors.primary },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dismiss: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flex: 0, paddingHorizontal: 20 },
  dismissText: { color: colors.muted, fontWeight: '700' },
});
