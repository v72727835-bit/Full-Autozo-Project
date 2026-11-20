import React, { useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { api } from '../api/client';
import { themed } from '../theme';

const SHOP_URL = 'https://shop.autozo.org';

/** "Share Autozo": my personal link and code; people who join through it are counted. Shows nothing until the code loads. */
export function ShareCard() {
  const [info, setInfo] = useState<{ code: string; referred: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.get('/referral').then(({ data }) => { if (live) setInfo(data.data); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  if (!info) return null;
  const link = `${SHOP_URL}/?ref=${info.code}`;
  const send = () => { void Share.share({ message: `Order on Autozo with my link: ${link}` }).catch(() => undefined); };
  return (
    <View style={st.card}>
      <Text style={st.title}>Share Autozo</Text>
      <Text style={st.body}>
        Your code <Text style={st.code}>{info.code}</Text>.{' '}
        {info.referred ? `${info.referred} ${info.referred === 1 ? 'person has' : 'people have'} joined with it.` : 'Anyone who signs up with it is counted as yours.'}
      </Text>
      <Pressable onPress={send} style={st.btn} accessibilityRole="button" accessibilityLabel="Share Autozo">
        <Text style={st.btnText}>Share link</Text>
      </Pressable>
    </View>
  );
}

const st = themed(({ c }) => ({
  card: { borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 14, marginVertical: 12, backgroundColor: c.surface },
  title: { color: c.ink, fontSize: 16, fontWeight: '800' },
  body: { color: c.inkMuted, marginTop: 4, lineHeight: 19 },
  code: { color: c.ink, fontWeight: '800' },
  btn: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: c.brand, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18 },
  btnText: { color: c.onBrand, fontWeight: '800' },
}));
