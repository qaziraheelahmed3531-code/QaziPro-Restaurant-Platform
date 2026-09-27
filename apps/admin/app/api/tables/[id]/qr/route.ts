import { NextRequest } from "next/server"
import QRCode from "qrcode"
import { getTableQr } from "@/lib/table-qr"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const qr = await getTableQr((await params).id)
  if (!qr) return new Response("Table unavailable", { status: 404 })
  const svg = await QRCode.toString(qr.url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 512 })
  return new Response(svg, { headers: {
    "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    ...(request.nextUrl.searchParams.has("download") ? { "Content-Disposition": 'attachment; filename="table-qr.svg"' } : {}),
  } })
}
