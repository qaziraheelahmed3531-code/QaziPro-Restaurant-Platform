/** Only a random request key is persisted; never contact details or auth tokens. */
const keyFor = (businessId: string, branchId: string) => `qp-checkout-attempt-v1:${businessId}:${branchId}`
type AttemptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export function checkoutAttempt(businessId: string, branchId: string, storage: AttemptStorage = window.sessionStorage): string {
  const key = keyFor(businessId, branchId)
  const existing = storage.getItem(key)
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing
  const id = crypto.randomUUID()
  // Fail before sending if persistence is unavailable. A reload must not turn
  // an uncertain response into a new order with a fresh request key.
  storage.setItem(key, id)
  return id
}
export function completeCheckoutAttempt(businessId: string, branchId: string, storage: AttemptStorage = window.sessionStorage) {
  storage.removeItem(keyFor(businessId, branchId))
}
