"use client"

import { BellRing, Play, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { playOrderNotificationSound } from "@/lib/order-notification-sound"
import { createClient } from "@/lib/supabase/client"

const formats: Record<string, string[]> = {
  "audio/mpeg": ["mp3"],
  "audio/wav": ["wav"],
  "audio/ogg": ["ogg"],
}

async function soundError(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  if (!formats[file.type]?.includes(extension)) return "Choose a genuine MP3, WAV or OGG file."
  if (!file.size || file.size > 5 * 1024 * 1024) return "Sound must be smaller than 5 MB."
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const text = String.fromCharCode(...bytes)
  const valid = file.type === "audio/wav" ? text.startsWith("RIFF") && text.slice(8, 12) === "WAVE"
    : file.type === "audio/ogg" ? text.startsWith("OggS")
      : text.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  return valid ? null : "The file contents do not match its audio format."
}

export function OrderNotificationSettings({ businessId, initialEnabled, initialDesktopEnabled, initialUrl }: {
  businessId: string
  initialEnabled: boolean
  initialDesktopEnabled: boolean
  initialUrl: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [desktopEnabled, setDesktopEnabled] = useState(initialDesktopEnabled)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState(false)

  async function upload(file?: File) {
    if (!file || busy) return
    setBusy(true); setMessage(""); setError(false)
    try {
      const invalid = await soundError(file)
      if (invalid) throw new Error(invalid)
      const extension = file.name.toLowerCase().split(".").pop()
      const client = createClient()
      const path = `${businessId}/orders/${crypto.randomUUID()}.${extension}`
      const result = await client.storage.from("notification-sounds").upload(path, file, { contentType: file.type, upsert: false })
      if (result.error) throw result.error
      setUrl(client.storage.from("notification-sounds").getPublicUrl(path).data.publicUrl)
      setMessage("Sound uploaded. Save settings to activate it.")
    } catch (uploadError) {
      setError(true); setMessage(uploadError instanceof Error ? uploadError.message : "Sound upload failed.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  async function save() {
    setBusy(true); setMessage(""); setError(false)
    const { error: saveError } = await createClient().from("business_operating_settings").upsert({
      business_id: businessId,
      new_order_sound: enabled,
      desktop_order_sound: desktopEnabled,
      order_notification_sound_url: url || null,
    })
    setBusy(false)
    if (saveError) { setError(true); setMessage(saveError.message); return }
    setMessage("Order notification settings saved for Admin and synced POS devices.")
  }

  return <section className="order-sound-settings">
    <div className="order-sound-settings__title"><i><BellRing/></i><div><h2>Website order alerts</h2><p>One realtime alert is created only after a genuine website order reaches the database.</p></div></div>
    <div className="order-sound-toggle-grid"><label className="order-sound-toggle"><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><span><strong>Admin notification sound</strong><small>Sound on the web Admin panel.</small></span></label><label className="order-sound-toggle"><input type="checkbox" checked={desktopEnabled} onChange={event=>setDesktopEnabled(event.target.checked)}/><span><strong>Desktop POS notification sound</strong><small>Central default; each device also has a local switch.</small></span></label></div>
    <div className="order-sound-actions">
      <input ref={input} hidden type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={event=>void upload(event.target.files?.[0])}/>
      <button className="button button--outline" type="button" disabled={busy} onClick={()=>input.current?.click()}><Upload/>{url?"Replace custom sound":"Upload custom sound"}</button>
      <button className="button button--outline" type="button" disabled={busy} onClick={()=>void playOrderNotificationSound(url)}><Play/>Test sound</button>
      {url&&<button className="button button--outline" type="button" disabled={busy} onClick={()=>{setUrl("");setMessage("Built-in chime selected. Save settings to activate it.")}}>Use built-in chime</button>}
      <button className="button" type="button" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save alert settings"}</button>
    </div>
    <small>MP3, WAV or OGG · maximum 5 MB. Browsers permit sound after the staff member has interacted with the page once.</small>
    {message&&<p role="status" className={error?"is-error":""}>{message}</p>}
  </section>
}
