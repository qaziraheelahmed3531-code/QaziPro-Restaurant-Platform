"use client"

import { AppLoader } from "@italian-pizza/shared/app-loader"
import { Palette, Save } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useEffect, useState, type CSSProperties } from "react"

import { MediaField } from "@/components/media-field"
import { createClient } from "@/lib/supabase/client"

export type BrandingSettings = {
  display_name: string
  logo_url: string
  footer_logo_url: string
  favicon_url: string
  primary_color: string
  secondary_color: string
  website_background_color: string
  header_background_color: string
  footer_background_color: string
  product_card_background_color: string
  text_color: string
  footer_text_color: string
  font_family: string
  font_stylesheet_url: string
  header_logo_size_px: number
  footer_logo_size_px: number
  footer_description: string
}

const hexPattern = /^#[0-9a-fA-F]{6}$/
const fontFamilyPattern = /^[a-zA-Z0-9 -]{1,80}$/
const fontPresets = [
  { family:"Geist", label:"Geist (clean default)", url:"" },
  { family:"Poppins", label:"Poppins", url:"https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" },
  { family:"Montserrat", label:"Montserrat", url:"https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" },
  { family:"Outfit", label:"Outfit", url:"https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" },
  { family:"Nunito Sans", label:"Nunito Sans", url:"https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600;700;800&display=swap" },
] as const

function validFontStylesheet(value: string) {
  if (!value.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === "https:" && ["fonts.googleapis.com", "fonts.bunny.net"].includes(url.hostname)
  } catch { return false }
}

function readableTextOn(hex: string) {
  if (!hexPattern.test(hex)) return "#ffffff"
  const channels=[hex.slice(1,3),hex.slice(3,5),hex.slice(5,7)].map(value=>Number.parseInt(value,16)/255)
  const luminance=channels.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4)
  return .2126*luminance[0]+.7152*luminance[1]+.0722*luminance[2]>.43?"#15110d":"#ffffff"
}

