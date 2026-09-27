import { NextResponse } from "next/server"

import { getAdminContext } from "@/lib/auth"
import { resolveCustomerOrigin } from "@/lib/customer-origin"
import { sendCustomerBroadcast } from "@/lib/email/customer-broadcast"
import { createClient } from "@/lib/supabase/server"

const allowed = (context: Awaited<ReturnType<typeof getAdminContext>>) => Boolean(context && (context.role === "OWNER" || context.permissions.includes("content.manage")))

export async function POST(request: Request) {
  const context = await getAdminContext()
  if (!allowed(context) || !context) return NextResponse.json({ error: "Customer messaging access denied." }, { status: 403 })
  let body: { subject?: unknown; message?: unknown; dealId?: unknown; requestId?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }) }
  const subject = typeof body.subject === "string" ? body.subject.trim() : ""
  const message = typeof body.message === "string" ? body.message.trim() : ""
  const dealId = typeof body.dealId === "string" && body.dealId ? body.dealId : null
  const requestId = typeof body.requestId === "string" ? body.requestId : ""
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) return NextResponse.json({ error: "A valid message request key is required. Refresh and try again." }, { status: 400 })
  if (subject.length < 3 || subject.length > 140 || message.length < 3 || message.length > 2000) return NextResponse.json({ error: "Add a subject and message within the displayed limits." }, { status: 400 })
  const { data, error } = await (await createClient()).rpc("create_customer_broadcast", { p_business_id: context.businessId, p_deal_id: dealId, p_subject: subject, p_message: message, p_request_id: requestId })
  if (error) return NextResponse.json({ error: "The message could not be prepared. Retry this unchanged draft with the same request key; if the problem persists, contact support." }, { status: 409 })
  return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(request: Request) {
  const context = await getAdminContext()
  if (!allowed(context) || !context) return NextResponse.json({ error: "Customer messaging access denied." }, { status: 403 })
  let id = ""
  try { const body = await request.json() as { id?: unknown }; id = typeof body.id === "string" ? body.id : "" } catch { /* handled below */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Choose a valid message campaign." }, { status: 400 })
  const db = await createClient()
  const { data: campaign, error: campaignError } = await db.from("customer_broadcasts").select("id,subject,message,deal_id,status").eq("id", id).eq("business_id", context.businessId).maybeSingle()
  if (campaignError || !campaign) return NextResponse.json({ error: "Message campaign was not found." }, { status: 404 })
  let customerOrigin: string
  try { customerOrigin = await resolveCustomerOrigin(db, context.businessId) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Customer website is unavailable." }, { status: 409 }) }
  // Resolve required context BEFORE claiming recipients; a configuration failure
  // must not leave deliveries marked SENDING when no attempt was made.
  const [{ data: branding, error: brandingError }, dealResult] = await Promise.all([
    db.from("business_branding").select("logo_url,primary_color").eq("business_id", context.businessId).maybeSingle(),
    campaign.deal_id ? db.from("deals").select("name,description,deal_price,image_url").eq("id", campaign.deal_id).eq("business_id", context.businessId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (brandingError || dealResult.error || (campaign.deal_id && !dealResult.data)) return NextResponse.json({ error: "The message branding or selected deal could not be loaded. No email was attempted." }, { status: 409 })
  const { data: claimed, error: claimError } = await db.rpc("claim_customer_broadcast_batch", { p_broadcast_id: id, p_limit: 20 })
  if (claimError) return NextResponse.json({ error: "The delivery queue could not be opened. Refresh the campaign before retrying." }, { status: 409 })
  const recipients = ((claimed ?? []) as Array<{ delivery_id: number; recipient: string }>).map((row) => ({ deliveryId: Number(row.delivery_id), recipient: String(row.recipient) }))
  if (recipients.length) {
    const deal = dealResult.data
    const results = await sendCustomerBroadcast({ subject: campaign.subject, message: campaign.message, restaurant: context.businessName, customerOrigin, logoUrl: branding?.logo_url, primaryColor: branding?.primary_color, deal: deal ? { name: deal.name, description: deal.description, price: deal.deal_price, imageUrl: deal.image_url } : null }, recipients)
    const saved = await Promise.all(results.map((result) => db.from("customer_broadcast_deliveries").update({ status: result.status, provider_message_id: result.status === "SENT" ? result.messageId : null, last_error: result.status === "FAILED" || result.status === "SKIPPED" ? result.error : null, sent_at: result.status === "SENT" ? new Date().toISOString() : null }).eq("id", result.deliveryId).eq("broadcast_id", id).eq("business_id", context.businessId).eq("status", "SENDING").select("id").maybeSingle()))
    if (saved.some(result => result.error || !result.data)) return NextResponse.json({ error: "Email was attempted, but delivery records could not be confirmed. Do not resend this campaign; ask support to reconcile provider logs first." }, { status: 409 })
  }
  const { data: deliveries, error: deliveriesError } = await db.from("customer_broadcast_deliveries").select("status,attempts,last_error").eq("broadcast_id", id).eq("business_id", context.businessId)
  if (deliveriesError || !deliveries) return NextResponse.json({ error: "Delivery totals could not be verified. Refresh the campaign; do not create a replacement message." }, { status: 503 })
  const sent = deliveries?.filter((row) => row.status === "SENT").length ?? 0
  const failed = deliveries?.filter((row) => row.status === "FAILED" || row.status === "SKIPPED").length ?? 0
  const remaining = deliveries.filter((row) => row.status === "PENDING" || row.status === "SENDING" || (row.status === "FAILED" && row.last_error === "Email provider is not configured." && Number(row.attempts) < 3)).length
  const status = remaining ? "SENDING" : failed ? (sent ? "PARTIAL" : "FAILED") : "SENT"
  const { data: savedCampaign, error: saveError } = await db.from("customer_broadcasts").update({ status, sent_count: sent, failed_count: failed, completed_at: remaining ? null : new Date().toISOString() }).eq("id", id).eq("business_id", context.businessId).select("id").maybeSingle()
  if (saveError || !savedCampaign) return NextResponse.json({ error: "Delivery totals could not be saved. Refresh this campaign before continuing." }, { status: 503 })
  return NextResponse.json({ id, status, sent, failed, remaining, processed: recipients.length }, { headers: { "Cache-Control": "no-store" } })
}
