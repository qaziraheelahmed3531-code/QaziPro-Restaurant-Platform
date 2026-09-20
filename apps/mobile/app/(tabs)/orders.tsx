import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Button, Card, Empty, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { PublicOrder } from "@/contracts/types";
import { colors } from "@/ui/theme";

export default function Orders() {
  const app = useApp(),
    router = useRouter(),
    [orders, setOrders] = useState<PublicOrder[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (reset = true, pageCursor?: string | null) => {
      if (!app.session) return;
      setLoading(true);
      setError("");
      try {
        const result = await app.api.request<{ orders: PublicOrder[] }>(
          "/orders",
          {
            token: app.session.access_token,
            query: {
              limit: 20,
              cursor: reset ? undefined : (pageCursor ?? undefined),
            },
          },
        );
        setOrders((current) =>
          reset ? result.data.orders : [...current, ...result.data.orders],
        );
        setCursor(result.nextCursor ?? null);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Orders could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [app.api, app.session],
  );
  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );
  if (!app.session)
    return (
      <Screen>
        <Empty
          title="Sign in to see orders"
          detail="Guest orders remain available from their secure confirmation link."
          action={
            <Button title="Sign in" onPress={() => router.push("/auth")} />
          }
        />
      </Screen>
    );
  return (
    <Screen>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading && !orders.length ? (
        <Loading label="Loading orders…" />
      ) : (
        <FlatList
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load(true)}
            />
          }
          contentContainerStyle={styles.list}
          data={orders}
          keyExtractor={(item, index) =>
            String(item.id ?? item.orderNumber ?? index)
          }
          ListEmptyComponent={
            <Empty
              title="No orders yet"
              detail="Your signed-in order history will appear here."
            />
          }
          renderItem={({ item }) => {
            const number = String(
              item.orderNumber ?? item.order_number ?? "Order",
            );
            return (
              <Card>
                <Text style={styles.number}>{number}</Text>
                <Text style={styles.status}>
                  {String(item.status ?? "PLACED").replaceAll("_", " ")}
                </Text>
                <Text style={styles.date}>
                  {item.created_at
                    ? new Date(item.created_at).toLocaleString()
                    : ""}
                </Text>
                <Button
                  kind="secondary"
                  title="View order"
                  onPress={() => router.push(`/order/${number}`)}
                />
              </Card>
            );
          }}
          ListFooterComponent={
            cursor ? (
              <Button
                kind="secondary"
                title={loading ? "Loading…" : "Load more"}
                disabled={loading}
                onPress={() => void load(false, cursor)}
              />
            ) : null
          }
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingVertical: 10, paddingBottom: 30 },
  number: { fontSize: 18, fontWeight: "900", color: colors.ink },
  status: { marginVertical: 7, color: colors.primary, fontWeight: "900" },
  date: { marginBottom: 12, color: colors.muted, fontSize: 12 },
});
