import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { OrderDetail } from "@/contracts/types";
import { secureStorage } from "@/lib/storage";
import { env } from "@/config/env";
import { reorderCart } from "@/domain/cart";
import { formatMoney } from "@/lib/format";
import { colors, themeColors } from "@/ui/theme";

const terminal = new Set(["DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"]);
export default function OrderScreen() {
  const { id, success } = useLocalSearchParams<{
      id: string;
      success?: string;
    }>(),
    app = useApp(),
    router = useRouter(),
    [detail, setDetail] = useState<OrderDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const access = useCallback(
    async () => ({
      token: app.session?.access_token,
      guestToken:
        (await secureStorage.getItem(
          `order-token:${env.restaurantKey}:${id}`,
        )) ?? undefined,
    }),
    [app.session, id],
  );
  const load = useCallback(async () => {
    try {
      const auth = await access(),
        result = await app.api.request<OrderDetail>(`/orders/${id}`, auth);
      setDetail(result.data);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Order could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [access, app.api, id]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (!terminal.has(String(detail?.order.status ?? "")))
        interval = setInterval(() => void load(), 15000);
    };
    start();
    const listener = AppState.addEventListener("change", (state) => {
      if (interval) clearInterval(interval);
      if (state === "active") start();
    });
    return () => {
      clearTimeout(initial);
      if (interval) clearInterval(interval);
      listener.remove();
    };
  }, [load, detail?.order.status]);
  const cancel = () =>
    Alert.alert(
      "Cancel order?",
      "Cancellation is completed only after the server confirms it is still allowed.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            try {
              const auth = await access();
              await app.api.request(`/orders/${id}/cancel`, {
                ...auth,
                method: "POST",
              });
              await load();
            } catch (reason) {
              Alert.alert(
                "Could not cancel",
                reason instanceof Error ? reason.message : "Try again.",
              );
            }
          },
        },
      ],
    );
  const reorder = async () => {
    if (!detail || !app.catalog) return;
    if (detail.reorder.branchId !== app.branch?.id)
      return Alert.alert(
        "Different branch",
        "Select the original branch first so current prices and availability can be checked.",
      );
    const result = reorderCart(app.cart, detail, app.catalog);
    await app.replaceCart(result.cart);
    Alert.alert(
      "Cart rebuilt",
      result.skipped
        ? `${result.skipped} unavailable item(s) were skipped.`
        : "All available items were added with current prices.",
      [{ text: "View cart", onPress: () => router.push("/cart") }],
    );
  };
  if (loading)
    return (
      <Screen>
        <Loading label="Loading secure order…" />
      </Screen>
    );
  if (error || !detail)
    return (
      <Screen>
        <Notice tone="error">{error}</Notice>
        <Button title="Try again" onPress={() => void load()} />
      </Screen>
    );
  const order = detail.order,
    number = String(order.orderNumber ?? order.order_number ?? id),
    status = String(order.status ?? "PLACED"),
    items = Array.isArray(order.order_items)
      ? (order.order_items as Record<string, unknown>[])
      : [],
    currency = app.bootstrap?.currency ?? "PKR",
    palette = themeColors(app.bootstrap?.colors);
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {success ? (
          <Notice tone="success">
            Order confirmed. Your cart was cleared after the server returned
            this order.
          </Notice>
        ) : null}
        <Card style={[styles.hero, { backgroundColor: palette.ink }]}>
          <Text style={[styles.kicker, { color: palette.gold }]}>ORDER CONFIRMED</Text>
          <Text style={styles.number}>{number}</Text>
          <Text style={styles.status}>{status.replaceAll("_", " ")}</Text>
          <Text style={styles.total}>
            {formatMoney(Number(order.total ?? 0), currency)}
          </Text>
          <Text style={styles.heroMeta}>
            {app.bootstrap?.displayName} · {app.branch?.name}
          </Text>
          <Text style={styles.heroMeta}>
            {String(order.serviceMode ?? order.service_mode ?? "PICKUP")}
          </Text>
        </Card>
        <Card>
          <Text style={styles.heading}>Current status</Text>
          <Text style={styles.copy}>
            Status refreshes while this screen is open. Push notifications
            complement this secure server check.
          </Text>
          <View style={styles.timeline}>
            {["CONFIRMED", "PREPARING", "READY", "DELIVERED"].map((stage) => (
              <Text
                key={stage}
                style={[styles.stage, stage === status && styles.current]}
              >
                {stage === status ? "●" : "○"} {stage}
              </Text>
            ))}
          </View>
        </Card>
        <Card>
          <Text style={styles.heading}>Items</Text>
          {items.map((item, index) => (
            <View key={String(item.id ?? index)} style={styles.row}>
              <Text style={styles.copy}>
                {String(item.quantity ?? 1)} ×{" "}
                {String(item.product_name ?? item.name ?? "Item")}
              </Text>
              <Text style={styles.bold}>
                {formatMoney(Number(item.line_total ?? item.total ?? 0), currency)}
              </Text>
            </View>
          ))}
          <View style={styles.summary}>
            <View style={styles.row}><Text>Subtotal</Text><Text>{formatMoney(Number(order.subtotal ?? 0), currency)}</Text></View>
            {Number(order.discount ?? 0) > 0 ? <View style={styles.row}><Text>Discount</Text><Text>− {formatMoney(Number(order.discount), currency)}</Text></View> : null}
            {Number(order.tax ?? 0) > 0 ? <View style={styles.row}><Text>Tax</Text><Text>{formatMoney(Number(order.tax), currency)}</Text></View> : null}
            <View style={styles.row}><Text>Delivery</Text><Text>{formatMoney(Number(order.delivery_fee ?? 0), currency)}</Text></View>
            <View style={styles.row}><Text style={styles.bold}>Total</Text><Text style={styles.bold}>{formatMoney(Number(order.total ?? 0), currency)}</Text></View>
          </View>
        </Card>
        {!["CANCELLED", "DELIVERED", "COMPLETED", "REFUNDED"].includes(
          status,
        ) ? (
          <Button kind="danger" title="Request cancellation" onPress={cancel} />
        ) : null}
        <Button
          kind="secondary"
          title="Reorder with current menu"
          onPress={() => void reorder()}
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 8 },
  hero: {
    marginHorizontal: 0,
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ink,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: colors.gold,
  },
  number: { fontSize: 25, fontWeight: "900", color: "#fff" },
  status: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.primary,
    color: "#fff",
    fontWeight: "900",
  },
  total: { fontSize: 22, fontWeight: "900", color: "#fff" },
  heroMeta: { color: "#eee0d7", textAlign: "center" },
  heading: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink,
    marginBottom: 8,
  },
  copy: { color: colors.muted, lineHeight: 20 },
  timeline: { gap: 9, marginTop: 14 },
  stage: { color: colors.muted, fontWeight: "700" },
  current: { color: colors.primary, fontWeight: "900" },
  row: {
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summary: { marginTop: 12 },
  bold: { fontWeight: "900" },
});
