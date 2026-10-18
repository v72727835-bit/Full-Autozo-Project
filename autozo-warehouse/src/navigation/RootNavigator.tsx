import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CrossFade, FadeSlide, Pulse } from '../components/anim';

const LOGO = require('../assets/logo-mark.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AccountScreen, CategoriesScreen, CustomersScreen, RidersScreen, StoreScreen } from '../screens/MoreScreens';
import DashboardScreen from '../screens/DashboardScreen';
import InventoryScreen from '../screens/InventoryScreen';
import LoginScreen from '../screens/LoginScreen';
import OrdersScreen from '../screens/OrdersScreen';
import ProductsScreen from '../screens/ProductsScreen';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tab = 'dashboard' | 'orders' | 'products' | 'inventory' | 'more';
type MoreKey = 'riders' | 'customers' | 'categories' | 'store' | 'account';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Home', icon: 'grid-outline' },
  { key: 'orders', label: 'Orders', icon: 'receipt-outline' },
  { key: 'products', label: 'Products', icon: 'cube-outline' },
  { key: 'inventory', label: 'Stock', icon: 'alert-circle-outline' },
  { key: 'more', label: 'More', icon: 'menu-outline' },
];
const MORE: { key: MoreKey; label: string; icon: IconName }[] = [
  { key: 'riders', label: 'Riders', icon: 'bicycle-outline' },
  { key: 'customers', label: 'Customers', icon: 'people-outline' },
  { key: 'categories', label: 'Categories', icon: 'layers-outline' },
  { key: 'store', label: 'Store settings', icon: 'storefront-outline' },
  { key: 'account', label: 'My account', icon: 'shield-checkmark-outline' },
];

function Shell() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [more, setMore] = useState<MoreKey | null>(null);
  const [newOrders, setNewOrders] = useState(0);
  const { me } = useAuth();

  let body: React.ReactNode;
  if (tab === 'dashboard') body = <DashboardScreen />;
  else if (tab === 'orders') body = <OrdersScreen onChanged={setNewOrders} />;
  else if (tab === 'products') body = <ProductsScreen />;
  else if (tab === 'inventory') body = <InventoryScreen />;
  else if (more === 'riders') body = <RidersScreen />;
  else if (more === 'customers') body = <CustomersScreen />;
  else if (more === 'categories') body = <CategoriesScreen />;
  else if (more === 'store') body = <StoreScreen />;
  else if (more === 'account') body = <AccountScreen />;
  else body = (
    <View style={{ padding: 16 }}>
      <Text style={styles.hello}>{(me?.user.sellerWarehouses ?? []).map((w) => w.name).join(', ') || 'Warehouse'}</Text>
      <Text style={styles.sub}>{me?.user.name} · {me?.user.phone}</Text>
      {MORE.map((m) => (
        <Pressable key={m.key} style={styles.item} onPress={() => setMore(m.key)}>
          <Ionicons name={m.icon} size={22} color={colors.primary} />
          <Text style={styles.itemText}>{m.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {tab === 'more' && more ? (
        <Pressable onPress={() => setMore(null)} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700' }}>More</Text></Pressable>
      ) : null}
      <CrossFade dep={`${tab}:${more ?? ''}`} style={{ flex: 1 }}>{body}</CrossFade>
      <SafeAreaView edges={['bottom']} style={styles.bar}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => { setTab(t.key); if (t.key === 'more') setMore(null); }}>
              <View>
                <Ionicons name={t.icon} size={23} color={on ? colors.primary : colors.muted} />
                {t.key === 'orders' && newOrders > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{newOrders}</Text></View> : null}
              </View>
              <Text style={[styles.tabText, on && { color: colors.primary }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function RootNavigator() {
  const { me, initializing } = useAuth();
  if (initializing) return (
    <View style={styles.splash}>
      <FadeSlide><Pulse style={styles.splashLogo}><Image source={LOGO} style={styles.splashLogoImg} /></Pulse></FadeSlide>
      <FadeSlide delay={120}><Text style={styles.brand}>Autozo Warehouse</Text></FadeSlide>
      <FadeSlide delay={220}><Text style={styles.splashTag}>Run your store, your way</Text></FadeSlide>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 22 }} />
    </View>
  );
  return me ? <Shell /> : <LoginScreen />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  splashLogo: { width: 92, height: 92, borderRadius: 26, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  splashLogoImg: { width: 62, height: 62, borderRadius: 16 },
  splashTag: { color: colors.muted, fontSize: 13.5, marginTop: 6 },
  brand: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center' },
  bar: { flexDirection: 'row', backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  hello: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, marginBottom: 16, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 16, borderRadius: 14, marginBottom: 10 },
  itemText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  back: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
});
