import { describe, expect, it, vi } from "vitest"
import { deliverExternalInvitation, isSyntheticQaEmail } from "@italian-pizza/shared"

describe("synthetic invitation delivery safety", () => {
  it.each([
    "qa-onboarding-123@staging.qazipro.invalid",
    "browser-owner@qa.example",
    "staff@example.test",
    "customer@arbitrary.invalid",
    " OWNER@nested.staging.invalid ",
  ])("suppresses %s without calling an external provider", async (recipient) => {
    const send = vi.fn(async () => ({}))
    const claim = vi.fn(async () => true)
    const complete = vi.fn(async () => undefined)
    const result = await deliverExternalInvitation({ recipient, claim, send, complete })
    expect(isSyntheticQaEmail(recipient)).toBe(true)
    expect(result).toMatchObject({ attempted: false, claimed: true, status: "SUPPRESSED" })
    expect(claim).toHaveBeenCalledOnce()
    expect(claim).toHaveBeenCalledWith("SUPPRESSED")
    expect(send).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it("sends one real manual staging invitation", async () => {
    const send = vi.fn(async () => ({}))
    const result = await deliverExternalInvitation({
      recipient: "manual-staging-inbox@gmail.com",
      claim: async () => true,
      send,
      complete: async () => undefined,
    })
    expect(result.status).toBe("SENT")
    expect(send).toHaveBeenCalledOnce()
  })

  it.each(["idempotent provisioning retry", "double submit"])("does not send on %s after the delivery claim is already held", async () => {
    const send = vi.fn(async () => ({}))
    const result = await deliverExternalInvitation({
      recipient: "manual-staging-inbox@gmail.com",
      claim: async () => false,
      send,
      complete: async () => undefined,
    })
    expect(result).toMatchObject({ attempted: false, claimed: false })
    expect(send).not.toHaveBeenCalled()
  })
})
