import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Empty, Loading, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { colors } from "@/ui/theme";
type Favourite = {
  id: string;
  product_id: string;
  products?: {
    id: string;
    name: string;
    base_price: number;
    sale_price?: number | null;
    is_available: boolean;
  };
};
export default function Favourites() {
  const app = useApp(),
    router = useRouter(),
    [items, setItems] = useState<Favourite[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const token = app.session?.access_token;
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await app.api.request<{ favourites: Favourite[] }>(
        "/favourites",
        { token },
      );
      setItems(result.data.favourites);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load favourites.");
    } finally {
      setLoading(false);
    }
  }, [app.api, token]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  if (!token)
    return (
      <Screen>
        <Empty
          title="Sign in required"
          detail="Favourites sync securely across your devices."
        />
      </Screen>
    );
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <Screen>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Empty
            title="No favourites yet"
            detail="Open a menu item and tap Add to favourites."
          />
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>
              {item.products?.name ?? "Menu item"}
            </Text>
            <Text style={styles.price}>
              Rs{" "}
              {Number(
                item.products?.sale_price ?? item.products?.base_price ?? 0,
              ).toLocaleString()}
            </Text>
            <Button
              kind="secondary"
              title="Open item"
              disabled={!item.products?.is_available}
              onPress={() => router.push(`/product/${item.product_id}`)}
            />
            <Button
              kind="danger"
              title="Remove"
              onPress={() =>
                void app.api
                  .request("/favourites", {
                    method: "DELETE",
                    token,
                    query: { productId: item.product_id },
                  })
                  .then(load)
                  .catch((e) => setError(e.message))
              }
            />
          </Card>
        )}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingVertical: 10 },
  name: { fontSize: 17, fontWeight: "900", color: colors.ink },
  price: { marginVertical: 8, color: colors.primary, fontWeight: "900" },
});
