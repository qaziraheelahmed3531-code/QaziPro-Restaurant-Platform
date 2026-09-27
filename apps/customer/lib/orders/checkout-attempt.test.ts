import { describe, expect, it } from "vitest"
import { checkoutAttempt, completeCheckoutAttempt } from "./checkout-attempt"
function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
describe("checkout retry identity", () => {
  it("reuses the same key on double submit and after remount/refresh", () => {
    const storage = memoryStorage()
    const first = checkoutAttempt("a", "branch-a", storage)
    expect(checkoutAttempt("a", "branch-a", storage)).toBe(first)
    expect(checkoutAttempt("a", "branch-a", storage)).toBe(first)
  })
  it("isolates restaurants and branches", () => {
    const storage = memoryStorage()
    const first = checkoutAttempt("a", "branch-a", storage)
    expect(checkoutAttempt("b", "branch-a", storage)).not.toBe(first)
    expect(checkoutAttempt("a", "branch-b", storage)).not.toBe(first)
  })
  it("creates a new intention only after confirmed completion", () => {
    const storage = memoryStorage()
    const first = checkoutAttempt("a", "branch-a", storage)
    completeCheckoutAttempt("a", "branch-a", storage)
    expect(checkoutAttempt("a", "branch-a", storage)).not.toBe(first)
  })
  it("does not allow an unpersisted request", () => {
    const storage = { getItem: () => null, setItem: () => { throw Error("storage blocked") } } as unknown as Storage
    expect(() => checkoutAttempt("a", "branch-a", storage)).toThrow("storage blocked")
  })
})
