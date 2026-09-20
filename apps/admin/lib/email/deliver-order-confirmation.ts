import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { sendOrderConfirmation, type OrderEmail } from "@/lib/email/order-confirmation"
import { resolveOrderRecipient } from "@/lib/email/order-recipient"

type ConfirmationOrder = OrderEmail & {
  id: string
  business_id: string
  customer_id?: string | null
}

export async function deliverOrderConfirmation(
  db: SupabaseClient,
  order: ConfirmationOrder,
) {
  const recipient = await resolveOrderRecipient(order)
  if (!recipient) return "SKIPPED" as const

  if (order.customer_email?.trim().toLowerCase() !== recipient) {
    await db.from("orders").update({ customer_email: recipient }).eq("id", order.id)
  }

  // A previous implementation could queue the checkout form value. Keep sent
  // rows as audit history, but remove unsent stale recipients for this event.
  await db
    .from("order_notifications")
    .delete()
    .eq("order_id", order.id)
    .eq("event_type", "ORDER_CONFIRMED")
    .neq("recipient", recipient)
    .in("status", ["PENDING", "FAILED", "SKIPPED"])

  await db.from("order_notifications").upsert(
    {
      business_id: order.business_id,
      order_id: order.id,
      event_type: "ORDER_CONFIRMED",
      recipient,
    },
    { onConflict: "order_id,event_type,recipient", ignoreDuplicates: true },
  )

  const { data: notification } = await db
    .from("order_notifications")
    .select("id,status,attempts")
    .eq("order_id", order.id)
    .eq("event_type", "ORDER_CONFIRMED")
    .eq("recipient", recipient)
    .maybeSingle()

  if (notification?.status === "SENT" || notification?.status === "SKIPPED")
    return notification.status
  if (!notification) return "PENDING" as const

  const { data: claimed } = await db
    .from("order_notifications")
    .update({
      status: "SENDING",
      attempts: Number(notification.attempts || 0) + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", notification.id)
    .in("status", ["PENDING", "FAILED"])
    .select("id")
    .maybeSingle()
  if (!claimed) return "PENDING" as const

  const { data: branding } = await db
    .from("business_branding")
    .select("logo_url,primary_color")
    .eq("business_id", order.business_id)
    .maybeSingle()
  const sent = await sendOrderConfirmation(
    { ...order, customer_email: recipient },
    { logoUrl: branding?.logo_url, primaryColor: branding?.primary_color },
  )
  await db
    .from("order_notifications")
    .update({
      status: sent.status,
      provider_message_id: sent.status === "SENT" ? sent.messageId : null,
      sent_at: sent.status === "SENT" ? new Date().toISOString() : null,
      last_error:
        sent.status === "FAILED" || sent.status === "SKIPPED" ? sent.error : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimed.id)
  return sent.status
}
