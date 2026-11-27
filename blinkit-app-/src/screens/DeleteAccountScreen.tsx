import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessage } from '../api/client';
import { deleteAccount } from '../api/user';
import { useAuth } from '../context/AuthContext';
import { colors, gutter, ms, radius, space, themed } from '../theme';
import { AppHeader } from '../ui/AppHeader';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Screen } from '../ui/Screen';
import { Txt } from '../ui/Text';
import { TextField } from '../ui/TextField';

/** Lets the customer permanently delete their account (required by Google Play). */
export function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      await signOut();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const submit = () => {
    if (!password) {
      setError('Enter your password to confirm');
      return;
    }
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Keep my account', style: 'cancel' },
      { text: 'Delete forever', style: 'destructive', onPress: () => void run() },
    ]);
  };

  return (
    <Screen background="surface">
      <AppHeader title="Delete account" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Ionicons name="warning-outline" size={ms(22)} color={colors.danger} />
            <Txt variant="body" tone="muted" style={styles.introText}>
              Your name, phone, email, saved addresses, saved items and cart are erased and you are signed out everywhere.
              Past orders and invoices are kept without your personal details because the law requires us to keep tax records.
              You cannot delete while an order or booking is in progress.
            </Txt>
          </View>
          {error ? <Banner tone="danger" message={error} style={styles.banner} /> : null}
          <TextField
            label="Password"
            placeholder="Your password"
            icon="lock-closed-outline"
            secure
            autoComplete="current-password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={styles.bar}>
          <View style={styles.barInner}>
            <Button label="Delete my account" loading={busy} onPress={submit} size="lg" />
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = themed(({ c }) => ({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingTop: space.xl, paddingBottom: ms(110) },
  intro: { flexDirection: 'row', alignItems: 'flex-start', padding: space.lg, marginBottom: space.xl, borderRadius: radius.lg, backgroundColor: c.brandSurface },
  introText: { flex: 1, marginLeft: space.md },
  banner: { marginBottom: space.lg },
  bar: { backgroundColor: c.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  barInner: { paddingHorizontal: gutter, paddingVertical: space.md },
}));
