import * as Crypto from "expo-crypto";
import type { Cart, CheckoutPayload } from "@/contracts/types";

export type CheckoutAttempt = {
  key: string;
  fingerprint: string;
  payload: CheckoutPayload;
  createdAt: string;
};
export const checkoutFingerprint = (
  payload: Omit<CheckoutPayload, "idempotencyKey">,
) => JSON.stringify(payload);
export async function createAttempt(
  payload: Omit<CheckoutPayload, "idempotencyKey">,
  previous?: CheckoutAttempt | null,
) {
  const fingerprint = checkoutFingerprint(payload);
  if (previous?.fingerprint === fingerprint) return previous;
  const key = `mobile:${Crypto.randomUUID()}`;
  return {
    key,
    fingerprint,
    payload: { ...payload, idempotencyKey: key },
    createdAt: new Date().toISOString(),
  } satisfies CheckoutAttempt;
}
export const checkoutItems = (cart: Cart) =>
  cart.lines.map((line) => ({
    itemKind: line.itemKind,
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    modifiers: line.modifiers.map(({ groupId, optionId }) => ({
      groupId,
      optionId,
    })),
  }));
