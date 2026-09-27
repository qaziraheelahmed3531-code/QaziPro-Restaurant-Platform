import Link from "next/link"
import { getTableQr } from "@/lib/table-qr"
import { TableQrPrint } from "@/components/table-qr-print"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // Keep permission redirects outside the configuration error boundary.
  const qr = await getTableQr((await params).id)
  if (!qr) return <div className="state-box"><h1>Table unavailable</h1><p>Select a table you can manage.</p><Link href="/tables">Back to tables</Link></div>
  return <div className="page-stack"><Link href="/tables">Back to tables</Link><TableQrPrint id={qr.table.id} name={qr.table.name} restaurantName={qr.restaurantName} url={qr.url} active={qr.table.is_active} /></div>
}
