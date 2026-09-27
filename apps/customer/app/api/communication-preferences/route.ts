import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
async function context() {
  const [db, storefront] = await Promise.all([createClient(), getStorefrontSnapshot()])
  const { data: { user } } = await db.auth.getUser()
  if (!user || !storefront.business.id || storefront.orderPersistence !== "database") return null
  return { db, user, businessId: storefront.business.id }
}
export async function GET() {
  try {
    const value = await context()
    if (!value) return json({ error: "Sign in to this restaurant to manage emails." }, 401)
    const { data, error } = await value.db.from("storefront_customer_memberships").select("email_marketing_opt_in").eq("business_id", value.businessId).eq("user_id", value.user.id).maybeSingle()
    if (error) throw error
    return json({ emailOffers: data?.email_marketing_opt_in === true })
  } catch { return json({ error: "Email preferences could not be loaded. Please retry." }, 503) }
}
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return json({ error: "Invalid request origin." }, 403)
  try {
    const value = await context()
    if (!value) return json({ error: "Sign in to this restaurant to manage emails." }, 401)
    const body = await request.json() as { emailOffers?: unknown }
    if (typeof body?.emailOffers !== "boolean") return json({ error: "Choose whether to receive restaurant offers." }, 400)
    const { data, error } = await value.db.rpc("set_customer_email_consent", { p_business_id: value.businessId, p_enabled: body.emailOffers })
    if (error) throw error
    return json({ emailOffers: data === true })
  } catch { return json({ error: "Your email preference could not be saved. Please retry." }, 503) }
}
