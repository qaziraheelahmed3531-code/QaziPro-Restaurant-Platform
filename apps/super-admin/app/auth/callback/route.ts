import { NextResponse } from "next/server"
import { activateInvitedPlatformStaff, bootstrapPlatformOwner, getPlatformContext } from "@/lib/auth"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/login?error=configuration", url.origin))
  const code = url.searchParams.get("code")
  if (!code) return NextResponse.redirect(new URL("/login?error=callback", url.origin))
  const responseHeaders = new Headers()
  const supabase = await createClient(responseHeaders)
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (!error) {
    const activated = await activateInvitedPlatformStaff()
    if (!activated) await bootstrapPlatformOwner()
  }
  const context = error ? null : await getPlatformContext()
  const response = NextResponse.redirect(new URL(error ? "/login?error=callback" : context ? "/" : "/login?error=unauthorized", url.origin))
  responseHeaders.forEach((value, name) => response.headers.set(name, value))
  return response
}
