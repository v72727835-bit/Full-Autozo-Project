import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, PermissionsAndroid, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { cancelRiderOrder, deliverRiderOrder, fetchRiderOrders, fetchRiderProfile, acceptRiderOrder, sendRiderLocation } from '../api/rider';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorBanner } from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { RiderOrder, RiderProfile } from '../types';
import { colors, radius, shadow } from '../theme';

const LOGO = require('../assets/logo-mark.png');

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const statusLabel: Record<RiderOrder['status'], string> = { ready_for_pickup: 'Ready for pickup', out_for_delivery: 'On the way', delivered: 'Delivered' };

export default function RiderDashboardScreen() {
  const { user, signOut } = useAuth();
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [tab, setTab] = useState<'available' | 'active' | 'history'>('available');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<RiderOrder | null>(null);
  const [otp, setOtp] = useState('');
  const [riderLocation, setRiderLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const [newCount, setNewCount] = useState(0);
  const seenIds = useRef<Set<string> | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [bellOpen, setBellOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const list = await fetchRiderOrders();
      // Buzz when an order becomes ready for pickup that we have not seen before.
      const ready = list.filter((o) => o.status === 'ready_for_pickup').map((o) => o._id);
      if (seenIds.current) {
        const fresh = ready.filter((id) => !seenIds.current!.has(id));
        if (fresh.length) { Vibration.vibrate([0, 400, 200, 400]); setNewCount(fresh.length); }
      }
      seenIds.current = new Set(ready);
      setOrders(list); setError('');
    }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  // Every 10 s so a new pickup reaches the rider quickly.
  useEffect(() => { load(); const timer = setInterval(() => load(true), 10000); return () => clearInterval(timer); }, [load]);

  // Cash in hand, the counts and the bell messages, refreshed alongside.
  const loadProfile = useCallback(async () => {
    try { setProfile(await fetchRiderProfile()); } catch { /* keep the last figures */ }
  }, []);
  useEffect(() => { void loadProfile(); const timer = setInterval(loadProfile, 30000); return () => clearInterval(timer); }, [loadProfile]);

  const visible = useMemo(() => orders.filter((o) => tab === 'available' ? o.status === 'ready_for_pickup' : tab === 'active' ? o.status === 'out_for_delivery' : o.status === 'delivered'), [orders, tab]);  const activeOrder = orders.find((order) => order.status === 'out_for_delivery');
  const carrying = !!activeOrder;
  useEffect(() => {
    if (tab !== 'active' && !carrying) return;
    let watchId: number | null = null;
    let cancelled = false;
    const startLocation = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }
      Geolocation.getCurrentPosition((position) => {
        if (!cancelled) setRiderLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      }, () => undefined, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
      watchId = Geolocation.watchPosition((position) => {
        if (!cancelled) setRiderLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      }, () => undefined, { enableHighAccuracy: true, distanceFilter: 25, interval: 10000, fastestInterval: 5000 });
    };
    void startLocation();
    return () => { cancelled = true; if (watchId !== null) Geolocation.clearWatch(watchId); };
  }, [tab, carrying]);

  // Share the position with the customer while carrying a parcel, at most every 10 s.
  const lastSent = useRef(0);
  useEffect(() => {
    if (!carrying || !riderLocation) return;
    const now = Date.now();
    if (now - lastSent.current < 10000) return;
    lastSent.current = now;
    sendRiderLocation(riderLocation.latitude, riderLocation.longitude).catch(() => undefined);
  }, [carrying, riderLocation]);
  const notices = profile?.notices ?? [];
  const accept = async (order: RiderOrder) => { setSaving(order._id); try { const updated = await acceptRiderOrder(order._id); setOrders((items) => [updated, ...items.filter((item) => item._id !== order._id)]); setTab('active'); } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(null); } };
  const cancel = async (order: RiderOrder) => {
    setSaving(order._id);
    try { await cancelRiderOrder(order._id); await load(true); await loadProfile(); setTab('available'); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setSaving(null); }
  };
  const deliver = async () => { if (!delivery || otp.length !== 4) return; setSaving(delivery._id); try { const updated = await deliverRiderOrder(delivery._id, otp); setOrders((items) => [updated, ...items.filter((item) => item._id !== delivery._id)]); setDelivery(null); setOtp(''); setTab('history'); setError(''); void loadProfile(); } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(null); } };

  return <View style={styles.safe}>
    <View style={styles.header}>
      <View style={styles.brandRow}><Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors /><View><Text style={styles.brand}>Bingoor Rider</Text><Text style={styles.sub}>{user?.warehouse?.name ?? 'Delivery partner'}</Text></View></View>
      <View style={styles.headerActions}>
        <Pressable onPress={() => setBellOpen(true)} style={styles.iconBtn} accessibilityLabel={notices.length ? `${notices.length} notifications` : 'Notifications'}>
          <Ionicons name="notifications-outline" size={21} color={colors.text} />
          {notices.length > 0 ? <View style={styles.bellDot}><Text style={styles.bellDotText}>{notices.length}</Text></View> : null}
        </Pressable>
        <Pressable onPress={() => void signOut()} style={styles.iconBtn} accessibilityLabel="Log out"><Ionicons name="log-out-outline" size={21} color={colors.text} /></Pressable>
      </View>
    </View>
    {/* Cash in hand is the number a rider is accountable for, so it leads. */}
    <View style={styles.hero}>
      <View style={{ flex: 1 }}>
        <Text style={styles.heroEyebrow}>CASH TO SUBMIT</Text>
        <Text style={styles.heroTitle}>{money(profile?.codPending ?? 0)}</Text>
        <Text style={styles.heroText}>Collected in total {money(profile?.codCollected ?? 0)}{profile?.codLimit ? ` · hand in before ${money(profile.codLimit)}` : ''}</Text>
      </View>
      <Ionicons name="cash-outline" size={44} color="#fff" />
    </View>
    {profile?.paused ? <View style={styles.pausedBar}><Ionicons name="pause-circle" size={18} color="#fff" /><Text style={styles.newBannerText}>Your delivery service is stopped. Submit the cash to clear it.</Text></View> : null}
    <View style={styles.stats}><Stat value={String(orders.filter((o) => o.status === 'ready_for_pickup').length)} label="Available" /><Stat value={String(orders.filter((o) => o.status === 'out_for_delivery').length)} label="Active" /><Stat value={String(profile?.deliveredCount ?? orders.filter((o) => o.status === 'delivered').length)} label="Delivered" /><Stat value={String(profile?.cancelledCount ?? 0)} label="Cancelled" last /></View>
    <View style={styles.tabs}>{(['available', 'active', 'history'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'available' ? 'New orders' : value === 'active' ? 'My deliveries' : 'History'}</Text></Pressable>)}</View>
    {newCount > 0 ? <Pressable onPress={() => { setTab('available'); setNewCount(0); }} style={styles.newBanner} accessibilityRole="button"><Ionicons name="notifications" size={18} color="#fff" /><Text style={styles.newBannerText}>{newCount} new order{newCount > 1 ? 's' : ''} ready for pickup</Text></Pressable> : null}
    {error ? <ErrorBanner message={error} /> : null}
    {tab === 'active' && activeOrder ? <DeliveryMap order={activeOrder} riderLocation={riderLocation} /> : null}
    {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 42 }} /> : <FlatList data={visible} keyExtractor={(item) => item._id} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />} contentContainerStyle={visible.length ? styles.list : styles.emptyList} ListEmptyComponent={<View style={styles.empty}><Ionicons name={tab === 'history' ? 'checkmark-done-circle-outline' : 'bicycle-outline'} size={50} color={colors.primary} /><Text style={styles.emptyTitle}>{tab === 'available' ? 'No new orders' : tab === 'active' ? 'No active deliveries' : 'No delivery history'}</Text><Text style={styles.emptyText}>New updates will appear here automatically.</Text></View>} renderItem={({ item }) => <OrderCard order={item} saving={saving === item._id} riderLocation={riderLocation} onAccept={() => accept(item)} onDeliver={() => { setDelivery(item); setOtp(''); }} onCancel={() => void cancel(item)} />} />}
    <Modal visible={bellOpen} transparent animationType="slide" onRequestClose={() => setBellOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setBellOpen(false)}>
        <Pressable style={styles.modal} onPress={() => undefined}>
          <Text style={styles.modalTitle}>Notifications</Text>
          {notices.length === 0 ? <Text style={styles.modalSub}>Nothing to action right now. Keep riding.</Text> : notices.map((n) => (
            <View key={n} style={styles.notice}><Ionicons name="alert-circle" size={19} color={colors.primaryDark} /><Text style={styles.noticeText}>{n}</Text></View>
          ))}
          <Button title="Close" variant="outline" onPress={() => setBellOpen(false)} style={{ marginTop: 14 }} />
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={!!delivery} transparent animationType="slide" onRequestClose={() => setDelivery(null)}><View style={styles.modalBackdrop}><View style={styles.modal}><Text style={styles.modalTitle}>Confirm delivery</Text><Text style={styles.modalSub}>Ask the customer for the 4-digit OTP before handing over the order.</Text><TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" maxLength={4} placeholder="••••" placeholderTextColor="#94A3B8" style={styles.otp} autoFocus /><Button title="Mark as delivered" onPress={() => void deliver()} loading={saving === delivery?._id} disabled={otp.length !== 4} /><Button title="Cancel" variant="outline" onPress={() => setDelivery(null)} style={{ marginTop: 10 }} /></View></View></Modal>
  </View>;
}

