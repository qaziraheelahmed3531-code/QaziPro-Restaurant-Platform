"use client"
import { useState } from "react"

export function TableQrPrint({ id, name, restaurantName, url, active }: { id: string; name: string; restaurantName: string; url: string; active: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  return <section className="panel table-qr-print">
    <div className="table-qr-card"><small>{restaurantName}</small><h1>{name}</h1><p>Scan to browse the full menu and order at your table.</p>
      {/* A same-origin authenticated generated SVG, not an external tracking image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/tables/${id}/qr`} alt={`Menu QR for ${name}`} width={320} height={320} onLoad={() => setLoaded(true)} onError={() => setError(true)} />
      <p className="table-qr-url">{url}</p>
      {!active && <p role="status">Inactive table — this QR will not accept orders until reactivated.</p>}
    </div>
    {error && <p role="alert">QR could not be loaded. Check the restaurant domain and refresh before printing.</p>}
    <div className="table-actions table-qr-actions"><button className="button" disabled={!loaded || error} onClick={() => window.print()}>Print QR</button><a className="button button--outline" href={`/api/tables/${id}/qr?download=1`} download>Download SVG</a><a className="button button--outline" href={url} target="_blank" rel="noopener noreferrer">Preview full menu</a></div>
    <style>{`.table-qr-card { max-width:400px; margin:auto; padding:32px; text-align:center; } .table-qr-card img { width:100%; max-width:320px; height:auto; } .table-qr-url { overflow-wrap:anywhere; font-size:11px; } .table-qr-actions { justify-content:center; padding:16px; } @media print { body * { visibility:hidden; } .table-qr-card, .table-qr-card * { visibility:visible; } .table-qr-card { position:absolute; left:0; top:0; width:100%; max-width:none; } .table-qr-actions { display:none; } }`}</style>
  </section>
}
