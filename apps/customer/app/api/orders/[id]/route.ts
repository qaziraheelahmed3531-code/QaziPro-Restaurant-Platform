import { NextRequest, NextResponse } from "next/server"

import { getAccessibleOrder } from "@/lib/orders/server"

export async function GET(request: NextRequest, { params }: RouteContext<"/api/orders/[id]">) {
  const { id } = await params
  try {
    const order = await getAccessibleOrder(id.toUpperCase(), request.headers.get("x-order-token"))
    return order
      ? NextResponse.json({ ok: true, order }, { headers: { "Cache-Control": "private, no-store" } })
      : NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 })
  } catch {
    return NextResponse.json({ ok: false, error: "Order could not be loaded." }, { status: 503 })
  }
}
