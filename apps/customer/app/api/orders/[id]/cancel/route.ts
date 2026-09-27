import { NextRequest, NextResponse } from "next/server"

import { cancelAccessibleOrder } from "@/lib/orders/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function POST(request: NextRequest, { params }: RouteContext<"/api/orders/[id]/cancel">) {
  const { id } = await params
  try {
    const storefront = await getStorefrontSnapshot()
    const result = storefront.business.id && storefront.orderPersistence === "database"
      ? await cancelAccessibleOrder(id.toUpperCase(), request.headers.get("x-order-token"), undefined, storefront.business.id)
      : null
    return result ? NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 })
  } catch {
    const message = "This order could not be cancelled. Refresh its status and try again."
    return NextResponse.json({ ok: false, error: message }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
  }
}
