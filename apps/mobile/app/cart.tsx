import {
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Empty, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import { cartEstimate, validateCart } from "@/domain/cart";
import { colors } from "@/ui/theme";

export default function CartScreen() {
  const app = useApp(),
    router = useRouter();
  const checkout = () => {
    if (!app.catalog || !validateCart(app.cart, app.catalog))
      return Alert.alert(
        "Cart needs attention",
        "Some items changed or became unavailable. Remove them or add them again from the current menu.",
      );
    router.push("/checkout");
  };
  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.list}
        data={app.cart.lines}
        keyExtractor={(item) => item.lineId}
        ListEmptyComponent={
          <Empty
            title="Your cart is empty"
            detail="Choose something delicious from the menu."
            action={
              <Button
                title="Browse menu"
                onPress={() => router.replace("/(tabs)")}
              />
            }
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.line}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.image} />
            ) : null}
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              {item.variantName ? (
                <Text style={styles.muted}>{item.variantName}</Text>
              ) : null}
              {item.modifiers.length ? (
                <Text numberOfLines={2} style={styles.muted}>
                  {item.modifiers.map((m) => m.label).join(", ")}
                </Text>
              ) : null}
              <Text style={styles.price}>
                Rs {(item.unitEstimate * item.quantity).toLocaleString()}
              </Text>
              {item.itemKind === "product" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.name} customization`}
                  onPress={() =>
                    router.push({
                      pathname: "/product/[id]",
                      params: { id: item.productId, lineId: item.lineId },
                    })
                  }
                >
                  <Text style={styles.edit}>Edit customization</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="Decrease quantity"
                onPress={() =>
                  void app.setQuantity(item.lineId, item.quantity - 1)
                }
              >
                <Text style={styles.step}>−</Text>
              </Pressable>
              <Text style={styles.count}>{item.quantity}</Text>
              <Pressable
                accessibilityLabel="Increase quantity"
                onPress={() =>
                  void app.setQuantity(item.lineId, item.quantity + 1)
                }
              >
                <Text style={styles.step}>+</Text>
              </Pressable>
            </View>
          </Card>
        )}
        ListFooterComponent={
          app.cart.lines.length ? (
            <View style={styles.footer}>
              <View style={styles.total}>
                <Text>Estimated subtotal</Text>
                <Text style={styles.totalValue}>
                  Rs {cartEstimate(app.cart).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.note}>
                Tax, discount and delivery are calculated by the server at
                checkout.
              </Text>
              <Button title="Continue to checkout" onPress={checkout} />
              <Button
                kind="danger"
                title="Clear cart"
                onPress={() =>
                  Alert.alert("Clear cart?", "All items will be removed.", [
                    { text: "Keep", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => void app.empty(),
                    },
                  ])
                }
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { paddingVertical: 10 },
  line: { flexDirection: "row", alignItems: "center", gap: 12 },
  image: { width: 72, height: 72, borderRadius: 12 },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: "800", color: colors.ink },
  muted: { color: colors.muted, fontSize: 12 },
  price: { fontWeight: "900", color: colors.primary, marginTop: 4 },
  edit: { color: colors.primary, fontWeight: "800", marginTop: 5 },
  stepper: { alignItems: "center", gap: 3 },
  step: {
    width: 36,
    height: 34,
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 23,
    borderRadius: 10,
    backgroundColor: "#f6efe9",
  },
  count: { fontWeight: "900" },
  footer: { padding: 20, gap: 12 },
  total: { flexDirection: "row", justifyContent: "space-between" },
  totalValue: { fontSize: 18, fontWeight: "900" },
  note: { fontSize: 12, color: colors.muted, lineHeight: 18 },
});