function DeliveryMap({ order, riderLocation }: { order: RiderOrder; riderLocation: { latitude: number; longitude: number } | null }) {
  const destination = order.address.location ? { latitude: order.address.location.lat, longitude: order.address.location.lng } : null;
  if (!destination) return <View style={styles.mapUnavailable}><Ionicons name="map-outline" size={20} color={colors.primary} /><Text style={styles.mapUnavailableText}>Customer location is not available for this order.</Text></View>;
  const rider = riderLocation ?? { latitude: destination.latitude + 0.004, longitude: destination.longitude + 0.004 };
  return <View style={styles.mapWrap}>
    <MapView style={styles.map} initialRegion={{ ...destination, latitudeDelta: 0.025, longitudeDelta: 0.025 }} showsUserLocation={!!riderLocation} showsMyLocationButton={false} loadingEnabled rotateEnabled={false}>
      <Marker coordinate={rider} title="You" anchor={{ x: 0.5, y: 0.5 }}><View style={styles.riderMarker}><Ionicons name="bicycle" size={20} color="#fff" /></View></Marker>
      <Marker coordinate={destination} title={order.address.name}><View style={styles.customerMarker}><Ionicons name="location" size={25} color="#DC2626" /></View></Marker>
      <Polyline coordinates={[rider, destination]} strokeColor={colors.primary} strokeWidth={4} lineDashPattern={[8, 6]} />
    </MapView>
    <View style={styles.mapCaption}><Ionicons name="navigate" size={16} color={colors.primary} /><Text style={styles.mapCaptionText}>Live delivery route</Text><Text style={styles.mapCaptionAddress}>{order.address.city}</Text></View>
  </View>;
}
function Stat({ value, label, last }: { value: string; label: string; last?: boolean }) { return <View style={[styles.stat, last && styles.statLast]}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

/** Straight-line kilometres between two pins - close enough to judge a run. */
function kmBetween(a: { latitude: number; longitude: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.latitude);
  const dLng = toRad(b.lng - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
function OrderCard({ order, saving, riderLocation, onAccept, onDeliver, onCancel }: { order: RiderOrder; saving: boolean; riderLocation: { latitude: number; longitude: number } | null; onAccept: () => void; onDeliver: () => void; onCancel: () => void }) {
  // The distance is not shown before the order is accepted: riders were
  // cherry-picking the short runs and leaving the far ones for nobody.
  const accepted = order.status !== 'ready_for_pickup';
  const km = accepted && riderLocation && order.address.location ? kmBetween(riderLocation, order.address.location) : null;

  const slotText = order.deliveryDays ? `${order.deliveryDays} day${order.deliveryDays > 1 ? 's' : ''} delivery` : order.slot === 'twoHour' ? 'Within 2 hours' : order.slot === 'nextDay' ? 'Next day delivery' : 'Deliver in 19 minutes';
  const placed = new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return <View style={[styles.card, order.redOrder ? styles.redCard : null]}>
    <View style={styles.cardTop}><Text style={styles.orderNo}>#{order.orderNumber}</Text><View style={[styles.badge, order.status === 'delivered' ? styles.greenBadge : order.status === 'out_for_delivery' ? styles.blueBadge : styles.orangeBadge]}><Text style={styles.badgeText}>{statusLabel[order.status]}</Text></View></View>
    <View style={styles.customer}><Ionicons name="person-circle-outline" size={30} color={colors.primary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={styles.customerName}>{order.user?.name ?? order.address.name}</Text><Text style={styles.muted}>{order.user?.phone ?? order.address.phone}</Text></View><Text style={styles.total}>{money(order.total)}</Text></View>
    <View style={styles.route}><Ionicons name="storefront-outline" size={17} color={colors.primary} /><Text style={styles.routeText}>{order.shop?.name ?? 'Warehouse'}  →  {order.address.city}</Text></View>
    <Text style={styles.address}>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}, {order.address.pincode}</Text>
    <Text style={[styles.slotText, order.redOrder ? styles.redText : null]}>{order.redOrder ? 'LONG RUN · ' : order.longDistance ? 'LONG DISTANCE · ' : ''}{slotText} · placed {placed}</Text>
    <Text style={styles.items}>{order.items.length} item{order.items.length === 1 ? '' : 's'} · {order.paymentMethod === 'cod' ? `Collect ${money(order.total)} in cash` : 'Paid online'}{km !== null ? ` · ${km.toFixed(1)} km away` : ''}</Text>
    {order.status === 'ready_for_pickup' ? <Button title={saving ? 'Accepting...' : 'Accept order'} onPress={onAccept} loading={saving} style={{ marginTop: 14 }} />
      : order.status === 'out_for_delivery' ? <><Button title="Complete delivery" onPress={onDeliver} disabled={saving} style={{ marginTop: 14 }} /><Button title="Cancel this order" variant="outline" onPress={onCancel} disabled={saving} style={{ marginTop: 10 }} /></>
      : null}
  </View>;
}

const styles = StyleSheet.create({ redCard: { borderWidth: 2, borderColor: '#DC2626', backgroundColor: '#FEF2F2' }, slotText: { color: colors.primaryDark, fontWeight: '800', fontSize: 12.5, marginTop: 10 }, redText: { color: '#B91C1C' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, bellDot: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }, bellDotText: { color: '#fff', fontSize: 9.5, fontWeight: '800' }, pausedBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: '#B91C1C' }, statLast: { borderRightWidth: 0 }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: radius.md, backgroundColor: colors.primarySoft, marginBottom: 9 }, noticeText: { flex: 1, color: colors.primaryDark, fontSize: 13.5, lineHeight: 19, fontWeight: '700' }, newBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.primary }, newBannerText: { color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 8 }, mapWrap: { marginHorizontal: 16, marginBottom: 8, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.card, ...shadow }, map: { height: 210, width: '100%' }, riderMarker: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', ...shadow }, customerMarker: { alignItems: 'center', justifyContent: 'center' }, mapCaption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.card }, mapCaptionText: { color: colors.text, fontWeight: '800', fontSize: 12.5, marginLeft: 6 }, mapCaptionAddress: { color: colors.muted, fontSize: 12, marginLeft: 'auto' }, mapUnavailable: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft }, mapUnavailableText: { flex: 1, color: colors.primaryDark, fontSize: 12.5, marginLeft: 8 }, safe: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }, brandRow: { flexDirection: 'row', alignItems: 'center' }, logo: { width: 43, height: 43, borderRadius: 14, marginRight: 10 }, brand: { fontSize: 19, fontWeight: '800', color: colors.text }, sub: { color: colors.muted, fontSize: 12.5, marginTop: 2 }, iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', ...shadow }, hero: { marginHorizontal: 16, marginTop: 6, padding: 18, flexDirection: 'row', alignItems: 'center', borderRadius: radius.xl, backgroundColor: colors.primary }, heroEyebrow: { color: '#FFEDD5', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 5 }, heroText: { color: '#FFF7ED', fontSize: 13, lineHeight: 18, marginTop: 5, paddingRight: 8 }, stats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 13, ...shadow }, stat: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border }, statValue: { fontSize: 21, fontWeight: '800', color: colors.text }, statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 }, tabs: { flexDirection: 'row', margin: 16, marginBottom: 8, backgroundColor: colors.card, borderRadius: radius.md, padding: 4, ...shadow }, tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 }, tabActive: { backgroundColor: colors.primary }, tabText: { fontSize: 13, fontWeight: '700', color: colors.muted }, tabTextActive: { color: '#fff' }, list: { paddingHorizontal: 16, paddingBottom: 28 }, emptyList: { flexGrow: 1, padding: 20 }, empty: { alignItems: 'center', justifyContent: 'center', marginTop: 55 }, emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12 }, emptyText: { color: colors.muted, textAlign: 'center', marginTop: 6 }, card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 12, ...shadow }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, orderNo: { fontSize: 14, fontWeight: '800', color: colors.text }, badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }, orangeBadge: { backgroundColor: colors.primarySoft }, blueBadge: { backgroundColor: '#E0F2FE' }, greenBadge: { backgroundColor: colors.successSoft }, badgeText: { fontSize: 11.5, fontWeight: '800', color: colors.primaryDark }, customer: { flexDirection: 'row', alignItems: 'center', marginTop: 16 }, customerName: { color: colors.text, fontWeight: '800', fontSize: 15 }, muted: { color: colors.muted, fontSize: 12.5, marginTop: 2 }, total: { color: colors.text, fontWeight: '800', fontSize: 17 }, route: { flexDirection: 'row', alignItems: 'center', marginTop: 14 }, routeText: { color: colors.text, fontWeight: '700', marginLeft: 7, flex: 1 }, address: { color: colors.muted, marginTop: 7, lineHeight: 19 }, items: { color: colors.muted, fontSize: 12.5, marginTop: 10 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }, modal: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 30 }, modalTitle: { fontSize: 21, fontWeight: '800', color: colors.text }, modalSub: { color: colors.muted, lineHeight: 20, marginTop: 6, marginBottom: 18 }, otp: { height: 58, borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, textAlign: 'center', fontSize: 27, letterSpacing: 10, color: colors.text, marginBottom: 15 }
});