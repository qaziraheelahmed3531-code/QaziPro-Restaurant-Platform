"use client"
import { useCallback, useState } from "react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

export function TableQrPrint({ id, name, restaurantName, url, imageSrc, active }: { id: string; name: string; restaurantName: string; url: string; imageSrc: string; active: boolean }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [errorSrc, setErrorSrc] = useState<string | null>(null)
  const loaded = loadedSrc === imageSrc
  const error = errorSrc === imageSrc
  const loading = !loaded && !error
  const imageRef = useCallback((image: HTMLImageElement | null) => {
    // Cached/inline images can finish before hydration attaches onLoad.
    if (image?.complete) {
      if (image.naturalWidth > 0) setLoadedSrc(imageSrc)
      else setErrorSrc(imageSrc)
    }
  }, [imageSrc])
  return <section className="panel table-qr-print">
    <div className="table-qr-card"><small>{restaurantName}</small><h1>{name}</h1><p>Scan to browse the full menu and order at your table.</p>
      <div className="table-qr-preview" aria-busy={loading}>
        {/* A server-generated inline SVG, not an external tracking image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={imageSrc} ref={imageRef} src={imageSrc} alt={`Menu QR for ${name}`} width={320} height={320} onLoad={() => setLoadedSrc(imageSrc)} onError={() => setErrorSrc(imageSrc)} style={{ opacity: loaded ? 1 : 0 }} />
        {loading && <div className="table-qr-preview__loading"><AppLoader active delay={0} label="Loading QR preview" /><span>Preparing QR…</span></div>}
      </div>
      <p className="table-qr-url">{url}</p>
      {!active && <p role="status">Inactive table — this QR will not accept orders until reactivated.</p>}
    </div>
    {error && <p role="alert">QR could not be loaded. Check the restaurant domain and refresh before printing.</p>}
    <div className="table-actions table-qr-actions"><button className="button" disabled={!loaded || error} onClick={() => window.print()}>{loading ? "Loading QR…" : error ? "QR unavailable" : "Print QR"}</button><a className="button button--outline" href={`/api/tables/${id}/qr?download=1`} download>Download SVG</a><a className="button button--outline" href={url} target="_blank" rel="noopener noreferrer">Preview full menu</a></div>
    <style>{`.table-qr-card { max-width:400px; margin:auto; padding:32px; text-align:center; } .table-qr-preview { position:relative; width:100%; max-width:320px; aspect-ratio:1; margin:auto; } .table-qr-card img { display:block; width:100%; height:100%; } .table-qr-preview__loading { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--muted); background:var(--surface, #fff); border-radius:12px; } .table-qr-url { overflow-wrap:anywhere; font-size:11px; } .table-qr-actions { justify-content:center; padding:16px; } @media print { body * { visibility:hidden; } .table-qr-card, .table-qr-card * { visibility:visible; } .table-qr-card { position:absolute; left:0; top:0; width:100%; max-width:none; } .table-qr-actions { display:none; } }`}</style>
  </section>
}
