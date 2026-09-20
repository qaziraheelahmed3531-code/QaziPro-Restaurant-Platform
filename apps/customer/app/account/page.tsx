import type { Metadata } from "next"

import { AccountPage } from "@/components/account/account-page"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSnapshot()
  return {
    title: `Account | ${storefront.business.name}`,
    description: "Sign in to save addresses, view orders and checkout faster.",
  }
}

const callbackErrors: Record<string, string> = {
  configuration: "Sign-in is temporarily unavailable. Please try again later.",
  oauth_cancelled: "Google sign-in was cancelled. You can try again when ready.",
  oauth_callback: "Google sign-in could not be completed. Please try again.",
}

export default async function Page({ searchParams }: { searchParams: Promise<{ authError?: string }> }) {
  const params = await searchParams
  let user = null

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  return <AccountPage initialUser={user} initialError={callbackErrors[params.authError ?? ""]} />
}
