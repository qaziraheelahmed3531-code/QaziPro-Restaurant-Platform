import { NextResponse } from "next/server"

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account"
  return value
}

function redirectTo(requestUrl: URL, path: string) {
  return NextResponse.redirect(new URL(path, requestUrl.origin))
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = safeNextPath(requestUrl.searchParams.get("next"))

  if (!isSupabaseConfigured()) {
    return redirectTo(requestUrl, "/account?authError=configuration")
  }

  if (!code) {
    return redirectTo(requestUrl, "/account?authError=oauth_cancelled")
  }

  const authHeaders = new Headers()
  const supabase = await createClient(authHeaders)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return redirectTo(requestUrl, "/account?authError=oauth_callback")
  }

  const response = redirectTo(requestUrl, next)
  authHeaders.forEach((value, name) => response.headers.set(name, value))
  return response
}
