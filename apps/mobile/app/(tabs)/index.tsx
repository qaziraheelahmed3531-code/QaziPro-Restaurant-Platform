import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Card, Empty, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { cartEstimate } from "@/domain/cart";
import { colors } from "@/ui/theme";
import type { Promotion } from "@/contracts/types";

export default function Home() {
  const app = useApp(),
    router = useRouter(),
    [category, setCategory] = useState("all"),
    [promotions, setPromotions] = useState<Promotion[]>([]);
  useEffect(() => {
    void app.api
      .request<{ promotions: Promotion[] }>("/promotions")
      .then((result) => setPromotions(result.data.promotions))
      .catch(() => setPromotions([]));
  }, [app.api]);
  const products = useMemo(
    () =>
      app.catalog?.products.filter(
        (p) => category === "all" || p.category === category,
      ) ?? [],
    [app.catalog, category],
  );
  const categories = [
    ...new Set(app.catalog?.products.map((p) => p.category) ?? []),
  ];
  return (
    <Screen>
      {app.offline ? (
        <Notice>
          Showing saved restaurant details. Connect to load current menu
          availability.
        </Notice>
      ) : null}
      <FlatList
        refreshControl={
          <RefreshControl
            refreshing={app.busy}
            onRefresh={() => void app.reload()}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.list}
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <View style={styles.heroText}>
                <Text style={styles.kicker}>
                  {app.branch?.isOpen ? "OPEN NOW" : "CURRENTLY CLOSED"}
                </Text>
                <Text style={styles.title}>{app.bootstrap?.displayName}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/branch")}
                >
                  <Text style={styles.branch}>
                    📍 {app.branch?.name} · Change
                  </Text>
                </Pressable>
              </View>
              {app.bootstrap?.logoUrl ? (
                <Image
                  source={{ uri: app.bootstrap.logoUrl }}
                  style={styles.logo}
                />
              ) : null}
            </View>
            {promotions.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promotions}
              >
                {promotions.map((promotion) => (
                  <View key={promotion.code} style={styles.promotion}>
                    <Text style={styles.promotionCode}>{promotion.code}</Text>
                    <Text style={styles.promotionCopy}>
                      {promotion.type === "PERCENT"
                        ? `${promotion.value}% off`
                        : `Rs ${promotion.value} off`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categories}
            >
              {["all", ...categories].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.chip, category === item && styles.activeChip]}
                >
                  <Text style={category === item && styles.activeChipText}>
                    {item === "all" ? "All" : item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.section}>Popular right now</Text>
          </>
        }
        ListEmptyComponent={
          <Empty
            title="No items available"
            detail="Try another category or refresh the menu."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.price} rupees`}
            disabled={!item.available}
            onPress={() => router.push(`/product/${item.id}`)}
            style={styles.product}
          >
            <Card style={styles.productCard}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.image} />
              ) : (
                <View style={[styles.image, styles.placeholder]}>
                  <Text>🍕</Text>
                </View>
              )}
              <Text numberOfLines={2} style={styles.productName}>
                {item.name}
              </Text>
              <Text style={styles.price}>Rs {item.price.toLocaleString()}</Text>
              {!item.available ? (
                <Text style={styles.unavailable}>Unavailable</Text>
              ) : null}
            </Card>
          </Pressable>
        )}
        ListFooterComponent={<View style={{ height: 90 }} />}
      />
      {app.cart.lines.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open cart with ${app.cart.lines.length} items`}
          onPress={() => router.push("/cart")}
          style={styles.cartBar}
        >
          <Text style={styles.cartText}>
            {app.cart.lines.reduce((s, l) => s + l.quantity, 0)} items
          </Text>
          <Text style={styles.cartText}>
            View cart · Rs {cartEstimate(app.cart).toLocaleString()}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingBottom: 10 },
  hero: {
    margin: 16,
    padding: 20,
    minHeight: 156,
    borderRadius: 24,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  heroText: { flex: 1, gap: 8 },
  kicker: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  branch: { color: "#eee0d7", fontWeight: "700" },
  logo: { width: 96, height: 96, resizeMode: "contain" },
  categories: { paddingHorizontal: 16, gap: 9 },
  promotions: { paddingHorizontal: 16, paddingBottom: 12, gap: 9 },
  promotion: {
    minWidth: 140,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#fff0df",
    borderWidth: 1,
    borderColor: "#f2cfac",
  },
  promotionCode: { fontWeight: "900", color: colors.primary },
  promotionCopy: { marginTop: 3, color: colors.ink },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  activeChip: { backgroundColor: colors.primary, borderColor: colors.primary },
  activeChipText: { color: "#fff", fontWeight: "800" },
  section: { fontSize: 21, fontWeight: "900", color: colors.ink, margin: 22 },
  columns: { paddingHorizontal: 9 },
  product: { width: "50%" },
  productCard: { marginHorizontal: 7, padding: 10, minHeight: 238 },
  image: { width: "100%", height: 132, borderRadius: 13, resizeMode: "cover" },
  placeholder: {
    backgroundColor: "#f5eee8",
    alignItems: "center",
    justifyContent: "center",
  },
  productName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginTop: 10,
    minHeight: 38,
  },
  price: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  unavailable: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    minHeight: 58,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartText: { color: "#fff", fontWeight: "900" },
});
