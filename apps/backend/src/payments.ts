export type ProviderEnvironment = "TEST" | "LIVE"

export type CheckoutRequest = { orderId: string; amount: number; currency: string; idempotencyKey: string; returnUrl: string }
export type CheckoutResult = { providerTransactionId: string; redirectUrl?: string; status: "PENDING" | "AUTHORIZED" | "PAID" }
export type VerifiedWebhook = { eventId: string; providerTransactionId: string; status: "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED"; safeMetadata?: Record<string, string | number | boolean | null> }

export interface PaymentProviderAdapter {
  readonly provider: string
  readonly environment: ProviderEnvironment
  readonly configured: boolean
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedWebhook>
  getPaymentStatus(providerTransactionId: string): Promise<VerifiedWebhook["status"]>
  refundPayment(providerTransactionId: string, amount: number, reason: string): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }>
}

export class DisabledPaymentAdapter implements PaymentProviderAdapter {
  readonly configured = false
  constructor(readonly provider: string, readonly environment: ProviderEnvironment = "TEST") {}
  private unavailable(): never { throw new Error(`${this.provider} is not configured.`) }
  async createCheckout(): Promise<CheckoutResult> { return this.unavailable() }
  async verifyWebhook(): Promise<VerifiedWebhook> { return this.unavailable() }
  async getPaymentStatus(): Promise<VerifiedWebhook["status"]> { return this.unavailable() }
  async refundPayment(): Promise<{ providerRefundId: string; status: "PENDING" | "SUCCEEDED" }> { return this.unavailable() }
}

export function configuredPaymentProviders() {
  return {
    cash: { configured: true, environment: "LIVE" as const },
    safepay: new DisabledPaymentAdapter("Safepay"),
    payfast: new DisabledPaymentAdapter("PayFast"),
    jazzcash: new DisabledPaymentAdapter("JazzCash"),
    easypaisa: new DisabledPaymentAdapter("Easypaisa"),
  }
}
