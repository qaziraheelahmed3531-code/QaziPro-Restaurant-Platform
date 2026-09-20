import { locationSource } from "@italian-pizza/shared/location"
import { validateDeliveryPoint } from "@/lib/location/validate-delivery"
import { NextRequest, NextResponse } from "next/server"

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"
import { assertCustomerMutationAllowed } from "@/lib/restrictions/server"

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ addresses: [] })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ addresses: [] })
  const { data, error } = await supabase.from("customer_addresses").select("*,delivery_areas(slug)").eq("customer_id", user.id).order("created_at")
  if (error) return NextResponse.json({ error: "Addresses could not be loaded." }, { status: 503 })
  const addresses = (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    city: row.city,
    areaId: Array.isArray(row.delivery_areas) ? row.delivery_areas[0]?.slug : row.delivery_areas?.slug,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    landmark: row.landmark,
    instructions: row.instructions,
    coordinates: row.latitude !== null && row.longitude !== null ? { latitude: Number(row.latitude), longitude: Number(row.longitude), source: locationSource(row.location_source) } : undefined,
  }))
  return NextResponse.json({ addresses }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to sync addresses." }, { status: 401 })
  const body = await request.json() as Record<string, unknown>
  const storefront = await getStorefrontSnapshot()
  try { if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id,"access") }
  catch { return NextResponse.json({ error: "This account is currently restricted." }, { status: 403 }) }
  const label = ["home", "work", "other"].includes(String(body.label)) ? String(body.label) : "other"
  const payload = {
    customer_id: user.id,
    delivery_area_id: typeof body.deliveryAreaId === "string" && storefront.deliveryAreas.some((area) => area.databaseId === body.deliveryAreaId) ? body.deliveryAreaId : null,
    label,
    city: storefront.branch.city,
    address_line_1: String(body.addressLine1 ?? "").trim().slice(0, 500),
    address_line_2: String(body.addressLine2 ?? "").trim().slice(0, 500),
    landmark: String(body.landmark ?? "").trim().slice(0, 250),
    instructions: String(body.instructions ?? "").trim().slice(0, 500),
    location_source: locationSource(body.locationSource),
    latitude: typeof body.latitude === "number" ? body.latitude : null,
    longitude: typeof body.longitude === "number" ? body.longitude : null,
  }
  if ((payload.latitude !== null && (Math.abs(payload.latitude) > 90 || !Number.isFinite(payload.latitude))) || (payload.longitude !== null && (Math.abs(payload.longitude) > 180 || !Number.isFinite(payload.longitude)))) return NextResponse.json({ error: "Coordinates are invalid." }, { status: 400 })
  if ((payload.latitude === null) !== (payload.longitude === null)) return NextResponse.json({ error: "Both coordinates are required." }, { status: 400 })
  if (payload.latitude !== null && payload.longitude !== null) {
    try { await validateDeliveryPoint({ latitude: payload.latitude, longitude: payload.longitude }, storefront, payload.delivery_area_id ?? undefined) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery location could not be verified." }, { status: 422 }) }
  }
  if (!payload.city || !payload.address_line_1) return NextResponse.json({ error: "City and address are required." }, { status: 400 })
  const { data, error } = await supabase.from("customer_addresses").upsert(payload, { onConflict: "customer_id,label" }).select("id").single()
  return error ? NextResponse.json({ error: "Address could not be saved." }, { status: 400 }) : NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not configured." }, { status: 503 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const storefront = await getStorefrontSnapshot()
  try { if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id,"access") }
  catch { return NextResponse.json({ error: "This account is currently restricted." }, { status: 403 }) }
  const id = request.nextUrl.searchParams.get("id")
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid address." }, { status: 400 })
  const { error } = await supabase.from("customer_addresses").delete().eq("id", id).eq("customer_id", user.id)
  return error ? NextResponse.json({ error: "Address could not be deleted." }, { status: 400 }) : NextResponse.json({ ok: true })
}
