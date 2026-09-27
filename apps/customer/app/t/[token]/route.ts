import { NextRequest, NextResponse } from "next/server"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const storefront = await getStorefrontSnapshot({ tableToken: token })
  if (!storefront.tableContext || storefront.orderPersistence !== "database" || !storefront.business.id) {
    return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Table unavailable</title><body style="font:18px system-ui;background:#faf8f5;color:#28221e;display:grid;place-items:center;min-height:90vh"><main style="max-width:420px;padding:24px"><h1>This table is unavailable</h1><p>Please check the QR with your waiter. No order has been placed.</p><a href="/">Return to the restaurant</a></main></body></html>', { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } })
  }
  const response = NextResponse.redirect(new URL("/#menu", request.url), 303)
  response.cookies.set(`qp-table-${storefront.business.id}`, token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
