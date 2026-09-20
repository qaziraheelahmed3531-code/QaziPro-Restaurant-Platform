import { revalidatePath } from "next/cache"
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
  revalidatePath("/", "layout")
  return NextResponse.json({ ok: true })
}
