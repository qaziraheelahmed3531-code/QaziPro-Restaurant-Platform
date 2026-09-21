import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Card, Empty, Notice, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { cartEstimate } from "@/domain/cart";
import { catalogCategories, visibleCatalogEntries } from "@/domain/catalog";
import { formatMoney } from "@/lib/format";
import { colors, themeColors } from "@/ui/theme";
import type { Promotion } from "@/contracts/types";

export default function Home() {
  const app = useApp(),
    router = useRouter(),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [promotions, setPromotions] = useState<Promotion[]>([]);
  useEffect(() => {
    void app.api
      .request<{ promotions: Promotion[] }>("/promotions")
      .then((result) => setPromotions(result.data.promotions))
      .catch(() => setPromotions([]));
  }, [app.api]);
  const entries = useMemo(
      () => visibleCatalogEntries(app.catalog, category, search),
      [app.catalog, category, search],
    ),
    categories = catalogCategories(app.catalog),
    palette = themeColors(app.bootstrap?.colors),
    currency = app.bootstrap?.currency ?? "PKR";
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
            tintColor={palette.primary}
          />
        }
        contentContainerStyle={styles.list}
        data={entries}
        keyExtractor={(entry) => `${entry.kind}-${entry.item.id}`}
        numColumns={2}
        columnWrapperStyle={styles.columns}
        ListHeaderComponent={
          <>
            <View style={[styles.hero, { backgroundColor: palette.ink }]}>
              <View style={styles.heroText}>
                <Text style={[styles.kicker, { color: palette.gold }]}>
                  {app.branch?.isOpen ? "OPEN NOW" : "CURRENTLY CLOSED"}
                </Text>
                <Text style={styles.title}>{app.bootstrap?.displayName}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Change branch. Current branch ${app.branch?.name ?? "not selected"}`}
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
                  accessibilityLabel={`${app.bootstrap.displayName} logo`}
                />
              ) : null}
            </View>
            {app.catalog?.heroSlides.length ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.banners}
                accessibilityLabel={`${app.bootstrap?.displayName ?? "Restaurant"} banners`}
              >
                {app.catalog.heroSlides.map((slide) => (
                  <Image
                    key={slide.id}
                    accessibilityLabel={slide.alt}
                    source={{ uri: slide.mobileImage || slide.image }}
                    style={styles.banner}
                  />
                ))}
              </ScrollView>
            ) : null}
            {promotions.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promotions}
              >
                {promotions.map((promotion) => (
                  <View key={promotion.code} style={styles.promotion}>
                    <Text
                      style={[styles.promotionCode, { color: palette.primary }]}
                    >
                      {promotion.code}
                    </Text>
                    <Text style={[styles.promotionCopy, { color: palette.ink }]}>
                      {promotion.type === "PERCENT"
                        ? `${promotion.value}% off`
                        : `${formatMoney(promotion.value, currency)} off`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <TextInput
              accessibilityLabel="Search menu"
              placeholder="Search products and deals"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              style={[
                styles.search,
                { borderColor: palette.primary, color: palette.ink },
              ]}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categories}
            >
              {[
                "all",
                ...(app.catalog?.deals.length ? ["deals"] : []),
                ...categories,
              ].map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === item }}
                  accessibilityLabel={`Show ${item === "all" ? "all" : item} menu items`}
                  onPress={() => setCategory(item)}
                  style={[
                    styles.chip,
                    category === item && {
                      backgroundColor: palette.primary,
                      borderColor: palette.primary,
                    },
                  ]}
                >
                  <Text style={category === item && styles.activeChipText}>
                    {item === "all"
                      ? "All"
                      : item === "deals"
                        ? "Deals"
                        : item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.section, { color: palette.ink }]}>Menu</Text>
          </>
        }
        ListEmptyComponent={
          <Empty
            title="No items found"
            detail="Try another category or search term, or refresh the menu."
          />
        }
        renderItem={({ item: entry }) => {
          const item = entry.item;
          const available = item.available !== false;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${formatMoney(item.price, currency)}`}
              disabled={!available}
              onPress={() => router.push(`/product/${item.id}`)}
              style={styles.product}
            >
              <Card style={styles.productCard}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.placeholder]}>
                    <Text>🍽️</Text>
                  </View>
                )}
                <Text
                  numberOfLines={2}
                  style={[styles.productName, { color: palette.ink }]}
                >
                  {item.name}
                </Text>
                <Text style={[styles.price, { color: palette.primary }]}>
                  {formatMoney(item.price, currency)}
                </Text>
                {entry.kind === "deal" &&
                "savings" in item &&
                item.savings > 0 ? (
                  <Text style={styles.saving}>
                    Save {formatMoney(item.savings, currency)}
                  </Text>
                ) : null}
                {!available ? (
                  <Text style={styles.unavailable}>Unavailable</Text>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
        ListFooterComponent={<View style={{ height: 90 }} />}
      />
      {app.cart.lines.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open cart with ${app.cart.lines.length} items`}
          onPress={() => router.push("/cart")}
          style={[styles.cartBar, { backgroundColor: palette.primary }]}
        >
          <Text style={styles.cartText}>
            {app.cart.lines.reduce((sum, line) => sum + line.quantity, 0)} items
          </Text>
          <Text style={styles.cartText}>
            View cart · {formatMoney(cartEstimate(app.cart), currency)}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  heroText: { flex: 1, gap: 8 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 28, fontWeight: "900" },
  branch: { color: "#eee0d7", fontWeight: "700" },
  logo: { width: 96, height: 96, resizeMode: "contain" },
  banners: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  banner: {
    width: 320,
    height: 138,
    borderRadius: 18,
    resizeMode: "cover",
    backgroundColor: "#f5eee8",
  },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    backgroundColor: "#fff",
  },
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
  promotionCode: { fontWeight: "900" },
  promotionCopy: { marginTop: 3 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  activeChipText: { color: "#fff", fontWeight: "800" },
  section: { fontSize: 21, fontWeight: "900", margin: 22 },
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
    marginTop: 10,
    minHeight: 38,
  },
  price: { fontSize: 15, fontWeight: "900", marginTop: 4 },
  saving: { color: colors.green, fontSize: 11, fontWeight: "800" },
  unavailable: { color: colors.danger, fontSize: 11, fontWeight: "800" },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    minHeight: 58,
    paddingHorizontal: 18,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartText: { color: "#fff", fontWeight: "900" },
});
