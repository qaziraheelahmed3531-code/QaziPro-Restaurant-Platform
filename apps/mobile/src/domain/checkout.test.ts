import { describe, expect, it, vi } from "vitest";
import { checkoutFingerprint, checkoutItems, createAttempt } from "./checkout";
import { addLine, emptyCart } from "./cart";
vi.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000001",
}));
const payload = {
  branchId: "b",
  serviceMode: "PICKUP" as const,
  paymentMethod: "CASH_ON_DELIVERY" as const,
  customerName: "A",
  customerPhone: "1",
  loyaltyCoinsToRedeem: 0,
  items: [],
};
describe("checkout idempotency", () => {
  it("fingerprints logical payload", () =>
    expect(checkoutFingerprint(payload)).toContain('"branchId":"b"'));
  it("creates mobile key", async () =>
    expect((await createAttempt(payload)).key).toBe(
      "mobile:00000000-0000-4000-8000-000000000001",
    ));
  it("reuses key for same retry", async () => {
    const first = await createAttempt(payload);
    expect(await createAttempt(payload, first)).toBe(first);
  });
  it("uses new attempt object after payload change", async () => {
    const first = await createAttempt(payload);
    expect(
      await createAttempt({ ...payload, customerPhone: "2" }, first),
    ).not.toBe(first);
  });
  it("keeps COD capability", async () =>
    expect((await createAttempt(payload)).payload.paymentMethod).toBe(
      "CASH_ON_DELIVERY",
    ));
  it("preserves variant and modifier identifiers", () => {
    const cart = addLine(emptyCart("r", "b"), {
      lineId: "1",
      itemKind: "product",
      productId: "p",
      variantId: "v",
      name: "P",
      image: "",
      unitEstimate: 1,
      quantity: 2,
      modifiers: [{ groupId: "g", optionId: "o", label: "O", priceDelta: 1 }],
    });
    expect(checkoutItems(cart)[0]).toEqual({
      itemKind: "product",
      productId: "p",
      variantId: "v",
      quantity: 2,
      modifiers: [{ groupId: "g", optionId: "o" }],
    });
  });
});
