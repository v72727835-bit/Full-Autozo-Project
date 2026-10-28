import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import { Btn, Card, Section } from '../ui';

export default function AccountScreen() {
  const { me, signOut } = useAuth();
  if (!me) return null;
  const app = me.providerApplication;
  const rows: [string, string][] = [
    ['Name', me.name],
    ['Phone', me.phone],
    ...(me.email ? ([['Email', me.email]] as [string, string][]) : []),
    ...(me.providerId ? ([['Provider ID', me.providerId]] as [string, string][]) : []),
    ['Status', me.providerStatus ?? '-'],
    ...(app?.firm ? ([['Business', app.firm]] as [string, string][]) : []),
    ...(app?.city ? ([['Base', `${app.city}${app.state ? `, ${app.state}` : ''}`]] as [string, string][]) : []),
  ];
  return (
    <View style={{ flex: 1, padding: 14 }}>
      <Section title="My account" />
      <Card>
        {rows.map(([k, v]) => (
          <View key={k} style={st.row}>
            <Text style={st.k}>{k}</Text>
            <Text style={st.v}>{v}</Text>
          </View>
        ))}
      </Card>
      <View style={{ marginTop: 16 }}>
        <Btn title="Log out" tone="danger" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  k: { color: colors.muted },
  v: { color: colors.text, fontWeight: '700', textTransform: 'capitalize' },
});