function ColorField({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return <label className="theme-color-field"><span>{label}</span><div><input type="color" value={hexPattern.test(value) ? value : "#000000"} onChange={event => onChange(event.target.value)}/><input value={value} maxLength={7} pattern="#[0-9a-fA-F]{6}" spellCheck={false} onChange={event => onChange(event.target.value)} aria-label={`${label} hex value`}/></div><small>{help}</small></label>
}

function LogoPreview({ url, name, size }: { url: string; name: string; size: number }) {
  const width=Math.round(size*2.4)
  return url ? <span className="branding-logo-preview" style={{ width, height:size }}><Image src={url} alt={`${name} logo preview`} fill sizes={`${width}px`} unoptimized/></span> : <span className="branding-logo-preview branding-logo-preview--fallback" style={{ width, height:size }}>IP</span>
}

export function BrandingManager({ businessId, initial, assetOrigin }: { businessId: string; initial: BrandingSettings; assetOrigin?: string }) {
  const router = useRouter()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [dirty, setDirty] = useState(false)
  const update = <K extends keyof BrandingSettings>(key: K, value: BrandingSettings[K]) => { setDraft(current => ({ ...current, [key]:value })); setDirty(true) }
  useEffect(() => {
    if (!dirty) return
    const warn = (event:BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload",warn)
    return () => window.removeEventListener("beforeunload",warn)
  },[dirty])
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>('link[data-branding-font-preview]')
    if (!draft.font_stylesheet_url || !validFontStylesheet(draft.font_stylesheet_url)) { existing?.remove(); return }
    const link = existing ?? document.createElement("link")
    link.rel = "stylesheet"
    link.dataset.brandingFontPreview = "true"
    link.href = draft.font_stylesheet_url
    if (!existing) document.head.append(link)
    return () => { if (link.parentElement) link.remove() }
  }, [draft.font_stylesheet_url])
  const previewStyle = {
    "--preview-primary": draft.primary_color,
    "--preview-primary-contrast": readableTextOn(draft.primary_color),
    "--preview-secondary": draft.secondary_color,
    "--preview-secondary-contrast": readableTextOn(draft.secondary_color),
    "--preview-page": draft.website_background_color,
    "--preview-header": draft.header_background_color,
    "--preview-footer": draft.footer_background_color,
    "--preview-card": draft.product_card_background_color,
    "--preview-text": draft.text_color,
    "--preview-footer-text": draft.footer_text_color,
    "--preview-font": `"${draft.font_family}", system-ui, sans-serif`,
  } as CSSProperties

  const save = async () => {
    setMessage("")
    const colorEntries = Object.entries(draft).filter(([key]) => key.endsWith("_color"))
    const invalid = colorEntries.find(([, value]) => !hexPattern.test(String(value)))
    if (invalid) { setMessage("Every theme color must use the full #RRGGBB format."); return }
    if (!fontFamilyPattern.test(draft.font_family.trim())) { setMessage("Font family can contain letters, numbers, spaces and hyphens only."); return }
    if (!validFontStylesheet(draft.font_stylesheet_url)) { setMessage("Use a secure Google Fonts or Bunny Fonts stylesheet URL."); return }
    if (draft.header_logo_size_px < 36 || draft.header_logo_size_px > 120 || draft.footer_logo_size_px < 40 || draft.footer_logo_size_px > 180) { setMessage("Choose a logo size inside the shown range."); return }
    setBusy(true)
    const { error } = await createClient().from("business_branding").upsert({ business_id:businessId, ...draft }, { onConflict:"business_id" })
    if (error) setMessage("Unable to save branding. Please try again.")
    else {
      const response = await fetch("/api/revalidate-customer", { method:"POST" })
      setMessage(response.ok ? "Branding published to Admin and website." : "Branding saved. Website refresh is still being requested.")
      setDirty(false)
      router.refresh()
    }
    setBusy(false)
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">WEBSITE &amp; ADMIN</span><h1>Branding</h1><p>Control the shared logo, sizes and storefront theme from one place. White form surfaces remain white for readability.</p></div><button className="button" type="button" disabled={busy || mediaBusy || !dirty} onClick={() => void save()}>{busy ? <><AppLoader active delay={0} label="Saving branding"/>Saving…</> : <><Save aria-hidden="true"/>Save &amp; publish</>}</button></div>
    {message && <p className="inline-notice" role="status">{message}</p>}
    <div className="branding-layout">
      <section className="panel branding-controls">
        <div className="branding-section-heading"><Palette aria-hidden="true"/><div><h2>Logos</h2><p>The header logo is also used in the Admin sidebar.</p></div></div>
        <label><span>Brand display name</span><input value={draft.display_name} onChange={event => update("display_name",event.target.value)} required/></label>
        <MediaField label="Header, location modal & Admin logo" value={draft.logo_url} onChange={value => update("logo_url",value)} bucket="business-logos" folder={`${businessId}/branding`} assetOrigin={assetOrigin} aspectRatio="3 / 1" recommendedSize="600 × 200" previewFit="contain" onBusy={setMediaBusy}/>
        <label className="logo-size-control"><span>Header logo size <b>{draft.header_logo_size_px}px</b></span><input type="range" min="36" max="120" step="2" value={draft.header_logo_size_px} onChange={event => update("header_logo_size_px",Number(event.target.value))}/><small>36–120 px. Header height grows safely when required.</small></label>
        <MediaField label="Footer logo (optional)" value={draft.footer_logo_url} onChange={value => update("footer_logo_url",value)} bucket="business-logos" folder={`${businessId}/branding`} assetOrigin={assetOrigin} aspectRatio="3 / 1" recommendedSize="720 × 240" previewFit="contain" onBusy={setMediaBusy}/>
        <label className="logo-size-control"><span>Footer logo size <b>{draft.footer_logo_size_px}px</b></span><input type="range" min="40" max="180" step="2" value={draft.footer_logo_size_px} onChange={event => update("footer_logo_size_px",Number(event.target.value))}/><small>40–180 px. Falls back to the header logo when empty.</small></label>
        <MediaField label="Browser favicon" value={draft.favicon_url} onChange={value => update("favicon_url",value)} bucket="business-logos" folder={`${businessId}/branding`} assetOrigin={assetOrigin} aspectRatio="1 / 1" recommendedSize="256 × 256" onBusy={setMediaBusy}/>
        <label><span>Footer description</span><textarea value={draft.footer_description} onChange={event => update("footer_description",event.target.value)}/></label>
        <div className="branding-section-heading"><Palette aria-hidden="true"/><div><h2>Website typography</h2><p>One professional family is applied consistently; headings retain their stronger weights.</p></div></div>
        <label><span>Font preset</span><select value={fontPresets.some(option => option.family === draft.font_family) ? draft.font_family : "CUSTOM"} onChange={event => { const preset=fontPresets.find(option=>option.family===event.target.value); if (preset) { setDraft(current=>({...current,font_family:preset.family,font_stylesheet_url:preset.url})); setDirty(true) } }}><option value="CUSTOM">Custom web font</option>{fontPresets.map(option=><option key={option.family} value={option.family}>{option.label}</option>)}</select><small>Choose a ready-to-use family or configure your own below.</small></label>
        <label><span>Font family name</span><input value={draft.font_family} maxLength={80} onChange={event => update("font_family",event.target.value)} placeholder="e.g. Poppins"/><small>Use the exact family name provided by the font service.</small></label>
        <label className="branding-font-url"><span>Font stylesheet URL (optional)</span><input type="url" value={draft.font_stylesheet_url} onChange={event => update("font_stylesheet_url",event.target.value)} placeholder="https://fonts.googleapis.com/css2?family=..."/><small>Secure Google Fonts and Bunny Fonts CSS links are supported.</small></label>
        <div className="branding-section-heading"><Palette aria-hidden="true"/><div><h2>Theme colors</h2><p>Primary color also powers Admin action buttons and active navigation.</p></div></div>
        <div className="theme-color-grid">
          <ColorField label="Primary / buttons" value={draft.primary_color} onChange={value => update("primary_color",value)} help="Buttons, active tabs and key icons."/>
          <ColorField label="Secondary / highlights" value={draft.secondary_color} onChange={value => update("secondary_color",value)} help="Badges, stars and highlights."/>
          <ColorField label="Website background" value={draft.website_background_color} onChange={value => update("website_background_color",value)} help="Main storefront canvas."/>
          <ColorField label="Header background" value={draft.header_background_color} onChange={value => update("header_background_color",value)} help="Customer header only."/>
          <ColorField label="Footer background" value={draft.footer_background_color} onChange={value => update("footer_background_color",value)} help="Customer footer only."/>
          <ColorField label="Product cards" value={draft.product_card_background_color} onChange={value => update("product_card_background_color",value)} help="Product, deal and category cards."/>
          <ColorField label="Main text" value={draft.text_color} onChange={value => update("text_color",value)} help="Customer and Admin primary text."/>
          <ColorField label="Footer text" value={draft.footer_text_color} onChange={value => update("footer_text_color",value)} help="Footer headings and links."/>
        </div>
      </section>
      <aside className="panel branding-live-preview" style={previewStyle}><span className="eyebrow">LIVE PREVIEW</span><div className="branding-preview-header"><LogoPreview url={draft.logo_url} name={draft.display_name} size={Math.min(draft.header_logo_size_px,88)}/><button type="button">Order now</button></div><div className="branding-preview-body"><article><span>POPULAR</span><div/><h3>Chicken Fajita Pizza</h3><p>Fresh ingredients and your favourite options.</p><button type="button">Add to cart</button></article></div><div className="branding-preview-footer"><LogoPreview url={draft.footer_logo_url || draft.logo_url} name={draft.display_name} size={Math.min(draft.footer_logo_size_px,110)}/><strong>{draft.display_name}</strong><small>{draft.footer_description || "Your restaurant footer description"}</small></div></aside>
    </div>
  </>
}
