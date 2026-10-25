import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessage } from '../api/client';
import { resetPasswordRequest } from '../api/auth';
import { OtpModal } from '../components/OtpModal';
import type { AuthNav } from '../navigation/types';
import { gutter, space, themed } from '../theme';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Logo } from '../ui/Logo';
import { Txt } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { isValidPhone, normalizePhone } from '../utils/validation';

export function ForgotPasswordScreen() {
  const navigation = useNavigation<AuthNav>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [otp, setOtp] = useState(false);

  const submit = () => {
    setError(null);
    if (!isValidPhone(phone.trim())) return setError('Enter a valid 10-digit mobile number.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setOtp(true);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Logo size={44} style={styles.logo} />
          <Txt variant="h1" center style={styles.title}>
            Forgot password?
          </Txt>
          <Txt variant="bodyLg" tone="muted" center style={styles.subtitle}>
            Enter your mobile number, choose a new password and confirm it with an OTP.
          </Txt>
          {error ? <Banner tone="danger" message={error} style={styles.banner} /> : null}
          {done ? <Banner tone="success" message="Password changed. You can sign in now." style={styles.banner} /> : null}
          <TextField label="Mobile number" placeholder="9876543210" icon="call-outline" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextField label="New password" placeholder="At least 6 characters" icon="lock-closed-outline" secure value={password} onChangeText={setPassword} />
          <TextField label="Confirm new password" placeholder="Repeat the password" icon="lock-closed-outline" secure value={confirm} onChangeText={setConfirm} />
          <Button label="Send OTP" onPress={submit} size="lg" disabled={done} style={styles.submit} />
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={styles.back}>
            <Txt variant="label" tone="brand">
              Back to sign in
            </Txt>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
      {otp ? (
        <OtpModal
          phone={normalizePhone(phone.trim())}
          onClose={() => setOtp(false)}
          onVerified={async (token) => {
            try {
              await resetPasswordRequest(normalizePhone(phone.trim()), password, token);
              setOtp(false);
              setDone(true);
              setTimeout(() => navigation.goBack(), 1500);
            } catch (err) {
              setOtp(false);
              setError(getErrorMessage(err));
            }
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = themed(({ c }) => ({
  root: { flex: 1, backgroundColor: c.surface },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: space.xxl },
  logo: { alignSelf: 'center', marginTop: space.lg, marginBottom: space.xxl },
  title: { marginBottom: space.xs },
  subtitle: { marginBottom: space.xxl },
  banner: { marginBottom: space.lg },
  submit: { marginTop: space.sm },
  back: { alignSelf: 'center', marginTop: space.lg },
}));
