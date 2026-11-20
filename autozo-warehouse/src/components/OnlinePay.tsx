import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { WEB_URL } from '../config';
import { tokenStore } from '../storage/tokens';
import { colors } from '../theme';

/** A started Razorpay payment, as the server returns it. */
export interface PayOrder {
  razorpayOrderId: string;
  keyId: string;
  /** Paise. */
  amount: number;
}

/** UPI apps are opened with `upi://...` or an Android `intent://...#Intent;scheme=upi;...;end` link. */
export function externalUrl(url: string): string {
  const intent = /^intent:\/\/(.*?)#Intent;.*?scheme=([a-z0-9]+);/i.exec(url);
  return intent ? `${intent[2]}://${intent[1]}` : url;
}

/**
 * Razorpay's payment window, inside the app. The website's /pay page runs the checkout and tells
 * this window when it is done, so the person never leaves the app: UPI apps open on top and come
 * back, and the screen closes and refreshes by itself once the payment is received.
 */
export function OnlinePay({ order, kind, onPaid, onClose }: { order: PayOrder | null; kind: 'plan' | 'dues'; onPaid: () => void; onClose: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setUri(null);
    setLoading(true);
    if (!order) return;
    void tokenStore.getAccess().then((token) => {
      if (!alive) return;
      const hash = `o=${encodeURIComponent(order.razorpayOrderId)}&k=${encodeURIComponent(order.keyId)}&a=${order.amount}&t=${encodeURIComponent(token ?? '')}&x=${kind}`;
      setUri(`${WEB_URL}/pay#${hash}`);
    });
    return () => {
      alive = false;
    };
  }, [order, kind]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string };
      if (message.type === 'paid') setTimeout(onPaid, 1200); // a moment to see "Payment received"
    } catch {
      /* not one of ours */
    }
  };

  return (
    <Modal visible={!!order} animationType="slide" onRequestClose={onClose}>
      <View style={st.screen}>
        <View style={st.bar}>
          <Text style={st.title}>Pay securely</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close payment">
            <Text style={st.close}>Close</Text>
          </Pressable>
        </View>
        {uri ? (
          <WebView
            source={{ uri }}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            originWhitelist={['*']}
            onLoadEnd={() => setLoading(false)}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={(request) => {
              if (/^(https?:|about:|data:|blob:)/i.test(request.url)) return true;
              void Linking.openURL(externalUrl(request.url)).catch(() => undefined);
              return false;
            }}
          />
        ) : null}
        {loading ? (
          <View style={st.loading} pointerEvents="none">
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 44, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  close: { fontSize: 15, fontWeight: '700', color: colors.primary },
  loading: { position: 'absolute', top: 90, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
