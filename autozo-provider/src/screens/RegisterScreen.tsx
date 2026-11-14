import Geolocation from '@react-native-community/geolocation';
import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { registerProvider, serviceCategories } from '../api/provider';
import { AuthLayout, ErrorBanner } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { TextField, TextInputRef } from '../components/TextField';
import { ServiceCategory } from '../types';
import { colors, radius } from '../theme';

/** Strip spaces, dashes and a +91 / 91 prefix, leaving the 10 local digits. */
const tenDigits = (raw: string) => raw.replace(/[\s-]/g, '').replace(/^(\+91|91)(?=\d{10}$)/, '');

interface Props {
  /** Go back to the sign-in screen. */
  onBack: () => void;
}

/** A service provider registers itself here. The Autozo team approves it, then it signs in to add services and take bookings. */
export default function RegisterScreen({ onBack }: Props) {
  const phoneRef = useRef<TextInputRef>(null);
  const passwordRef = useRef<TextInputRef>(null);
  const confirmRef = useRef<TextInputRef>(null);
  const firmRef = useRef<TextInputRef>(null);
  const line1Ref = useRef<TextInputRef>(null);
  const cityRef = useRef<TextInputRef>(null);
  const pincodeRef = useRef<TextInputRef>(null);

  const [f, setF] = useState({
    name: '', phone: '', email: '', password: '', confirm: '',
    firm: '', category: '', line1: '', city: '', state: 'Uttar Pradesh', pincode: '', about: '',
  });
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [other, setOther] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));

  useEffect(() => {
    serviceCategories().then(setCats).catch(() => undefined);
  }, []);

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
          setError('Location permission is needed so nearby customers find you. Please allow it.');
          return;
        }
      }
      Geolocation.getCurrentPosition(
        (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
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
    if (f.firm.trim().length < 2) return setError('Enter your business / shop name.');
    if (!f.category.trim()) return setError('Pick or type the kind of service you offer.');
    if (f.line1.trim().length < 3) return setError('Enter your base address.');
    if (f.city.trim().length < 2) return setError('Enter your city.');
    if (f.state.trim().length < 2) return setError('Enter your state.');
    if (!/^\d{6}$/.test(f.pincode.trim())) return setError('Enter a 6-digit PIN code.');
    if (!location) return setError('Tap "Use my current location" so nearby customers find you first.');

    setBusy(true);
    try {
      const message = await registerProvider({
        name: f.name.trim(),
        phone,
        email: f.email.trim() || undefined,
        password: f.password,
        firm: f.firm.trim(),
        category: f.category.trim() || undefined,
        line1: f.line1.trim(),
        city: f.city.trim(),
        state: f.state.trim(),
        pincode: f.pincode.trim(),
        location,
        about: f.about.trim() || undefined,
      });
      setDone(message || 'Registration received. You can log in and add services once the Autozo team approves it.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Registration received!" subtitle="Thanks for registering with Autozo Services.">
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
          <Text style={styles.doneText}>{done} Once approved, sign in with your mobile number and password to add your services, prices and timings.</Text>
        </View>
        <Button title="Back to sign in" onPress={onBack} style={{ marginTop: 4 }} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Register as a service provider" subtitle="Takes about 2 minutes. The Autozo team reviews every provider before it goes live.">
      {error ? <ErrorBanner message={error} /> : null}

      <Text style={styles.section}>Your details</Text>
      <TextField label="Full name" icon="person-outline" placeholder="e.g. Ramesh Kumar" value={f.name} onChangeText={set('name')} autoCapitalize="words" returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} />
      <TextField label="Mobile number (your login)" icon="call-outline" placeholder="9876543210" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={14} inputRef={phoneRef} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
      <TextField label="Password" icon="lock-closed-outline" placeholder="At least 6 characters" value={f.password} onChangeText={set('password')} secure inputRef={passwordRef} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} />
      <TextField label="Confirm password" icon="lock-closed-outline" placeholder="Repeat the password" value={f.confirm} onChangeText={set('confirm')} secure inputRef={confirmRef} returnKeyType="next" onSubmitEditing={() => firmRef.current?.focus()} />

      <Text style={styles.section}>Your business</Text>
      <TextField label="Business / shop name" icon="briefcase-outline" placeholder="e.g. Kumar Plumbing Works" value={f.firm} onChangeText={set('firm')} autoCapitalize="words" inputRef={firmRef} />
      <TextField label="Email (optional)" icon="mail-outline" placeholder="you@example.com" value={f.email} onChangeText={set('email')} keyboardType="email-address" />

      <Text style={styles.fieldLabel}>What service do you offer?</Text>
      <View style={styles.chips}>
        {cats.map((c) => {
          const on = !other && f.category === c.name;
          return (
            <Pressable key={c._id} onPress={() => { setOther(false); set('category')(c.name); }} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
            </Pressable>
          );
        })}
        <Pressable onPress={() => { setOther(true); set('category')(''); }} style={[styles.chip, other && styles.chipOn]}>
          <Text style={[styles.chipText, other && styles.chipTextOn]}>Other</Text>
        </Pressable>
      </View>
      {other || cats.length === 0 ? (
        <TextField label="Type your service" icon="construct-outline" placeholder="e.g. Water tank cleaning" value={f.category} onChangeText={set('category')} />
      ) : null}
      <TextField label="About your work (optional)" icon="chatbubble-ellipses-outline" placeholder="Years of experience, areas you cover…" value={f.about} onChangeText={set('about')} maxLength={1000} />

      <Text style={styles.section}>Where you work</Text>
      <TextField label="Base address" icon="location-outline" placeholder="Building, street, area" value={f.line1} onChangeText={set('line1')} inputRef={line1Ref} returnKeyType="next" onSubmitEditing={() => cityRef.current?.focus()} />
      <TextField label="City" icon="business-outline" placeholder="City" value={f.city} onChangeText={set('city')} autoCapitalize="words" inputRef={cityRef} returnKeyType="next" onSubmitEditing={() => pincodeRef.current?.focus()} />
      <TextField label="PIN code" icon="navigate-outline" placeholder="6-digit PIN" value={f.pincode} onChangeText={(v) => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} inputRef={pincodeRef} />
      <TextField label="State" icon="map-outline" placeholder="State" value={f.state} onChangeText={set('state')} autoCapitalize="words" />

      <Text style={styles.fieldLabel}>Your base location</Text>
      <Pressable onPress={useMyLocation} style={[styles.locBtn, location && styles.locBtnOn]} disabled={locating}>
        <Ionicons name={location ? 'checkmark-circle' : 'locate-outline'} size={20} color={location ? colors.primary : colors.muted} />
        <Text style={[styles.locText, location && { color: colors.primary }]}>
          {locating ? 'Getting your location…' : location ? 'Location captured — tap to update' : 'Use my current location'}
        </Text>
      </Pressable>
      {location ? (
        <Text style={styles.coords}>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</Text>
      ) : (
        <Text style={styles.hint}>Stand at your base and tap the button so nearby customers find you first.</Text>
      )}

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
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { fontSize: 13.5, fontWeight: '600', color: colors.muted },
  chipTextOn: { color: '#fff' },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card,
  },
  locBtnOn: { borderColor: colors.primary },
  locText: { fontSize: 15, fontWeight: '600', color: colors.muted },
  coords: { marginTop: 6, marginBottom: 4, fontSize: 12.5, color: colors.muted },
  hint: { marginTop: 6, marginBottom: 4, fontSize: 12.5, color: colors.muted },
  doneRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  doneText: { flex: 1, fontSize: 14.5, color: colors.text, lineHeight: 21 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  switchText: { color: colors.muted, fontSize: 14 },
  switchLink: { color: colors.primary, fontSize: 14, fontWeight: '800' },
});
