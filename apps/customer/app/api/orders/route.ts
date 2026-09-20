import { NextRequest, NextResponse } from "next/server"

import { createOrder, currentUserId, listCustomerOrders, type OrderInput } from "@/lib/orders/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { consumeRateLimit } from "@/lib/api/v1"

export async function GET() {
  try {
    const userId = await currentUserId()
    return NextResponse.json({ ok: true, authenticated: Boolean(userId), orders: userId ? await listCustomerOrders() : [] }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ ok: false, error: "Orders could not be loaded." }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    if (raw.length > 100_000) return NextResponse.json({ ok: false, error: "Order request is too large." }, { status: 413 })
    const input = JSON.parse(raw) as OrderInput
    if (!await consumeRateLimit(request,"checkout",10,60,input.branchId??"unresolved")) return NextResponse.json({ ok: false, error: "Too many order attempts. Please wait a minute and retry." }, { status: 429 })
    const order = await createOrder(input, await getStorefrontSnapshot())
    return NextResponse.json({ ok: true, order }, { status: 201, headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "The order could not be placed."
    const message = /gen_random_bytes|postgres|postgrest|pgrst|relation .* does not exist|column .* does not exist|function .* does not exist/i.test(rawMessage)
      ? "We couldn't place the order right now. Please try again shortly."
      : rawMessage
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
