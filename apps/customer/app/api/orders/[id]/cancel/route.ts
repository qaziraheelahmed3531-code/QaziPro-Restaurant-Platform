import { NextRequest, NextResponse } from "next/server"

import { cancelAccessibleOrder } from "@/lib/orders/server"

export async function POST(request: NextRequest, { params }: RouteContext<"/api/orders/[id]/cancel">) {
  const { id } = await params
  try {
    const result = await cancelAccessibleOrder(id.toUpperCase(), request.headers.get("x-order-token"))
    return result ? NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "This order can no longer be cancelled."
    return NextResponse.json({ ok: false, error: message }, { status: 409, headers: { "Cache-Control": "private, no-store" } })
  }
}
