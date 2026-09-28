export type PosOrderMode = "TAKEAWAY" | "PICKUP" | "DINE_IN" | "DELIVERY";
export type PosSelection = {
  groupId: string;
  optionId: string;
  label: string;
  price: number;
};
export type PosCartLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  selections: PosSelection[];
  itemKind?: "product" | "deal";
  variantId?: string;
  variantName?: string;
};
export type PosFulfilment = {
  mode: PosOrderMode;
  tableId: string;
  deliveryAreaId: string;
  deliveryAddress: string;
  distanceKm: string;
  promoCode: string;
};
export const emptyFulfilment: PosFulfilment = {
  mode: "TAKEAWAY",
  tableId: "",
  deliveryAreaId: "",
  deliveryAddress: "",
  distanceKm: "",
  promoCode: "",
};
export type PosDraft = {
  cart: PosCartLine[];
  customer: string;
  phone: string;
  notes: string;
  fulfilment: PosFulfilment;
  clientReference: string;
  heldId: string | null;
  pendingPayload: Record<string, unknown> | null;
};
export function validPosDraft(value: unknown): value is PosDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as PosDraft;
  return (
    Array.isArray(draft.cart) &&
    draft.cart.length <= 50 &&
    draft.cart.every(
      (line) =>
        line != null &&
        typeof line === "object" &&
        typeof line.lineId === "string" &&
        typeof line.productId === "string" &&
        typeof line.name === "string" &&
        Number.isFinite(line.unitPrice) &&
        Number.isInteger(line.quantity) &&
        line.quantity >= 1 &&
        line.quantity <= 50 &&
        Array.isArray(line.selections) &&
        line.selections.every(
          (option) =>
            option != null &&
            typeof option === "object" &&
            typeof option.groupId === "string" &&
            typeof option.optionId === "string" &&
            typeof option.label === "string" &&
            Number.isFinite(option.price),
        ),
    ) &&
    typeof draft.customer === "string" &&
    typeof draft.phone === "string" &&
    typeof draft.notes === "string" &&
    typeof draft.clientReference === "string" &&
    /^[A-Za-z0-9._:-]{8,124}$/.test(draft.clientReference) &&
    (draft.heldId === null || typeof draft.heldId === "string") &&
    (draft.pendingPayload === null || (typeof draft.pendingPayload === "object" && !Array.isArray(draft.pendingPayload))) &&
    Boolean(draft.fulfilment) &&
    ["TAKEAWAY", "PICKUP", "DINE_IN", "DELIVERY"].includes(
      draft.fulfilment.mode,
    ) &&
    [
      draft.fulfilment.tableId,
      draft.fulfilment.deliveryAreaId,
      draft.fulfilment.deliveryAddress,
      draft.fulfilment.distanceKm,
      draft.fulfilment.promoCode,
    ].every((value) => typeof value === "string")
  );
}
export function mergePosLine(rows: PosCartLine[], line: PosCartLine) {
  const signature = (item: PosCartLine) =>
    JSON.stringify([
      item.itemKind ?? "product",
      item.productId,
      item.variantId ?? "",
      item.unitPrice,
      item.selections
        .map((option) => [option.groupId, option.optionId, option.price])
        .sort(),
    ]);
  const match = rows.find(
    (row) =>
      signature(row) === signature(line) && row.quantity + line.quantity <= 50,
  );
  return match
    ? rows.map((row) =>
        row.lineId === match.lineId
          ? { ...row, quantity: row.quantity + line.quantity }
          : row,
      )
    : rows.length < 50
      ? [...rows, line]
      : rows;
}
export function posError(
  error: { message?: string; code?: string } | null | undefined,
) {
  const message = error?.message?.toLowerCase() ?? "";
  if (message.includes("sale was reversed"))
    return "This sale was voided or refunded. Review it in Receipts; do not collect payment again.";
  if (error?.code === "42501")
    return "Your access changed. Refresh POS or contact your manager.";
  if (message.includes("register shift"))
    return "Open your counter shift before collecting payment.";
  if (message.includes("cash received"))
    return "Cash received is below the current total. Review the amount and retry.";
  if (message.includes("open bill"))
    return "This table already has an open bill. Open its existing order instead.";
  if (message.includes("closed") || message.includes("not accepting"))
    return "This branch is currently closed for ordering.";
  if (
    message.includes("unavailable") ||
    message.includes("modifier") ||
    message.includes("variant")
  )
    return "An item or selection is no longer available. Refresh the menu and review the order.";
  if (message.includes("reference"))
    return "Check the payment reference and the original sale before retrying.";
  return "We couldn't complete this action. Your order is still saved; please retry.";
}
