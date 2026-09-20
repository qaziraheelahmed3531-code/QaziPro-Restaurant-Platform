import { NextResponse } from "next/server"

import { getAdminContext } from "@/lib/auth"

export async function POST() {
  const context = await getAdminContext()
  if (!context || !(context.role === "OWNER" || context.permissions.some(permission => ["menu.manage","business.manage","products.manage","categories.manage","deals.manage","banners.manage","branding.manage","content.manage","social.manage","reviews.manage","modifiers.manage","delivery.manage","branches.manage","hours.manage"].includes(permission)))) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const customerUrl = process.env.CUSTOMER_APP_URL
  const secret = process.env.REVALIDATION_SECRET
  if (!customerUrl || !secret) return NextResponse.json({ ok: true, revalidated: false })

  try {
    const response = await fetch(new URL("/api/revalidate", customerUrl), {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    })
    return NextResponse.json({ ok: response.ok, revalidated: response.ok }, { status: response.ok ? 200 : 502 })
  } catch {
    return NextResponse.json({ ok: false, revalidated: false }, { status: 502 })
  }
}
