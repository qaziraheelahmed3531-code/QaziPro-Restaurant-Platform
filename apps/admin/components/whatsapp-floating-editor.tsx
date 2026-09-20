"use client"

import { MessageCircle, Save } from "lucide-react"
import { useEffect, useState, type CSSProperties } from "react"

import { adminError } from "@/lib/admin-errors"
import { createClient } from "@/lib/supabase/client"
import { MediaField } from "@/components/media-field"

type Settings = {
  enabled: boolean
  number: string
  logoUrl: string
  message: string
  side: "LEFT" | "RIGHT"
  size: number
  bottom: number
  sideOffset: number
}
type PreviewStyle = CSSProperties & { "--preview-size": string; "--preview-bottom": string; "--preview-side": string }
const defaults: Settings = { enabled: false, number: "", logoUrl: "", message: "Hello, I would like to place an order.", side: "LEFT", size: 58, bottom: 24, sideOffset: 24 }
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

export function WhatsAppFloatingEditor({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let active = true
    void createClient().from("site_settings").select("whatsapp_floating_enabled,whatsapp_floating_number,whatsapp_floating_logo_url,whatsapp_floating_message,whatsapp_floating_side,whatsapp_floating_size_px,whatsapp_floating_bottom_px,whatsapp_floating_side_offset_px").eq("business_id", businessId).maybeSingle().then(({ data, error }) => {
      if (!active) return
      if (error) setNotice(adminError(error))
      if (data) setSettings({
        enabled: Boolean(data.whatsapp_floating_enabled),
        number: String(data.whatsapp_floating_number ?? ""),
        logoUrl: String(data.whatsapp_floating_logo_url ?? ""),
        message: String(data.whatsapp_floating_message ?? defaults.message),
        side: data.whatsapp_floating_side === "RIGHT" ? "RIGHT" : "LEFT",
        size: Number(data.whatsapp_floating_size_px ?? 58),
        bottom: Number(data.whatsapp_floating_bottom_px ?? 24),
        sideOffset: Number(data.whatsapp_floating_side_offset_px ?? 24),
      })
      setLoading(false)
    })
    return () => { active = false }
  }, [businessId])

  const patch = (value: Partial<Settings>) => setSettings((current) => ({ ...current, ...value }))
  async function save() {
    if (busy || mediaBusy) return
    const number = settings.number.replace(/\D/g, "")
    if (settings.enabled && !/^\d{8,15}$/.test(number)) { setNotice("Add a valid WhatsApp number with country code, for example 923001234567."); return }
    setBusy(true); setNotice("")
    const payload = {
      business_id: businessId,
      whatsapp_floating_enabled: settings.enabled,
      whatsapp_floating_number: number,
      whatsapp_floating_logo_url: settings.logoUrl.trim() || null,
      whatsapp_floating_message: settings.message.trim().slice(0, 300),
      whatsapp_floating_side: settings.side,
      whatsapp_floating_size_px: bounded(settings.size, 44, 96),
      whatsapp_floating_bottom_px: bounded(settings.bottom, 8, 240),
      whatsapp_floating_side_offset_px: bounded(settings.sideOffset, 8, 160),
    }
    try {
      const { error } = await createClient().from("site_settings").upsert(payload, { onConflict: "business_id" })
      if (error) throw error
      setSettings((current) => ({ ...current, number }))
      await fetch("/api/revalidate-customer", { method: "POST" })
      setNotice(settings.enabled ? "WhatsApp button is now live on the storefront." : "WhatsApp button is hidden.")
    } catch (error) { setNotice(adminError(error && typeof error === "object" ? error as { code?: string; message?: string } : null)) }
    finally { setBusy(false) }
  }

  const previewStyle: PreviewStyle = { "--preview-size": `${bounded(settings.size, 44, 96)}px`, "--preview-bottom": `${Math.min(90, bounded(settings.bottom, 8, 240) / 2)}px`, "--preview-side": `${Math.min(90, bounded(settings.sideOffset, 8, 160) / 2)}px` }
  return <section className="panel whatsapp-editor">
    <div className="page-heading"><div><p className="eyebrow">STOREFRONT CONTACT</p><h1>Floating WhatsApp button</h1><p>Upload an icon, add the restaurant number and place the button exactly where customers can reach it.</p></div><label className="switch-line"><input type="checkbox" role="switch" checked={settings.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /> Enabled</label></div>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    {loading ? <p className="state-box--loading">Loading WhatsApp settings…</p> : <div className="whatsapp-editor__layout">
      <div className="whatsapp-editor__form">
        <div className="form-grid">
          <label>WhatsApp number<input inputMode="tel" value={settings.number} onChange={(event) => patch({ number: event.target.value })} placeholder="923001234567"/><small>Include the country code; do not use the + sign.</small></label>
          <label>Starting message<input maxLength={300} value={settings.message} onChange={(event) => patch({ message: event.target.value })} placeholder="Hello, I would like to place an order."/></label>
        </div>
        <MediaField value={settings.logoUrl} onChange={(logoUrl) => patch({ logoUrl })} label="WhatsApp button logo (optional)" bucket="whatsapp-assets" folder={businessId} onBusy={setMediaBusy} aspectRatio="1 / 1" recommendedSize="256 × 256" previewFit="contain" />
        <div className="whatsapp-controls">
          <label>Side<select value={settings.side} onChange={(event) => patch({ side: event.target.value as Settings["side"] })}><option value="LEFT">Bottom left</option><option value="RIGHT">Bottom right</option></select></label>
          <label>Size <strong>{settings.size}px</strong><input type="range" min="44" max="96" value={settings.size} onChange={(event) => patch({ size: Number(event.target.value) })}/></label>
          <label>Up / down <strong>{settings.bottom}px</strong><input type="range" min="8" max="240" value={settings.bottom} onChange={(event) => patch({ bottom: Number(event.target.value) })}/></label>
          <label>Left / right <strong>{settings.sideOffset}px</strong><input type="range" min="8" max="160" value={settings.sideOffset} onChange={(event) => patch({ sideOffset: Number(event.target.value) })}/></label>
        </div>
        <button className="button" type="button" disabled={busy || mediaBusy} onClick={() => void save()}><Save aria-hidden="true" />{busy ? "Saving…" : "Save & publish"}</button>
      </div>
      <div className="whatsapp-preview" style={previewStyle} data-side={settings.side.toLowerCase()}>
        <span>LIVE PREVIEW</span><div className="whatsapp-preview__page"><i/><i/><i/></div>
        {settings.enabled && <span className="whatsapp-preview__button">{settings.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */
          <img src={settings.logoUrl} alt=""/> : <MessageCircle aria-hidden="true"/>}</span>}
      </div>
    </div>}
  </section>
}
