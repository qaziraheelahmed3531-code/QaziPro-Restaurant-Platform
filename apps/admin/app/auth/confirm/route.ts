import { NextResponse } from "next/server"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { accessReasonQuery, adminHome, getAdminAccessResolution, getAdminContext } from "@/lib/auth"
import type { EmailOtpType } from "@supabase/supabase-js"

// Supabase Invite template: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
// Set SiteURL to the Admin deployment, or use its fixed approved URL in that template.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")
  if (!isSupabaseConfigured() || !tokenHash || (type !== "invite" && type !== "magiclink")) return NextResponse.redirect(new URL("/login?error=callback", url.origin))
  const headers = new Headers()
  const supabase = await createClient(headers)
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
  if (!error) await supabase.rpc("claim_staff_invitations")
  const context = error ? null : await getAdminContext()
  const access = error ? null : await getAdminAccessResolution()
  const response = NextResponse.redirect(new URL(error ? "/login?error=callback" : context ? adminHome(context) : `/login?error=${accessReasonQuery(access?.reason ?? "UNKNOWN")}`, url.origin))
  response.headers.set("Referrer-Policy", "no-referrer")
  response.headers.set("Cache-Control", "no-store")
  headers.forEach((value, name) => response.headers.set(name, value))
  if (!error && context) {
    const requestedBusiness = url.searchParams.get("business")
    const requestedBranch = url.searchParams.get("branch")
    const { data: membership } = requestedBusiness ? await supabase.from("staff_memberships").select("business_id").eq("business_id", requestedBusiness).eq("user_id", context.userId).eq("is_active", true).maybeSingle() : { data: null }
    if (membership?.business_id) response.cookies.set("ip-admin-business", String(membership.business_id), { path: "/", sameSite: "lax", maxAge: 31536000 })
    if (membership?.business_id && requestedBranch) {
      const { data: branch } = await supabase.from("branches").select("id").eq("id", requestedBranch).eq("business_id", membership.business_id).eq("is_active", true).maybeSingle()
      if (branch?.id) response.cookies.set("ip-admin-branch", String(branch.id), { path: "/", sameSite: "lax", maxAge: 31536000 })
    }
  }
  return response
}
