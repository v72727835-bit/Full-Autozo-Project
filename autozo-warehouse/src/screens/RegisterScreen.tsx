import Geolocation from '@react-native-community/geolocation';
import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { reverseGeocode } from '../api/geo';
import { registerWarehouse } from '../api/seller';
import { AuthLayout, ErrorBanner } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { TextField, TextInputRef } from '../components/TextField';
import { colors, radius } from '../theme';

/** Strip spaces, dashes and a +91 / 91 prefix, leaving the 10 local digits. */
const tenDigits = (raw: string) => raw.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, '');

interface Props {
  /** Go back to the sign-in screen. */
  onBack: () => void;
}

/** A warehouse registers itself here. The Autozo team approves it, then it signs in to add products and take orders. */
export default function RegisterScreen({ onBack }: Props) {
  const phoneRef = useRef<TextInputRef>(null);
  const passwordRef = useRef<TextInputRef>(null);
  const confirmRef = useRef<TextInputRef>(null);
  const shopRef = useRef<TextInputRef>(null);
  const line1Ref = useRef<TextInputRef>(null);
  const cityRef = useRef<TextInputRef>(null);
  const pincodeRef = useRef<TextInputRef>(null);

  const [f, setF] = useState({
    name: '', phone: '', email: '', password: '', confirm: '',
    shopName: '', line1: '', city: '', state: 'Uttar Pradesh', pincode: '', gst: '', note: '',
  });
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  const useMyLocation = async () => {
    setError(null);
    setLocating(true);
    try {
      if (Platform.OS === 'android') {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        const granted = PermissionsAndroid.RESULTS.GRANTED;
        if (res[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== granted
          && res[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] !== granted) {
          setLocating(false);
          setError('Location permission is needed so riders and customers can find your warehouse. Please allow it.');
          return;
        }
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setLocation({ lat, lng });
          // Fill the address from the pin: city, state and PIN follow it; the address line only when still empty.
          void reverseGeocode(lat, lng).then((place) => {
            if (!place.found) return;
            setF((cur) => ({
              ...cur,
              city: place.city || cur.city,
              state: place.state || cur.state,
              pincode: place.pincode || cur.pincode,
              line1: cur.line1.trim() ? cur.line1 : [place.line1, place.area].filter(Boolean).join(', ') || cur.line1,
            }));
          }).finally(() => setLocating(false));
        },
        () => { setLocating(false); setError('Could not get your location. Turn on GPS / location and try again.'); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    } catch {
      setLocating(false);
      setError('Could not get your location. Turn on GPS / location and try again.');
    }
  };

  const submit = async () => {
    setError(null);
    const phone = tenDigits(f.phone);
    if (f.name.trim().length < 2) return setError('Enter your full name.');
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number (it starts with 6, 7, 8 or 9).');
    if (f.password.length < 6) return setError('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setError('The two passwords do not match.');
    if (f.shopName.trim().length < 2) return setError('Enter your warehouse / shop name.');
    if (f.line1.trim().length < 5) return setError('Enter your shop address.');
    if (f.city.trim().length < 2) return setError('Enter your city.');
    if (f.state.trim().length < 2) return setError('Enter your state.');
    if (!/^\d{6}$/.test(f.pincode.trim())) return setError('Enter a 6-digit PIN code.');
    if (!location) return setError('Tap "Use my current location" so riders and customers can find your warehouse.');

    setBusy(true);
    try {
      const message = await registerWarehouse({
        name: f.name.trim(),
        phone,
        email: f.email.trim() || undefined,
        password: f.password,
        shopName: f.shopName.trim(),
        line1: f.line1.trim(),
        city: f.city.trim(),
        state: f.state.trim(),
        pincode: f.pincode.trim(),
        location,
        gst: f.gst.trim() || undefined,
        note: f.note.trim() || undefined,
      });
      setDone(message || 'Registration received. You can log in once the Autozo team approves it.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Registration received!" subtitle="Thanks for registering your warehouse with Autozo.">
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <Text style={styles.doneText}>{done} Once approved, sign in with your mobile number and password to add products and take orders.</Text>
        </View>
        <Button title="Back to sign in" onPress={onBack} style={{ marginTop: 4 }} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Register your warehouse" subtitle="Takes about 2 minutes. The Autozo team reviews every warehouse before it goes live.">
      {error ? <ErrorBanner message={error} /> : null}

      <Text style={styles.section}>Your details</Text>
      <TextField label="Your full name" icon="person-outline" placeholder="e.g. Mahesh Gupta" value={f.name} onChangeText={set('name')} autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
      <TextField label="Mobile number (your login)" icon="call-outline" placeholder="9876543210" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={14} inputRef={phoneRef} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
      <TextField label="Password" icon="lock-closed-outline" placeholder="At least 6 characters" value={f.password} onChangeText={set('password')} secure inputRef={passwordRef} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
      <TextField label="Confirm password" icon="lock-closed-outline" placeholder="Repeat the password" value={f.confirm} onChangeText={set('confirm')} secure inputRef={confirmRef} returnKeyType="next" onSubmitEditing={() => shopRef.current?.focus()} />

      <Text style={styles.section}>Your shop</Text>
      <TextField label="Warehouse / shop name" icon="storefront-outline" placeholder="e.g. Gupta General Store" value={f.shopName} onChangeText={set('shopName')} autoCapitalize="words" inputRef={shopRef} returnKeyType="next" onSubmitEditing={() => line1Ref.current?.focus()} />
      <TextField label="Email (optional)" icon="mail-outline" placeholder="you@example.com" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
      <TextField label="Shop address" icon="location-outline" placeholder="Building, street, area" value={f.line1} onChangeText={set('line1')} inputRef={line1Ref} returnKeyType="next" onSubmitEditing={() => cityRef.current?.focus()} />
      <TextField label="City" icon="business-outline" placeholder="City" value={f.city} onChangeText={set('city')} autoCapitalize="words" inputRef={cityRef} returnKeyType="next" onSubmitEditing={() => pincodeRef.current?.focus()} />
      <TextField label="PIN code" icon="navigate-outline" placeholder="6-digit PIN" value={f.pincode} onChangeText={(v) => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} inputRef={pincodeRef} />
      <TextField label="State" icon="map-outline" placeholder="State" value={f.state} onChangeText={set('state')} autoCapitalize="words" />

      <Text style={styles.fieldLabel}>Shop location</Text>
      <Pressable onPress={useMyLocation} style={[styles.locBtn, location && styles.locBtnOn]} disabled={locating}>
        <Ionicons name={location ? 'checkmark-circle' : 'locate-outline'} size={20} color={location ? colors.primary : colors.muted} />
        <Text style={[styles.locText, location && { color: colors.primary }]}>
          {locating ? 'Getting your location…' : location ? 'Location captured — tap to update' : 'Use my current location'}
        </Text>
      </Pressable>
      {location ? (
        <Text style={styles.coords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
      ) : (
        <Text style={styles.hint}>Stand at your shop and tap the button so riders and customers can find you.</Text>
      )}

      <Text style={styles.section}>Optional</Text>
      <TextField label="GST number" icon="document-text-outline" placeholder="22AAAAA0000A1Z5" value={f.gst} onChangeText={(v) => set('gst')(v.toUpperCase())} maxLength={20} autoCapitalize="characters" />
      <TextField label="Anything else we should know" icon="chatbubble-ellipses-outline" placeholder="e.g. what you sell" value={f.note} onChangeText={set('note')} maxLength={500} />

      <Button title="Submit for approval" onPress={submit} loading={busy} style={{ marginTop: 8 }} />

      <View style={styles.switchRow}>
        <Text style={styles.switchText}>Already have an account? </Text>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button">
          <Text style={styles.switchLink}>Sign in</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12, marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
  },
  locBtnOn: { borderColor: colors.primary },
  locText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  coords: { marginTop: 6, marginBottom: 16, fontSize: 12.5, color: colors.muted },
  hint: { marginTop: 6, marginBottom: 16, fontSize: 12.5, color: colors.muted },
  doneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  doneText: { flex: 1, fontSize: 14.5, color: colors.text, lineHeight: 21 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.primary, fontSize: 14, fontWeight: '800' },
});
