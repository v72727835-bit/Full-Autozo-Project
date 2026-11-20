import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { getErrorMessage } from '../api/client';
import { createService, deleteService, providerServices, serviceCategories, updateService, uploadImages, uploadVideo } from '../api/provider';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';
import { Availability, ServiceCategory, ServiceRow } from '../types';
import { Btn, Card, Center, Chips, Empty, ErrorText, Input, Section } from '../ui';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const UNIT_OPTS = [['fixed', 'Fixed'], ['hourly', 'Per hour'], ['visit', 'Per visit'], ['per_km', 'Per km']] as const;

type Form = {
  category: string; title: string; description: string; price: string; mrp: string;
  priceUnit: 'fixed' | 'hourly' | 'visit' | 'per_km'; includedKm: string; perKmRate: string; durationMins: string; serviceRadiusKm: string;
  isActive: boolean; availability: Availability[]; images: string[]; video: string;
};
const blank: Form = { category: '', title: '', description: '', price: '', mrp: '', priceUnit: 'fixed', includedKm: '', perKmRate: '', durationMins: '60', serviceRadiusKm: '10', isActive: true, availability: [], images: [], video: '' };

export default function ServicesScreen() {
  const { me } = useAuth();
  const approved = me?.providerStatus === 'approved';
  const [rows, setRows] = useState<ServiceRow[] | null>(null);
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'' | 'photo' | 'video'>('');

  const load = () => providerServices().then(setRows).catch((e) => { setError(getErrorMessage(e)); setRows([]); });
  useEffect(() => { load(); serviceCategories().then(setCats).catch(() => undefined); }, []);

  const startNew = () => { setEditing(null); setForm({ ...blank, category: cats[0]?._id ?? '' }); setOpen(true); };
  const startEdit = (s: ServiceRow) => {
    setEditing(s);
    setForm({
      category: typeof s.category === 'object' ? s.category._id : s.category,
      title: s.title, description: s.description ?? '', price: String(s.price), mrp: s.mrp ? String(s.mrp) : '',
      priceUnit: s.priceUnit, includedKm: s.includedKm ? String(s.includedKm) : '', perKmRate: s.perKmRate ? String(s.perKmRate) : '', durationMins: String(s.durationMins), serviceRadiusKm: String(s.serviceRadiusKm),
      isActive: s.isActive, availability: s.availability ?? [], images: s.images ?? [], video: s.video ?? '',
    });
    setOpen(true);
  };

  const toggleDay = (day: string) => setForm((f) => {
    const has = f.availability.find((a) => a.day === day);
    return has ? { ...f, availability: f.availability.filter((a) => a.day !== day) } : { ...f, availability: [...f.availability, { day, open: '09:00', close: '18:00' }] };
  });

  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = {
        category: form.category, title: form.title.trim(), description: form.description.trim() || undefined,
        price: Number(form.price) || 0, mrp: form.mrp ? Number(form.mrp) : undefined, priceUnit: form.priceUnit,
        ...(form.priceUnit === 'per_km' ? { includedKm: Number(form.includedKm) || 0, perKmRate: Number(form.perKmRate) || 0 } : {}),
        durationMins: Number(form.durationMins) || 60, serviceRadiusKm: Number(form.serviceRadiusKm) || 10,
        isActive: form.isActive, availability: form.availability, images: form.images, video: form.video,
      };
      if (editing) await updateService(editing._id, body); else await createService(body);
      setOpen(false); load();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
  };

  const addPhotos = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: Math.max(1, 8 - form.images.length), quality: 0.6, maxWidth: 1080, maxHeight: 1080 });
    if (res.didCancel || !res.assets?.length) return;
    setUploading('photo'); setError('');
    try {
      const urls = await uploadImages(res.assets.map((a, i) => ({ uri: a.uri ?? '', name: a.fileName ?? `photo-${Date.now()}-${i}.jpg`, type: a.type ?? 'image/jpeg' })));
      setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 8) }));
    } catch (e) { setError(getErrorMessage(e)); } finally { setUploading(''); }
  };
  const addVideo = async () => {
    const res = await launchImageLibrary({ mediaType: 'video', selectionLimit: 1 });
    const a = res.assets?.[0];
    if (res.didCancel || !a) return;
    setUploading('video'); setError('');
    try {
      const url = await uploadVideo({ uri: a.uri ?? '', name: a.fileName ?? `video-${Date.now()}.mp4`, type: a.type ?? 'video/mp4' });
      setForm((f) => ({ ...f, video: url }));
    } catch (e) { setError(getErrorMessage(e)); } finally { setUploading(''); }
  };

  const remove = (s: ServiceRow) => { deleteService(s._id).then(load).catch((e) => setError(getErrorMessage(e))); };

  if (rows === null) return <Center />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 90 }}>
        <ErrorText message={error} />
        {rows.length === 0 ? <Empty text={approved ? 'No services yet. Tap + to add one.' : 'You can add services once your account is approved.'} /> : (
          rows.map((s) => (
            <Card key={s._id} style={st.card}>
              {s.images?.[0] ? <Image source={{ uri: s.images[0] }} style={st.listThumb} /> : <View style={[st.listThumb, st.noThumb]}><Ionicons name="image-outline" size={20} color={colors.muted} /></View>}
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{s.title}</Text>
                <Text style={st.sub}>₹{s.price}{s.priceUnit === 'hourly' ? '/hr' : s.priceUnit === 'visit' ? '/visit' : s.priceUnit === 'per_km' ? ` (first ${s.includedKm ?? 0} km) + ₹${s.perKmRate ?? 0}/km` : ''} · {s.durationMins}m · {s.isActive ? 'Active' : 'Hidden'} · {s.bookingCount} booking(s)</Text>
              </View>
              <Pressable onPress={() => startEdit(s)} style={st.iconBtn}><Ionicons name="create-outline" size={20} color={colors.primary} /></Pressable>
              <Pressable onPress={() => remove(s)} style={st.iconBtn}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
            </Card>
          ))
        )}
      </ScrollView>

      {approved ? (
        <Pressable style={st.fab} onPress={startNew}><Ionicons name="add" size={28} color="#fff" /></Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 50 }}>
          <Section title={editing ? 'Edit service' : 'Add service'} />
          <Text style={st.label}>Category</Text>
          <Chips value={form.category} options={cats.map((c) => [c._id, c.name] as const)} onChange={(v) => setForm({ ...form, category: v })} />
          <View style={{ height: 10 }} />
          <Input label="Title" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="e.g. Full car wash" />
          <Input label="Description" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} multiline />

          <Text style={st.label}>Photos ({form.images.length}/8)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {form.images.map((u) => (
              <View key={u}>
                <Image source={{ uri: u }} style={st.thumb} />
                <Pressable style={st.thumbX} onPress={() => setForm((f) => ({ ...f, images: f.images.filter((x) => x !== u) }))}>
                  <Ionicons name="close" size={14} color="#fff" />
                </Pressable>
              </View>
            ))}
            {form.images.length < 8 ? (
              <Pressable style={st.addTile} onPress={addPhotos} disabled={!!uploading}>
                {uploading === 'photo' ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="camera-outline" size={24} color={colors.primary} /><Text style={st.addText}>Add photo</Text></>}
              </Pressable>
            ) : null}
          </ScrollView>

          <Text style={st.label}>Video (optional)</Text>
          {form.video ? (
            <View style={[st.videoRow]}>
              <Ionicons name="videocam" size={20} color={colors.primary} />
              <Text style={{ flex: 1, color: colors.text }} numberOfLines={1}>{form.video.split('/').pop()}</Text>
              <Pressable onPress={() => setForm((f) => ({ ...f, video: '' }))}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>
            </View>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Btn title={uploading === 'video' ? 'Uploading video…' : 'Upload a video (max 15 MB)'} tone="outline" onPress={addVideo} disabled={!!uploading} />
            </View>
          )}
          <Input label={form.priceUnit === 'per_km' ? 'Base fee (₹) for the first km below' : 'Price (₹)'} value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="numeric" />
          <Input label="MRP (optional)" value={form.mrp} onChangeText={(v) => setForm({ ...form, mrp: v })} keyboardType="numeric" />
          <Text style={st.label}>Price unit</Text>
          <Chips value={form.priceUnit} options={UNIT_OPTS} onChange={(v) => setForm({ ...form, priceUnit: v })} />
          {form.priceUnit === 'per_km' ? (
            <>
              <Input label="Km covered by the base fee" value={form.includedKm} onChangeText={(v) => setForm({ ...form, includedKm: v })} keyboardType="numeric" />
              <Input label="Price for every extra km (₹)" value={form.perKmRate} onChangeText={(v) => setForm({ ...form, perKmRate: v })} keyboardType="numeric" />
              <Text style={st.label}>The customer enters the distance; the fare is worked out for them. {Number(form.price) > 0 && Number(form.perKmRate) > 0 ? `Example: 20 km = ₹${Math.round(Number(form.price) + Math.max(0, 20 - (Number(form.includedKm) || 0)) * Number(form.perKmRate))}` : ''}</Text>
            </>
          ) : null}
          <View style={{ height: 10 }} />
          <Input label="Duration (minutes)" value={form.durationMins} onChangeText={(v) => setForm({ ...form, durationMins: v })} keyboardType="numeric" />
          <Input label="Service radius (km)" value={form.serviceRadiusKm} onChangeText={(v) => setForm({ ...form, serviceRadiusKm: v })} keyboardType="numeric" />

          <Text style={st.label}>Available days</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {WEEKDAYS.map((day) => {
              const on = !!form.availability.find((a) => a.day === day);
              return (
                <Pressable key={day} onPress={() => toggleDay(day)} style={[st.day, on && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[st.dayText, on && { color: '#fff' }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[st.card, { marginBottom: 16 }]}>
            <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>Visible to customers</Text>
            <Switch value={form.isActive} onValueChange={(v) => setForm({ ...form, isActive: v })} trackColor={{ true: colors.primary }} />
          </View>

          <ErrorText message={error} />
          <Btn title={editing ? 'Save' : 'Create'} onPress={save} disabled={busy || !!uploading || !form.category || form.title.trim().length < 2} />
          <View style={{ height: 8 }} />
          <Btn title="Cancel" tone="outline" onPress={() => setOpen(false)} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, marginTop: 2, fontSize: 12.5 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  fab: { position: 'absolute', right: 18, bottom: 22, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 6 },
  day: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  dayText: { color: colors.text, fontWeight: '600' },
  listThumb: { width: 52, height: 52, borderRadius: 10 },
  noThumb: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 84, height: 84, borderRadius: 12 },
  thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  addTile: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
});
