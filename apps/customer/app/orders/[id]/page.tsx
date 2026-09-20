import type { Metadata } from "next"

import { OrderTracking } from "@/components/orders/order-tracking"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSnapshot()
  return {
    title: `Track Order | ${storefront.business.name}`,
    description: `View the current status and details of your ${storefront.business.name} order.`,
  }
}

export default async function Page({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params
  return <OrderTracking orderId={id.toUpperCase()} />
}
