import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { OtpHandle, sendOtp } from '../firebase/phoneOtp';
import { colors, gutter, ms, radius, space } from '../theme';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Txt } from '../ui/Text';
import { TextField } from '../ui/TextField';

/** Sends a Firebase SMS code to `phone`, asks for it, and hands back the verified ID token. */
export function OtpModal({ phone, onVerified, onClose }: { phone: string; onVerified: (idToken: string) => Promise<void>; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const handle = useRef<OtpHandle | null>(null);
  const started = useRef(false);

  const send = useCallback(async () => {
    setError(null);
    setSending(true);
    try {
      handle.current = await sendOtp(phone);
      setWait(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the OTP.');
    } finally {
      setSending(false);
    }
  }, [phone]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async () => {
    if (!handle.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onVerified(await handle.current.confirm(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify the code.');
    } finally {
      setBusy(false);
    }
  };

  // Sign in as soon as the 6th digit is typed (or auto-filled from the SMS).
  useEffect(() => {
    if (code.length === 6 && !sending && !busy && !error) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Txt variant="h2">Verify your phone</Txt>
          <Txt tone="muted" style={styles.lead}>
            {sending ? 'Sending a code' : 'We sent a 6-digit code'} to +91 {phone.replace(/\D/g, '').slice(-10)}.
          </Txt>
          {error ? <Banner tone="danger" message={error} /> : null}
          <TextField label="Enter the code" placeholder="••••••" value={code} onChangeText={(t) => { setError(null); setCode(t.replace(/\D/g, '').slice(0, 6)); }} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" />
          <Button label="Verify" onPress={verify} loading={busy} disabled={sending || code.length !== 6} size="lg" block />
          <View style={styles.row}>
            <Pressable disabled={sending || wait > 0} onPress={() => void send()} hitSlop={10}>
              <Txt weight="700" tone={sending || wait > 0 ? 'muted' : 'brand'}>
                {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
              </Txt>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10}>
              <Txt weight="700" tone="muted">
                Cancel
              </Txt>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: gutter },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  lead: { marginBottom: ms(4) },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
});
