import { NextResponse } from "next/server"

const supportedProviders = new Set(["safepay", "payfast", "jazzcash", "easypaisa"])

/** Fail closed until an official, credentialed provider adapter is installed. */
export async function POST(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params
  if (!supportedProviders.has(provider)) return NextResponse.json({ ok: false, error: "Unknown payment provider." }, { status: 404 })
  return NextResponse.json({ ok: false, error: "Payment provider is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } })
}
