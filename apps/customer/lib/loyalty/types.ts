export type LoyaltyTransaction = {
  id: string
  order_id: string | null
  transaction_type: "EARN" | "REDEEM" | "REDEEM_REFUND" | "MANUAL_CREDIT" | "MANUAL_DEBIT"
  coins: number
  pkr_value: number
  description: string
  created_at: string
}

export type LoyaltyWalletSnapshot = {
  enabled: boolean
  programName: string
  coinName: string
  coinValuePkr: number
  showEarningMessage: boolean
  redemptionEnabled: boolean
  minimumRedeemCoins: number
  maxRedeemPercent: number
  balanceCoins: number
  balancePkr: number
  lifetimeEarned: number
  completedOrders: number
  tier: "MEMBER" | "LOYAL" | "VIP"
  startEarningOrder: number
  loyalOrderThreshold: number
  vipOrderThreshold: number
  nextTierAt: number | null
  transactions: LoyaltyTransaction[]
}
