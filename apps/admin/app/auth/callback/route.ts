import { accessReasonQuery, adminHome, getAdminAccessResolution, getAdminContext } from "@/lib/auth"
import { NextResponse } from "next/server"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/login?error=configuration", url.origin))
  const code = url.searchParams.get("code")
  if (!code) return NextResponse.redirect(new URL("/login?error=callback", url.origin))
  const headers = new Headers()
  const supabase = await createClient(headers)
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (!error) await supabase.rpc("claim_staff_invitations")
  const context = error ? null : await getAdminContext()
  const access = error ? null : await getAdminAccessResolution()
  const isRecovery = url.searchParams.get("type") === "recovery"
  const destination = error ? "/login?error=callback" : isRecovery ? "/auth/reset" : context ? adminHome(context) : `/login?error=${accessReasonQuery(access?.reason ?? "UNKNOWN")}`
  const response = NextResponse.redirect(new URL(destination, url.origin))
  response.headers.set("Cache-Control", "private, no-store")
  headers.forEach((value, name) => response.headers.set(name, value))
  return response
}
