import { NextResponse } from "next/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const [storefront, supabase] = await Promise.all([getStorefrontSnapshot(), createClient()])
    const { data: claims } = await supabase.auth.getClaims()
    if (!claims?.claims?.sub) return NextResponse.json({ error: "Sign in to view your rewards wallet." }, { status: 401 })
    if (!storefront.business.id) return NextResponse.json({ error: "Rewards are temporarily unavailable." }, { status: 503 })
    const { data, error } = await supabase.rpc("customer_loyalty_wallet", { p_business_id: storefront.business.id })
    if (error) throw error
    return NextResponse.json({ wallet: data }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Rewards wallet could not be loaded." }, { status: 503 })
  }
}
