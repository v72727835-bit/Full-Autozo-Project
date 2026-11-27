import React, { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const PRIVACY_URL = 'https://shop.autozo.org/privacy-policy';

/** Privacy / terms links and "Delete account" (required by Google Play). Deleting erases personal data; accounting records stay without it. */
export function LegalAndDelete() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await api.post('/auth/delete-account', { password });
      await signOut();
    } catch (err) {
      Alert.alert('Could not delete account', getErrorMessage(err));
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!password) {
      Alert.alert('Enter your password', 'We need your password to confirm.');
      return;
    }
    Alert.alert('Delete your account?', 'Your personal details are erased and this cannot be undone. Finish any order or booking in progress first.', [
      { text: 'Keep account', style: 'cancel' },
      { text: 'Delete forever', style: 'destructive', onPress: () => void run() },
    ]);
  };

  return (
    <View style={st.wrap}>
      <View style={st.links}>
        <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={st.link}>Privacy policy</Text></Pressable>
      </View>
      {open ? (
        <View style={st.box}>
          <Text style={st.note}>Deleting your account erases your name, phone, email and saved details and signs you out. Past orders and payment records are kept without your personal details because tax law requires it.</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Your password" placeholderTextColor={colors.muted} style={st.input} autoCapitalize="none" />
          <Pressable onPress={confirm} disabled={busy} style={[st.btn, busy && { opacity: 0.6 }]}>
            <Text style={st.btnText}>{busy ? 'Deleting…' : 'Delete my account'}</Text>
          </Pressable>
          <Pressable onPress={() => { setOpen(false); setPassword(''); }}><Text style={[st.link, { textAlign: 'center', marginTop: 10 }]}>Cancel</Text></Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setOpen(true)}><Text style={st.delete}>Delete account</Text></Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 22, marginBottom: 10 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginBottom: 14 },
  link: { color: colors.muted, textDecorationLine: 'underline', fontWeight: '600' },
  delete: { color: colors.danger, fontWeight: '700', textAlign: 'center' },
  box: { borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 14 },
  note: { color: colors.muted, lineHeight: 19, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, marginBottom: 10 },
  btn: { backgroundColor: colors.danger, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
});
