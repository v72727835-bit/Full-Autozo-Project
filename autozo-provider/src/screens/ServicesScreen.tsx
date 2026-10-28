import { Ionicons } from '@react-native-vector-icons/ionicons/static';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { getErrorMessage } from '../api/client';
import { createService, deleteService, providerServices, serviceCategories, updateService } from '../api/provider';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';
import { Availability, ServiceCategory, ServiceRow } from '../types';
import { Btn, Card, Center, Chips, Empty, ErrorText, Input, Section } from '../ui';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const UNIT_OPTS = [['fixed', 'Fixed'], ['hourly', 'Per hour'], ['visit', 'Per visit']] as const;

type Form = {
  category: string; title: string; description: string; price: string; mrp: string;
  priceUnit: 'fixed' | 'hourly' | 'visit'; durationMins: string; serviceRadiusKm: string;
  isActive: boolean; availability: Availability[];
};
const blank: Form = { category: '', title: '', description: '', price: '', mrp: '', priceUnit: 'fixed', durationMins: '60', serviceRadiusKm: '10', isActive: true, availability: [] };

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

  const load = () => providerServices().then(setRows).catch((e) => { setError(getErrorMessage(e)); setRows([]); });
  useEffect(() => { load(); serviceCategories().then(setCats).catch(() => undefined); }, []);

  const startNew = () => { setEditing(null); setForm({ ...blank, category: cats[0]?._id ?? '' }); setOpen(true); };
  const startEdit = (s: ServiceRow) => {
    setEditing(s);
    setForm({
      category: typeof s.category === 'object' ? s.category._id : s.category,
      title: s.title, description: s.description ?? '', price: String(s.price), mrp: s.mrp ? String(s.mrp) : '',
      priceUnit: s.priceUnit, durationMins: String(s.durationMins), serviceRadiusKm: String(s.serviceRadiusKm),
      isActive: s.isActive, availability: s.availability ?? [],
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
        durationMins: Number(form.durationMins) || 60, serviceRadiusKm: Number(form.serviceRadiusKm) || 10,
        isActive: form.isActive, availability: form.availability,
      };
      if (editing) await updateService(editing._id, body); else await createService(body);
      setOpen(false); load();
    } catch (e) { setError(getErrorMessage(e)); } finally { setBusy(false); }
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
              <View style={{ flex: 1 }}>
                <Text style={st.title}>{s.title}</Text>
                <Text style={st.sub}>₹{s.price}{s.priceUnit === 'hourly' ? '/hr' : s.priceUnit === 'visit' ? '/visit' : ''} · {s.durationMins}m · {s.isActive ? 'Active' : 'Hidden'} · {s.bookingCount} booking(s)</Text>
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
          <Input label="Price (₹)" value={form.price} onChangeText={(v) => setForm({ ...form, price: v })} keyboardType="numeric" />
          <Input label="MRP (optional)" value={form.mrp} onChangeText={(v) => setForm({ ...form, mrp: v })} keyboardType="numeric" />
          <Text style={st.label}>Price unit</Text>
          <Chips value={form.priceUnit} options={UNIT_OPTS} onChange={(v) => setForm({ ...form, priceUnit: v })} />
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
          <Btn title={editing ? 'Save' : 'Create'} onPress={save} disabled={busy || !form.category || form.title.trim().length < 2} />
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
});
