import { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Empty, Screen } from "@/ui/components";
import { useApp } from "@/state/AppProvider";
import type { CartLine } from "@/contracts/types";
import { colors } from "@/ui/theme";

export default function ProductScreen() {
  const { id, lineId } = useLocalSearchParams<{
      id: string;
      lineId?: string;
    }>(),
    app = useApp(),
    router = useRouter();
  const product = app.catalog?.products.find((item) => item.id === id);
  const editing = app.cart.lines.find((line) => line.lineId === lineId);
  const [variantId, setVariant] = useState(
    editing?.variantId ??
      product?.variants?.find((v) => v.isDefault)?.id ??
      product?.variants?.[0]?.id,
  );
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      product?.modifierGroups?.map((group) => [
        group.id,
        editing
          ? editing.modifiers
              .filter((modifier) => modifier.groupId === group.id)
              .map((modifier) => modifier.optionId)
          : group.options
              .filter((option) => option.isDefault)
              .map((option) => option.id),
      ]) ?? [],
    ),
  );
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const variant = product?.variants?.find((item) => item.id === variantId);
  const chosen = useMemo(
    () =>
      product?.modifierGroups?.flatMap((group) =>
        (selected[group.id] ?? []).flatMap((id) => {
          const option = group.options.find((value) => value.id === id);
          return option
            ? [
                {
                  groupId: group.id,
                  optionId: option.id,
                  label: option.label,
                  priceDelta: option.priceDelta,
                },
              ]
            : [];
        }),
      ) ?? [],
    [product, selected],
  );
  if (!product)
    return (
      <Screen>
        <Empty
          title="Item unavailable"
          detail="This product is no longer in the current branch menu."
        />
      </Screen>
    );
  const choose = (
    groupId: string,
    optionId: string,
    multiple: boolean,
    max: number | null,
  ) =>
    setSelected((current) => {
      const values = current[groupId] ?? [];
      return {
        ...current,
        [groupId]: multiple
          ? values.includes(optionId)
            ? values.filter((id) => id !== optionId)
            : max && values.length >= max
              ? values
              : [...values, optionId]
          : [optionId],
      };
    });
  const add = async () => {
    for (const group of product.modifierGroups ?? []) {
      const count = selected[group.id]?.length ?? 0;
      if (count < group.minSelections || (group.required && count === 0))
        return Alert.alert(
          "Complete your choices",
          `Choose ${group.minSelections || 1} option from ${group.label}.`,
        );
    }
    const line: CartLine = {
      lineId:
        editing?.lineId ??
        `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      itemKind: "product",
      productId: product.id,
      variantId,
      name: product.name,
      variantName: variant?.name,
      image: product.image,
      unitEstimate:
        product.price +
        (variant?.priceDelta ?? 0) +
        chosen.reduce((s, o) => s + o.priceDelta, 0),
      quantity,
      modifiers: chosen,
    };
    if (editing) await app.editCartLine(editing.lineId, line);
    else await app.addToCart(line);
    router.back();
  };
  const estimate =
    (product.price +
      (variant?.priceDelta ?? 0) +
      chosen.reduce((s, o) => s + o.priceDelta, 0)) *
    quantity;
  const favourite = () => {
    if (!app.session) return router.push("/auth");
    void app.api
      .request("/favourites", {
        method: "POST",
        token: app.session.access_token,
        body: { productId: product.id },
      })
      .then(() => Alert.alert("Saved", "Added to favourites."))
      .catch((reason) => Alert.alert("Could not save", reason.message));
  };
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        {product.image ? (
          <Image source={{ uri: product.image }} style={styles.image} />
        ) : null}
        <Text style={styles.title}>{product.name}</Text>
        <Text style={styles.description}>{product.description}</Text>
        <Button
          kind="secondary"
          title={app.session ? "Add to favourites" : "Sign in to save"}
          onPress={favourite}
        />
        {product.variants?.length ? (
          <View style={styles.group}>
            <Text style={styles.heading}>Choose a variant</Text>
            {product.variants
              .filter((v) => v.available !== false)
              .map((item) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: variantId === item.id }}
                  key={item.id}
                  onPress={() => setVariant(item.id)}
                  style={[
                    styles.option,
                    variantId === item.id && styles.selected,
                  ]}
                >
                  <Text style={styles.optionText}>{item.name}</Text>
                  <Text>+ Rs {item.priceDelta}</Text>
                </Pressable>
              ))}
          </View>
        ) : null}
        {product.modifierGroups?.map((group) => (
          <View style={styles.group} key={group.id}>
            <Text style={styles.heading}>{group.label}</Text>
            <Text style={styles.help}>
              {group.required ? "Required" : "Optional"} · choose{" "}
              {group.minSelections}
              {group.maxSelections ? `–${group.maxSelections}` : "+"}
            </Text>
            {group.options
              .filter((o) => o.available !== false)
              .map((option) => {
                const checked = selected[group.id]?.includes(option.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    key={option.id}
                    onPress={() =>
                      choose(
                        group.id,
                        option.id,
                        group.selection === "multiple",
                        group.maxSelections,
                      )
                    }
                    style={[styles.option, checked && styles.selected]}
                  >
                    <Text style={styles.optionText}>
                      {checked ? "✓ " : ""}
                      {option.label}
                    </Text>
                    <Text>
                      {option.priceDelta
                        ? `+ Rs ${option.priceDelta}`
                        : "Included"}
                    </Text>
                  </Pressable>
                );
              })}
          </View>
        ))}
        <View style={styles.quantity}>
          <Button
            kind="secondary"
            title="−"
            accessibilityLabel="Decrease quantity"
            disabled={quantity === 1}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          />
          <Text style={styles.quantityText}>{quantity}</Text>
          <Button
            kind="secondary"
            title="+"
            accessibilityLabel="Increase quantity"
            onPress={() => setQuantity((q) => Math.min(20, q + 1))}
          />
        </View>
        <Button
          title={`${editing ? "Update item" : "Add to cart"} · Rs ${estimate.toLocaleString()}`}
          disabled={!product.available}
          onPress={() => void add()}
        />
      </ScrollView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  image: {
    width: "100%",
    height: 260,
    borderRadius: 22,
    resizeMode: "cover",
    backgroundColor: "#f4ece6",
  },
  title: { fontSize: 28, fontWeight: "900", color: colors.ink },
  description: { fontSize: 15, lineHeight: 22, color: colors.muted },
  group: { gap: 8, marginTop: 13 },
  heading: { fontSize: 18, fontWeight: "900", color: colors.ink },
  help: { color: colors.muted, fontSize: 12 },
  option: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selected: { borderColor: colors.primary, backgroundColor: "#fff3f0" },
  optionText: { fontWeight: "700", color: colors.ink },
  quantity: {
    marginVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  quantityText: { fontSize: 20, fontWeight: "900" },
});
