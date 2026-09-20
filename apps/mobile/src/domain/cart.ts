import type { Cart, CartLine, Catalog, OrderDetail } from "@/contracts/types";

export const emptyCart = (restaurantKey: string, branchId: string): Cart => ({
  restaurantKey,
  branchId,
  lines: [],
  loyaltyCoins: 0,
  updatedAt: new Date().toISOString(),
});
export const cartEstimate = (cart: Cart) =>
  cart.lines.reduce((sum, line) => sum + line.unitEstimate * line.quantity, 0);
export const addLine = (cart: Cart, line: CartLine): Cart => ({
  ...cart,
  lines: [...cart.lines, line],
  updatedAt: new Date().toISOString(),
});
export const replaceLine = (
  cart: Cart,
  lineId: string,
  replacement: CartLine,
): Cart => ({
  ...cart,
  lines: cart.lines.map((line) =>
    line.lineId === lineId ? { ...replacement, lineId } : line,
  ),
  updatedAt: new Date().toISOString(),
});
export const updateLine = (
  cart: Cart,
  lineId: string,
  quantity: number,
): Cart => ({
  ...cart,
  lines:
    quantity < 1
      ? cart.lines.filter((line) => line.lineId !== lineId)
      : cart.lines.map((line) =>
          line.lineId === lineId ? { ...line, quantity } : line,
        ),
  updatedAt: new Date().toISOString(),
});
export const clearCart = (cart: Cart, branchId = cart.branchId) =>
  emptyCart(cart.restaurantKey, branchId);
export const validateCart = (cart: Cart, catalog: Catalog) =>
  cart.lines.every((line) => {
    if (line.itemKind === "deal")
      return catalog.deals.some(
        (item) => item.id === line.productId && item.available !== false,
      );
    const product = catalog.products.find(
      (item) => item.id === line.productId && item.available,
    );
    if (!product) return false;
    if (
      line.variantId &&
      !product.variants?.some(
        (variant) =>
          variant.id === line.variantId && variant.available !== false,
      )
    )
      return false;
    return line.modifiers.every((selected) =>
      product.modifierGroups?.some(
        (group) =>
          group.id === selected.groupId &&
          group.options.some(
            (option) =>
              option.id === selected.optionId && option.available !== false,
          ),
      ),
    );
  });
export function reorderCart(
  current: Cart,
  detail: OrderDetail,
  catalog: Catalog,
): { cart: Cart; skipped: number } {
  const next = emptyCart(current.restaurantKey, detail.reorder.branchId);
  let skipped = 0;
  for (const item of detail.reorder.items) {
    const product = catalog.products.find(
      (value) => value.id === item.productId && value.available,
    );
    const deal = catalog.deals.find(
      (value) => value.id === item.productId && value.available !== false,
    );
    if (!product && !deal) {
      skipped++;
      continue;
    }
    const variant = product?.variants?.find(
      (value) => value.id === item.variantId && value.available !== false,
    );
    if (item.variantId && !variant) {
      skipped++;
      continue;
    }
    const modifiers = item.modifiers.flatMap((selected) => {
      const group = product?.modifierGroups?.find(
        (value) => value.id === selected.groupId,
      );
      const option = group?.options.find(
        (value) => value.id === selected.optionId && value.available !== false,
      );
      return group && option
        ? [{ ...selected, label: option.label, priceDelta: option.priceDelta }]
        : [];
    });
    if (modifiers.length !== item.modifiers.length) {
      skipped++;
      continue;
    }
    next.lines.push({
      lineId: `reorder-${Date.now()}-${next.lines.length}`,
      itemKind: item.itemKind,
      productId: item.productId,
      variantId: item.variantId,
      name: product?.name ?? deal!.name,
      variantName: variant?.name,
      image: product?.image ?? deal!.image,
      unitEstimate:
        (product?.price ?? deal!.price) +
        (variant?.priceDelta ?? 0) +
        modifiers.reduce((sum, value) => sum + value.priceDelta, 0),
      quantity: item.quantity,
      modifiers,
    });
  }
  return { cart: { ...next, updatedAt: new Date().toISOString() }, skipped };
}
