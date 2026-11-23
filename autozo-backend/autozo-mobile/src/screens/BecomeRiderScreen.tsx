import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { submitRiderApplication } from '../api/apply';
import { AuthLayout, ErrorBanner } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { TextField, TextInputRef } from '../components/TextField';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'BecomeRider'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Apply to join Autozo as a rider. Riders don't self-register a login yet — a warehouse /
 * the Autozo team creates the account — so this collects the applicant's details (the same
 * "Become a rider" flow as the website) and the team gets in touch.
 */
export default function BecomeRiderScreen({ navigation }: Props) {
  const mobileRef = useRef<TextInputRef>(null);
  const emailRef = useRef<TextInputRef>(null);
  const reasonRef = useRef<TextInputRef>(null);

  const [f, setF] = useState({ fullName: '', mobile: '', email: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const tenDigits = () => f.mobile.replace(/\D/g, '').slice(-10);

  const submit = async () => {
    setError(null);
    if (f.fullName.trim().length < 2) return setError('Enter your full name.');
    if (!/^[6-9]\d{9}$/.test(tenDigits())) return setError('Enter a valid 10-digit mobile number (it starts with 6, 7, 8 or 9).');
    if (!EMAIL.test(f.email.trim())) return setError('Enter a valid email so the team can reach you.');
    if (f.reason.trim().length < 3) return setError('Tell us a little about yourself (your area, any delivery experience).');

    setBusy(true);
    try {
      const message = await submitRiderApplication({
        fullName: f.fullName.trim(),
        mobile: tenDigits(),
        email: f.email.trim(),
        reason: f.reason.trim(),
      });
      setDone(message || 'Thank you. Our team will contact you soon.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Application received!" subtitle="Thanks for your interest in riding with autozo.">
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <Text style={styles.doneText}>{done} Once a warehouse or the autozo team sets up your rider login, come back here and sign in with the mobile number and password they give you.</Text>
        </View>
        <Button title="Back to sign in" onPress={() => navigation.goBack()} style={{ marginTop: 4 }} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Become a rider" subtitle="Leave your details and the autozo team will get in touch to set up your rider account.">
      {error ? <ErrorBanner message={error} /> : null}
      <TextField label="Full name" icon="person-outline" placeholder="e.g. Suresh Yadav" value={f.fullName} onChangeText={set('fullName')} autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => mobileRef.current?.focus()} />
      <TextField label="Mobile number" icon="call-outline" placeholder="9876543210" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" maxLength={14} inputRef={mobileRef} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} />
      <TextField label="Email" icon="mail-outline" placeholder="you@example.com" value={f.email} onChangeText={set('email')} keyboardType="email-address" inputRef={emailRef} returnKeyType="next" onSubmitEditing={() => reasonRef.current?.focus()} />
      <TextField label="About you" icon="chatbubble-ellipses-outline" placeholder="Your area, any delivery experience, your vehicle…" value={f.reason} onChangeText={set('reason')} maxLength={2000} multiline numberOfLines={3} inputRef={reasonRef} style={styles.reason} />
      <Button title="Submit application" onPress={submit} loading={busy} style={{ marginTop: 4 }} />
      <Button title="Back to sign in" variant="outline" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  reason: { height: 90, textAlignVertical: 'top', paddingTop: 10 },
  doneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  doneText: { flex: 1, fontSize: 14.5, color: colors.text, lineHeight: 21 },
});
