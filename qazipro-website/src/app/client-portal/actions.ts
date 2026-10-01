"use server"

import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getPortalApplication, getPortalSession } from "@/lib/client-portal"
import { platformServerClient } from "@/lib/platform-cms"
import { createPortalAuthClient } from "@/lib/supabase/server"

export type PortalActionState = {
  ok?: boolean
  sent?: boolean
  email?: string
  reference?: string
  message?: string
  error?: string
}

const accessSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  reference: z.string().trim().toUpperCase().regex(/^QP-[0-9]{8}-[A-Z0-9]{6}$/),
})

function publicAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

async function consumeRateLimit(scope: string, limit: number, seconds: number) {
  const admin = platformServerClient()
  if (!admin) return false
  const requestHeaders = await headers()
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  const key = createHash("sha256").update(`${scope}:${process.env.SUPABASE_SERVICE_ROLE_KEY}:${address}`).digest("hex")
  const result = await admin.rpc("consume_api_rate_limit", { p_key_hash: key, p_limit: limit, p_window_seconds: seconds })
  return !result.error && Boolean(result.data)
}

export async function requestPortalCodeAction(_state: PortalActionState, form: FormData): Promise<PortalActionState> {
  const parsed = accessSchema.safeParse({ email: form.get("email"), reference: form.get("reference") })
  if (!parsed.success) return { error: "Enter the email and application reference shown on your confirmation." }
  if (!(await consumeRateLimit("qazipro-client-portal-code", 5, 900))) {
    return { error: "Too many attempts. Please wait before requesting another code." }
  }
  const admin = platformServerClient()
  const auth = publicAuthClient()
  if (!admin || !auth) return { error: "Client Portal sign-in is temporarily unavailable." }
  const match = await admin
    .from("platform_onboarding_submissions")
    .select("id")
    .eq("reference", parsed.data.reference)
    .eq("portal_email", parsed.data.email)
    .eq("portal_enabled", true)
    .maybeSingle()

  // Keep the response intentionally generic so this endpoint cannot be used to
  // enumerate client email addresses or application references.
  if (match.data) {
    const delivery = await auth.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: true },
    })
    if (delivery.error) return { error: "We couldn't send the secure sign-in code right now. Please try again." }
  }
  return {
    sent: true,
    email: parsed.data.email,
    reference: parsed.data.reference,
    message: "If those details match an application, an 8-digit code is on its way.",
  }
}

export async function verifyPortalCodeAction(_state: PortalActionState, form: FormData): Promise<PortalActionState> {
  const parsed = accessSchema.extend({ token: z.string().regex(/^[0-9]{8}$/) }).safeParse({
    email: form.get("email"),
    reference: form.get("reference"),
    token: form.get("token"),
  })
  if (!parsed.success) return { error: "Enter the complete 8-digit verification code." }
  if (!(await consumeRateLimit("qazipro-client-portal-verify", 8, 900))) {
    return { error: "Too many verification attempts. Please wait and request a new code." }
  }
  const auth = await createPortalAuthClient()
  const verified = await auth.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.token, type: "email" })
  if (verified.error || !verified.data.user) return { error: "That code is incorrect or has expired." }
  const admin = platformServerClient()
  const ownership = admin
    ? await admin.from("platform_onboarding_submissions").select("id").eq("reference", parsed.data.reference).eq("portal_email", parsed.data.email).eq("portal_enabled", true).maybeSingle()
    : { data: null }
  if (!ownership.data) {
    await auth.auth.signOut()
    return { error: "We couldn't match this sign-in to the application." }
  }
  await admin?.from("platform_onboarding_submissions").update({ portal_last_accessed_at: new Date().toISOString() }).eq("id", ownership.data.id)
  redirect(`/client-portal/${parsed.data.reference}`)
}

export async function sendClientMessageAction(_state: PortalActionState, form: FormData): Promise<PortalActionState> {
  const reference = String(form.get("reference") || "").trim().toUpperCase()
  const body = String(form.get("message") || "").trim()
  if (!/^QP-[0-9]{8}-[A-Z0-9]{6}$/.test(reference) || body.length < 2 || body.length > 4000) {
    return { error: "Write a message between 2 and 4,000 characters." }
  }
  const [session, application] = await Promise.all([getPortalSession(), getPortalApplication(reference)])
  const admin = platformServerClient()
  if (!session || !application || !admin) return { error: "Your session has expired. Sign in again." }
  const insert = await admin.from("platform_onboarding_portal_messages").insert({
    submission_id: application.id,
    sender_kind: "CLIENT",
    message_type: "CLIENT_RESPONSE",
    body,
    client_user_id: session.userId,
    is_client_visible: true,
  })
  if (insert.error) return { error: "We couldn't send your response. Your text is still here." }
  await admin.from("platform_onboarding_submission_activity").insert({
    submission_id: application.id,
    action: "CLIENT_RESPONSE",
    detail: "The client sent requested information.",
    public_label: "Information sent",
    is_client_visible: true,
  })
  revalidatePath(`/client-portal/${reference}`)
  return { ok: true, message: "Your response was sent to QaziPro." }
}

export async function logoutPortalAction() {
  const auth = await createPortalAuthClient()
  await auth.auth.signOut()
  redirect("/client-portal")
}
