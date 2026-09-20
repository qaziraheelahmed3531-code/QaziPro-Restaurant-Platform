import { NextRequest, NextResponse } from "next/server"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { assertCustomerMutationAllowed } from "@/lib/restrictions/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

async function current() {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? { supabase, user: data.user } : null
}

export async function GET() {
  const value = await current()
  if (!value) return NextResponse.json({ profile: null }, { status: 401 })
  const { data: profile, error } = await value.supabase.from("profiles").select("id,full_name,phone,avatar_url,gender,date_of_birth").eq("id", value.user.id).maybeSingle()
  if (error) return NextResponse.json({ error: "Profile could not be loaded." }, { status: 503 })
  const metadata = value.user.user_metadata ?? {}
  const seeded = profile && (!profile.full_name || !profile.avatar_url) ? (await value.supabase.from("profiles").update({ full_name: profile.full_name || metadata.full_name || metadata.name || null, avatar_url: profile.avatar_url || metadata.avatar_url || metadata.picture || null }).eq("id", value.user.id).select("id,full_name,phone,avatar_url,gender,date_of_birth").maybeSingle()).data ?? profile : profile
  return NextResponse.json({ profile: seeded ?? { id: value.user.id, full_name: null, phone: null, avatar_url: null, gender: null, date_of_birth: null } }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PATCH(request: NextRequest) {
  const value = await current()
  if (!value) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const storefront = await getStorefrontSnapshot()
  try { if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id,"access") }
  catch { return NextResponse.json({ error: "This account is currently restricted." }, { status: 403 }) }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const fullName = String(body?.fullName ?? "").trim().slice(0, 120)
  const phone = String(body?.phone ?? "").trim().slice(0, 40)
  const gender = String(body?.gender ?? "").trim().slice(0, 30) || null
  const dateOfBirth = String(body?.dateOfBirth ?? "").trim() || null
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return NextResponse.json({ error: "Date of birth is invalid." }, { status: 400 })
  const { data, error } = await value.supabase.from("profiles").update({ full_name: fullName || null, phone: phone || null, gender, date_of_birth: dateOfBirth }).eq("id", value.user.id).select("id,full_name,phone,avatar_url,gender,date_of_birth").single()
  return error ? NextResponse.json({ error: "Profile could not be updated." }, { status: 400 }) : NextResponse.json({ ok: true, profile: data })
}
