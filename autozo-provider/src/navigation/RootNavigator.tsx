import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CrossFade, FadeSlide, Pulse } from '../components/anim';

const LOGO = require('../assets/logo-mark.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import RingOverlay from '../components/RingOverlay';
import DashboardScreen from '../screens/DashboardScreen';
import BookingsScreen from '../screens/BookingsScreen';
import ServicesScreen from '../screens/ServicesScreen';
import AccountScreen from '../screens/AccountScreen';
import WalletScreen from '../screens/WalletScreen';
import PlanScreen, { planLocked } from '../screens/PlanScreen';
import { fetchMyPlan, MyPlan } from '../api/provider';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import { accents, colors, softShadow } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tab = 'dashboard' | 'bookings' | 'services' | 'wallet' | 'plan' | 'account';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Home', icon: 'grid-outline' },
  { key: 'bookings', label: 'Bookings', icon: 'receipt-outline' },
  { key: 'services', label: 'Services', icon: 'construct-outline' },
  { key: 'wallet', label: 'Wallet', icon: 'wallet-outline' },
  { key: 'plan', label: 'Plan', icon: 'card-outline' },
  { key: 'account', label: 'Account', icon: 'shield-checkmark-outline' },
];

function Shell() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { me } = useAuth();
  const [plan, setPlan] = useState<MyPlan | null>(null);

  // The plan is read on start and whenever the app comes back (e.g. from the payment page).
  const loadPlan = useCallback(async () => {
    try { setPlan(await fetchMyPlan()); } catch { /* keep the last known plan */ }
  }, []);
  useEffect(() => {
    loadPlan();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') loadPlan(); });
    return () => sub.remove();
  }, [loadPlan]);
  const locked = planLocked(plan);

  let body: React.ReactNode;
  if (tab === 'dashboard') body = <DashboardScreen />;
  else if (tab === 'bookings') body = <BookingsScreen />;
  else if (tab === 'services') body = <ServicesScreen />;
  else if (tab === 'wallet') body = <WalletScreen />;
  else if (tab === 'plan') body = <PlanScreen plan={plan} onReload={loadPlan} />;
  else body = <AccountScreen />;

  const firm = me?.providerApplication?.firm || 'My services';
  const sectionTitle = TABS.find((t) => t.key === tab)?.label ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={styles.appbar}>
        <View style={styles.brandMark}><Image source={LOGO} style={{ width: 26, height: 26, borderRadius: 8 }} /></View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.appbarTitle} numberOfLines={1}>{sectionTitle}</Text>
          <Text style={styles.appbarSub} numberOfLines={1}>{firm}</Text>
        </View>
        <View style={styles.brandMark} />
      </View>

      {locked && tab !== 'plan' ? (
        <Pressable style={styles.planBar} onPress={() => setTab('plan')}>
          <Text style={styles.planBarText}>Your plan is not active. Buy a plan to add services and get bookings.</Text>
          <Text style={styles.planBarCta}>Buy plan</Text>
        </Pressable>
      ) : null}

      <CrossFade dep={tab} style={{ flex: 1 }}>{body}</CrossFade>

      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <View style={[styles.tabIcon, on && { backgroundColor: accents.orange.soft }]}>
                <Ionicons name={t.icon} size={22} color={on ? colors.primary : colors.muted} />
              </View>
              <Text style={[styles.tabText, on && { color: colors.primary, fontWeight: '800' }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </SafeAreaView>

      {/* Persistent booking bell, on top of everything while signed in. */}
      <RingOverlay onAccepted={() => setTab('bookings')} />
    </SafeAreaView>
  );
}

export default function RootNavigator() {
  const { me, initializing } = useAuth();
  if (initializing) return (
    <View style={styles.splash}>
      <FadeSlide><Pulse style={styles.splashLogo}><Image source={LOGO} style={styles.splashLogoImg} /></Pulse></FadeSlide>
      <FadeSlide delay={120}><Text style={styles.brand}>autozo Provider</Text></FadeSlide>
      <FadeSlide delay={220}><Text style={styles.splashTag}>Your services, your bookings</Text></FadeSlide>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 22 }} />
    </View>
  );
  return me ? <Shell /> : <AuthGate />;
}

/** Signed-out: toggle between the sign-in and the provider registration screen. */
function AuthGate() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return mode === 'register'
    ? <RegisterScreen onBack={() => setMode('login')} />
    : <LoginScreen onRegister={() => setMode('register')} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  splashLogo: { width: 92, height: 92, borderRadius: 26, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  splashLogoImg: { width: 62, height: 62, borderRadius: 16 },
  splashTag: { color: colors.muted, fontSize: 13.5, marginTop: 6 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center' },
  appbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  brandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  appbarTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  appbarSub: { fontSize: 11.5, color: colors.muted, marginTop: 1 },
  bar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6 },
  tabIcon: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  planBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginBottom: 6, padding: 12, borderRadius: 12, backgroundColor: colors.dangerSoft },
  planBarText: { flex: 1, color: colors.danger, fontWeight: '600', fontSize: 13 },
  planBarCta: { color: colors.danger, fontWeight: '800' },
});
