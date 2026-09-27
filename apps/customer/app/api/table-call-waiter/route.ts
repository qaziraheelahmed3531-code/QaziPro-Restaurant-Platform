import { NextRequest, NextResponse } from "next/server"
import { consumeRateLimit } from "@/lib/api/v1"
import { createClient } from "@/lib/supabase/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

const headers = { "Cache-Control": "private, no-store" }

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response(null, { status: 403 })
  const storefront = await getStorefrontSnapshot()
  const table = storefront.tableContext
  if (!table || !table.waiterCallEnabled || storefront.resolutionError) {
    return NextResponse.json({ error: "Waiter calls aren't available for this table." }, { status: 404, headers })
  }
  try {
    const allowed = await consumeRateLimit(request, "table-waiter-call", 6, 60, `${storefront.business.id}:${table.branchId}`)
    if (!allowed) return NextResponse.json({ error: "Please wait a moment before calling again." }, { status: 429, headers })
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("request_table_waiter", { p_business_id: storefront.business.id, p_token: table.token })
    if (error) {
      const cooldown = error.code === "P0001"
      return NextResponse.json({ error: cooldown ? "Please wait before calling again." : "We couldn't call a waiter right now. Please try again." }, { status: cooldown ? 429 : 503, headers })
    }
    return NextResponse.json({ status: data?.status ?? "PENDING", alreadyOpen: Boolean(data?.alreadyOpen) }, { headers })
  } catch {
    return NextResponse.json({ error: "We couldn't call a waiter right now. Please try again." }, { status: 503, headers })
  }
}
