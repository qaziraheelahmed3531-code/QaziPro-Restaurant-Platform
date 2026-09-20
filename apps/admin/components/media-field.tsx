"use client"

import { useId, useRef, useState } from "react"
import { ImageOff, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { mediaFileError, mediaUrlError, mediaPreviewUrl, mediaSignatureError } from "@/lib/media"

export function MediaField({ value, onChange, label, bucket, folder, onBusy, assetOrigin, aspectRatio = "3 / 2", recommendedSize = "1200 × 800", required = false, previewFit = "cover" }: {
  value: string; onChange: (value: string) => void; label: string; bucket: string; folder: string;
  onBusy?: (busy: boolean) => void; assetOrigin?: string; aspectRatio?: string; recommendedSize?: string; required?: boolean; previewFit?: "cover" | "contain";
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [lastFile, setLastFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [broken, setBroken] = useState<string | null>(null)
  const urlError = mediaUrlError(value)
  async function upload(file?: File) {
    if (!file || busy) return
    setLastFile(file)
    const invalid = mediaFileError(file)
    if (invalid) { setMessage(invalid); return }
    setBusy(true); onBusy?.(true); setMessage("")
    try {
      const invalidContents = await mediaSignatureError(file)
      if (invalidContents) { setMessage(invalidContents); return }
      const client = createClient()
      const path = `${folder}/${crypto.randomUUID()}.${file.name.split(".").pop()!.toLowerCase()}`
      const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
      if (error) throw error
      onChange(client.storage.from(bucket).getPublicUrl(path).data.publicUrl)
      setMessage("Image uploaded. Save changes to publish it."); setLastFile(null)
    } catch { setMessage("Upload failed. Check your connection and media access, then retry.") }
    finally { setBusy(false); onBusy?.(false); if (input.current) input.current.value = "" }
  }
  return <div className="media-field" aria-busy={busy} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void upload(event.dataTransfer.files[0]) }}>
    <label htmlFor={id}>{label}{required ? " *" : ""}</label>
    <input id={id} value={value} disabled={busy} required={required} placeholder="https://… or /images/…" aria-invalid={Boolean(urlError)} aria-describedby={`${id}-help`} onChange={event => { onChange(event.target.value); setMessage("") }}/>
    <small id={`${id}-help`}>{urlError ?? `Paste an image link or drop a file. Recommended: ${recommendedSize}. JPG, PNG, WebP · Up to 10 MB.`}</small>
    {value && !urlError && <div className={`media-preview media-preview--${previewFit}`} style={{ aspectRatio }}>
      {broken === value ? <span><ImageOff aria-hidden="true"/>Image unavailable — your link is preserved.</span> : /* eslint-disable-next-line @next/next/no-img-element */
        <img key={value} src={mediaPreviewUrl(value, assetOrigin)} alt={`${label} preview`} onError={() => setBroken(value)}/>}
    </div>}
    <div className="heading-actions">
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files?.[0])}/>
      <button type="button" className="button button--outline" disabled={busy} onClick={() => input.current?.click()}><Upload aria-hidden="true"/>{busy ? "Uploading…" : value ? "Replace image" : "Upload image"}</button>
      {value && <button type="button" className="button button--outline" disabled={busy} onClick={() => { onChange(""); setMessage("Image removed from this draft. Save to publish.") }}>Remove</button>}
      {lastFile && !busy && <button type="button" className="button button--outline" onClick={() => void upload(lastFile)}>Retry upload</button>}
      {broken === value && value && <button type="button" className="button button--outline" onClick={() => setBroken(null)}>Retry preview</button>}
    </div>
    {message && <p role="status">{message}</p>}
  </div>
}
