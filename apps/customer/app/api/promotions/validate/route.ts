import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code?: unknown; subtotal?: unknown }
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase().slice(0, 40) : ""
    const subtotal = Number(body.subtotal)
    if (!code || !Number.isInteger(subtotal) || subtotal < 0 || subtotal > 100_000_000) return NextResponse.json({ valid: false, discount: 0 }, { status: 400 })
    const storefront = await getStorefrontSnapshot()
    if (storefront.orderPersistence === "local-demo") return NextResponse.json({ valid: code === "PIZZA200", discount: code === "PIZZA200" ? Math.min(200, subtotal) : 0 })
    if (storefront.orderPersistence === "unavailable") return NextResponse.json({ valid: false, discount: 0 }, { status: 503 })
    const { data } = await createAdminClient().from("promotions").select("discount_type,discount_value,maximum_discount,starts_at,ends_at").eq("business_id", storefront.business.id!).eq("code", code).eq("is_active", true).limit(1).maybeSingle()
    const now = Date.now()
    if (!data || (data.starts_at && Date.parse(data.starts_at) > now) || (data.ends_at && Date.parse(data.ends_at) <= now)) return NextResponse.json({ valid: false, discount: 0 })
    let discount = data.discount_type === "PERCENT" ? Math.floor(subtotal * Number(data.discount_value) / 100) : Number(data.discount_value)
    if (data.maximum_discount !== null) discount = Math.min(discount, Number(data.maximum_discount))
    discount = Math.max(0, Math.min(subtotal, discount))
    return NextResponse.json({ valid: true, discount })
  } catch {
    return NextResponse.json({ valid: false, discount: 0, error: "Promo validation is temporarily unavailable." }, { status: 503 })
  }
}
