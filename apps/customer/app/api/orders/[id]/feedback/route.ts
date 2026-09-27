import { NextRequest, NextResponse } from "next/server"
import { getAccessibleOrder } from "@/lib/orders/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { consumeRateLimit } from "@/lib/api/v1"

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
async function authorizedOrder(request: NextRequest, id: string) {
  const storefront = await getStorefrontSnapshot()
  if (!storefront.business.id || storefront.orderPersistence !== "database") return null
  return getAccessibleOrder(id.toUpperCase(), request.headers.get("x-order-token"), undefined, storefront.business.id)
    .then(order => order ? { order, businessId: storefront.business.id! } : null)
}
export async function GET(request: NextRequest, { params }: RouteContext<"/api/orders/[id]/feedback">) {
  try {
    const context = await authorizedOrder(request, (await params).id)
    if (!context) return json({ error: "Order not found." }, 404)
    const { data, error } = await createAdminClient().from("customer_order_feedback").select("rating,comment,created_at")
      .eq("business_id", context.businessId).eq("order_id", context.order.id).maybeSingle()
    if (error) return json({ error: "Feedback is temporarily unavailable." }, 503)
    return json({ eligible: context.order.status === "DELIVERED", feedback: data })
  } catch { return json({ error: "Feedback could not be loaded." }, 503) }
}
export async function POST(request: NextRequest, { params }: RouteContext<"/api/orders/[id]/feedback">) {
  try {
    const id = (await params).id
    const raw = await request.text()
    if (raw.length > 12000) return json({ error: "Feedback is too long." }, 413)
    let body: { rating?: unknown; comment?: unknown }
    try { body = JSON.parse(raw) } catch { return json({ error: "Enter valid feedback." }, 400) }
    if (!body || !Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5 || typeof body.comment !== "string" || body.comment.length > 2000) return json({ error: "Choose 1–5 stars and a comment of at most 2000 characters." }, 400)
    const context = await authorizedOrder(request, id)
    if (!context) return json({ error: "Order not found." }, 404)
    if (context.order.status !== "DELIVERED") return json({ error: "Feedback opens after your order is completed." }, 409)
    if (!await consumeRateLimit(request, "order-feedback", 10, 3600, context.businessId)) return json({ error: "Please wait before trying again." }, 429)
    const { data, error } = await createAdminClient().rpc("submit_verified_order_feedback", {
      p_business_id: context.businessId, p_order_id: context.order.id, p_rating: body.rating, p_comment: body.comment.trim(),
    })
    if (error) return json({ error: "Feedback couldn't be saved. Please retry." }, 503)
    return json({ feedback: data })
  } catch { return json({ error: "Feedback couldn't be saved. Please retry." }, 503) }
}
