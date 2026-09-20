import { NextRequest, NextResponse } from "next/server"

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { assertCustomerMutationAllowed } from "@/lib/restrictions/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

async function session() {
  if (!isSupabaseConfigured()) return { supabase: null, user: null }
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data.user }
}

export async function GET() {
  const { supabase, user } = await session()
  if (!supabase || !user) return NextResponse.json({ authenticated: false, favourites: [] }, { headers: { "Cache-Control": "private, no-store" } })
  const storefront=await getStorefrontSnapshot()
  if(!storefront.business.id)return NextResponse.json({authenticated:true,favourites:[]})
  const { data, error } = await supabase.from("customer_favourites").select("id,product_id,created_at,products(id,name,base_price,sale_price,is_available)").eq("user_id", user.id).eq("business_id",storefront.business.id).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "Favourites could not be loaded." }, { status: 503 })
  return NextResponse.json({ authenticated: true, favourites: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await session()
  if (!supabase || !user) return NextResponse.json({ error: "Sign in to save favourites." }, { status: 401 })
  const storefront = await getStorefrontSnapshot()
  try { if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id,"access") }
  catch { return NextResponse.json({ error: "This account is currently restricted." }, { status: 403 }) }
  const body = await request.json().catch(() => null) as { productId?: unknown } | null
  const productId = typeof body?.productId === "string" ? body.productId : ""
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: "Invalid product." }, { status: 400 })
  const { data: product } = await supabase.from("products").select("id").eq("id", productId).eq("business_id",storefront.business.id!).eq("is_active", true).maybeSingle()
  if (!product) return NextResponse.json({ error: "Product is unavailable." }, { status: 404 })
  const { error } = await supabase.from("customer_favourites").upsert({ user_id: user.id, business_id:storefront.business.id!, product_id: productId }, { onConflict: "user_id,product_id" })
  return error ? NextResponse.json({ error: "Favourite could not be saved." }, { status: 400 }) : NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await session()
  if (!supabase || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  const storefront = await getStorefrontSnapshot()
  try { if (storefront.business.id) await assertCustomerMutationAllowed(storefront.business.id,"access") }
  catch { return NextResponse.json({ error: "This account is currently restricted." }, { status: 403 }) }
  const productId = request.nextUrl.searchParams.get("productId") ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return NextResponse.json({ error: "Invalid product." }, { status: 400 })
  const { error } = await supabase.from("customer_favourites").delete().eq("user_id", user.id).eq("business_id",storefront.business.id!).eq("product_id", productId)
  return error ? NextResponse.json({ error: "Favourite could not be removed." }, { status: 400 }) : NextResponse.json({ ok: true })
}
