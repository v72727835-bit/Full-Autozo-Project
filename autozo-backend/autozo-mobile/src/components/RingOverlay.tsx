import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { acceptRiderOrder, declineRing, fetchRing } from '../api/rider';
import { useAuth } from '../context/AuthContext';
import { RingItem } from '../types';
import { colors, radius, spacing } from '../theme';

const POLL_MS = 5000;
// Repeating buzz: wait 0, buzz 700ms, pause 700ms … looped by Vibration.
const PATTERN = [0, 700, 700];

/**
 * The persistent delivery bell. While any order is ringing this rider, a
 * full-screen card buzzes and stays up until the rider accepts one or dismisses
 * it. Accepting takes the order; dismissing lets the other nearby riders keep
 * ringing. Backs off when the app is in the background.
 */
export default function RingOverlay() {
  const { user } = useAuth();
  const [ring, setRing] = useState<RingItem[]>([]);
  const [busy, setBusy] = useState('');
  const active = useRef(true);

  const poll = async () => {
    try {
      const items = await fetchRing();
      if (active.current) setRing(items);
    } catch {
      /* ignore transient errors; next tick retries */
    }
  };

  useEffect(() => {
    active.current = true;
    if (user?.role !== 'rider') return;
    poll();
    let timer: ReturnType<typeof setInterval> | null = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        poll();
        if (!timer) timer = setInterval(poll, POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      active.current = false;
      if (timer) clearInterval(timer);
      sub.remove();
      Vibration.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // Buzz while something is ringing; stop the moment it clears.
  useEffect(() => {
    if (ring.length > 0) Vibration.vibrate(PATTERN, true);
    else Vibration.cancel();
    return () => Vibration.cancel();
  }, [ring.length]);

  if (user?.role !== 'rider' || ring.length === 0) return null;

  const accept = async (r: RingItem) => {
    if (!r.orderId) return;
    setBusy(r.dispatchId);
    try {
      await acceptRiderOrder(r.orderId);
      Vibration.cancel();
      setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
    } catch {
      poll();
    } finally {
      setBusy('');
    }
  };

  const dismiss = async (r: RingItem) => {
    setRing((cur) => cur.filter((x) => x.dispatchId !== r.dispatchId));
    try {
      await declineRing(r.dispatchId);
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.bell}>🔔</Text>
          <Text style={styles.title}>
            New delivery{ring.length > 1 ? `s (${ring.length})` : ''}!
          </Text>
          <Text style={styles.sub}>A packed order is waiting for pickup. Accept it before another rider does.</Text>
          {ring.map((r) => (
            <View key={r.dispatchId} style={styles.row}>
              <Pressable style={[styles.btn, styles.accept]} disabled={busy === r.dispatchId} onPress={() => accept(r)}>
                {busy === r.dispatchId ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptText}>Accept delivery</Text>}
              </Pressable>
              <Pressable style={[styles.btn, styles.dismiss]} onPress={() => dismiss(r)}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 400, alignItems: 'center' },
  bell: { fontSize: 46 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginBottom: spacing.sm },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: colors.primary },
  acceptText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dismiss: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, flex: 0, paddingHorizontal: 18 },
  dismissText: { color: colors.muted, fontWeight: '700' },
});
