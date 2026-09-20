/**
 * Backend boundary documentation.
 *
 * Runtime APIs live beside their Next.js consumers so Supabase sessions,
 * cache invalidation and Vercel functions remain deployment-local. Shared,
 * runtime-neutral contracts and commerce rules live in packages/shared.
 */
export const backendArchitecture = "supabase-and-next-route-handlers" as const

export { calculateDeliveryFee } from "@italian-pizza/shared/commerce"
export type { CreateOrderInput, OrderStatus, StaffRole } from "@italian-pizza/shared/contracts"
export * from "./payments.js"
