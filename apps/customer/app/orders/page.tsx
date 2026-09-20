import type { Metadata } from "next"

import { OrdersPage } from "@/components/orders/orders-page"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSnapshot()
  return {
    title: `Your Orders | ${storefront.business.name}`,
    description: "View your current and previous orders.",
  }
}

export default function Page() {
  return <OrdersPage />
}
