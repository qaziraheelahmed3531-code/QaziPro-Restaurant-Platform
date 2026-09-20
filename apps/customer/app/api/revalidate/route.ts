import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATION_SECRET
  // `next start` is production mode even on a developer's own machine. Allow
  // the local Admin app to invalidate this local storefront without forcing a
  // shared production secret into every developer env file. Deployed hosts
  // still require the exact shared secret.
  const localRequest = ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  if ((!secret || request.headers.get("authorization") !== `Bearer ${secret}`) && !localRequest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = await request.json().catch(() => ({})) as { businessId?: unknown; branchId?: unknown }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const businessId = typeof body.businessId === "string" && uuid.test(body.businessId) ? body.businessId : null
  const branchId = typeof body.branchId === "string" && uuid.test(body.branchId) ? body.branchId : null
  if (businessId) revalidateTag(`storefront:business:${businessId}`, { expire: 0 })
  if (businessId && branchId) revalidateTag(`storefront:business:${businessId}:branch:${branchId}`, { expire: 0 })
  revalidatePath("/", "layout")
  return NextResponse.json({ ok: true, scope: { businessId, branchId } })
}
