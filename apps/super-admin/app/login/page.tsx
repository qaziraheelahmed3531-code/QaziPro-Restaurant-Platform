import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getPlatformContext } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/supabase/server"
import { getPlatformAuthCallbackUrl } from "@/lib/public-origin"

const messages: Record<string, string> = {
  configuration: "Platform authentication is not configured for this environment.",
  unauthorized: "This account is authenticated but has no active QaziPro platform access.",
  callback: "The secure sign-in callback could not be completed.",
  migration: "The Super Admin database foundation has not been applied to this environment.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const context = await getPlatformContext()
  if (context) redirect("/")
  const configured = isSupabaseConfigured()
  let googleStatus: "enabled" | "disabled" | "invalid-client" | "unknown" = "unknown"
  if (configured) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        cache: "no-store",
      })
      if (response.ok) {
        const settings = await response.json() as { external?: { google?: boolean } }
        googleStatus = settings.external?.google === true ? "enabled" : "disabled"
        if (googleStatus === "enabled") {
          const authorize = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize?provider=google`, {
            redirect: "manual",
            cache: "no-store",
          })
          const location = authorize.headers.get("location")
          if (authorize.status >= 300 && authorize.status < 400 && location) {
            const clientId = new URL(location).searchParams.get("client_id") ?? ""
            if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) googleStatus = "invalid-client"
          } else {
            googleStatus = "unknown"
          }
        }
      }
    } catch {
      googleStatus = "unknown"
    }
  }
  const initialError = params.error === "configuration" && configured ? "" : messages[params.error ?? ""]
  return <main className="login-page"><LoginForm authCallbackUrl={getPlatformAuthCallbackUrl()} initialError={initialError} googleStatus={googleStatus}/></main>
}
