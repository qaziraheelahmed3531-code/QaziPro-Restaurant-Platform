import Link from "next/link"
import QRCode from "qrcode"
import { getTableQr, TableQrConfigurationError } from "@/lib/table-qr"
import { TableQrPrint } from "@/components/table-qr-print"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // Keep permission redirects outside the configuration error boundary.
  let qr
  try { qr = await getTableQr((await params).id) }
  catch (error) {
    if (!(error instanceof TableQrConfigurationError)) throw error
    return <div className="state-box" role="alert"><h1>QR ordering is unavailable</h1><p>{error.message}</p><Link href="/tables">Back to tables</Link></div>
  }
  if (!qr) return <div className="state-box"><h1>Table unavailable</h1><p>Select a table you can manage.</p><Link href="/tables">Back to tables</Link></div>
  const svg = await QRCode.toString(qr.url, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 512 })
  return <div className="page-stack"><Link href="/tables">Back to tables</Link><TableQrPrint id={qr.table.id} name={qr.table.name} restaurantName={qr.restaurantName} url={qr.url} imageSrc={`data:image/svg+xml,${encodeURIComponent(svg)}`} active={qr.table.is_active} /></div>
}
