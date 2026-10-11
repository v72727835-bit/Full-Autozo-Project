import Icon from '@react-native-vector-icons/ionicons/static';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { fetchOrders } from '../api/orders';
import { useAuth } from '../context/AuthContext';
import type { AppNav } from '../navigation/types';
import { gutter, hitSlop, ms, radius, space, themed, useTheme } from '../theme';
import type { Order } from '../types';
import { Txt } from '../ui/Text';

/** The reminder comes back five minutes after it is closed. */
const REMIND_AFTER_MS = 5 * 60_000;
const CHECK_EVERY_MS = 60_000;

/** Per order, the moment the customer's dismissal runs out. */
const hidden = new Map<string, number>();

/**
 * "Your order is in process" - a standing reminder while an order is on its
 * way, with the tap that opens the tracking screen. Closing it buys five
 * minutes of quiet; delivery or cancellation stops it for good.
 */
export function OrderProgressPopup() {
  const nav = useNavigation<AppNav>();
  const { user } = useAuth();
  const { c } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) {
      setOrder(null);
      setVisible(false);
      return;
    }
    let alive = true;
    const check = async () => {
      try {
        const { items } = await fetchOrders({ active: true });
        if (!alive) return;
        const live = items.find((o) => !['delivered', 'cancelled', 'rejected'].includes(o.status)) ?? null;
        setOrder(live);
        setVisible(live ? (hidden.get(live._id) ?? 0) < Date.now() : false);
      } catch {
        /* offline - try again on the next tick */
      }
    };
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user]);

  if (!order || !visible) return null;

  const eta = order.deliveryDays && order.deliveryDays > 1 ? `in about ${order.deliveryDays} days` : 'soon';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => nav.navigate('OrderDetail', { id: order._id })}
        accessibilityRole="button"
        accessibilityLabel={`Your order is in process. Track order ${order.orderNumber}`}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
      >
        <View style={styles.icon}>
          <Icon name="bicycle" size={ms(19)} color={c.brand} />
        </View>
        <View style={styles.body}>
          <Txt variant="label">Your order is in process</Txt>
          <Txt variant="caption" tone="muted" numberOfLines={1}>
            You will get it {eta} · Tap to track {order.orderNumber}
          </Txt>
        </View>
        <Pressable
          onPress={() => {
            hidden.set(order._id, Date.now() + REMIND_AFTER_MS);
            setVisible(false);
          }}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Hide this reminder"
        >
          <Icon name="close" size={ms(18)} color={c.inkMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = themed(({ c }) => ({
  /* Sits in flow just above the tab bar, so it never covers the cart bar. */
  wrap: { paddingHorizontal: gutter, paddingBottom: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.brandBorder,
    backgroundColor: c.surface,
    boxShadow: `0px 6px 18px 0px ${c.shadow}`,
  },
  icon: {
    width: ms(36),
    height: ms(36),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSurface,
  },
  body: { flex: 1 },}));
