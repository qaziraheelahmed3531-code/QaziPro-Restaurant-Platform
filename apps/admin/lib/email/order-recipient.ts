import "server-only"

import { createClient } from "@supabase/supabase-js"

const normalizeEmail = (value: string | null | undefined) => {
  const email = value?.trim().toLowerCase() ?? ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

/**
 * A signed-in customer's verified auth email is authoritative. The email
 * typed into checkout is used only for genuine guest orders.
 */
export async function resolveOrderRecipient(order: {
  customer_id?: string | null
  customer_email?: string | null
}) {
  const fallback = normalizeEmail(order.customer_email)
  if (!order.customer_id) return fallback

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return fallback

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.getUserById(order.customer_id)
  if (error) return fallback
  return normalizeEmail(data.user?.email) ?? fallback
}
