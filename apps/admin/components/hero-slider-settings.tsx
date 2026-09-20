"use client"

import { AppLoader } from "@italian-pizza/shared/app-loader"
import { HERO_TRANSITIONS, heroTransitionName, type HeroTransitionName } from "@italian-pizza/shared/motion"
import { MonitorPlay } from "lucide-react"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export function HeroSliderSettings({ businessId, initial }: { businessId: string; initial: { autoplay: boolean; intervalMs: number; transitionMs: number } }) {
  const [autoplay, setAutoplay] = useState(initial.autoplay)
  const [seconds, setSeconds] = useState(initial.intervalMs / 1000)
  const [transition, setTransition] = useState<HeroTransitionName>(heroTransitionName(initial.transitionMs))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  async function save() {
    setSaving(true); setMessage("")
    const intervalMs = Math.round(Math.min(15, Math.max(3, seconds)) * 1000)
    const { error } = await createClient().from("business_branding").update({ hero_autoplay: autoplay, hero_interval_ms: intervalMs, hero_transition_ms: HERO_TRANSITIONS[transition] }).eq("business_id", businessId)
    if (error) setMessage("Slider settings could not be saved. Please retry.")
    else { setSeconds(intervalMs / 1000); setMessage("Slider settings published."); void fetch("/api/revalidate-customer", { method: "POST" }) }
    setSaving(false)
  }

  return <section className="panel hero-settings-panel" aria-labelledby="hero-settings-title">
    <div className="hero-settings-summary"><span><MonitorPlay aria-hidden="true" /></span><div><small>LIVE STOREFRONT BEHAVIOR</small><h2 id="hero-settings-title">Hero slider settings</h2><p>Autoplay: <strong>{autoplay ? "On" : "Off"}</strong> · Every: <strong>{seconds.toFixed(1)} sec</strong> · Transition: <strong>{transition}</strong></p></div></div>
    <div className="hero-settings-fields">
      <label className="hero-toggle"><span>Autoplay</span><input type="checkbox" checked={autoplay} onChange={event => setAutoplay(event.target.checked)} /><i aria-hidden="true" /></label>
      <label><span>Change slide every</span><div className="hero-number"><input type="number" min="3" max="15" step="0.5" value={seconds} onChange={event => setSeconds(Number(event.target.value))} /><small>seconds</small></div></label>
      <label><span>Transition speed</span><select value={transition} onChange={event => setTransition(event.target.value as HeroTransitionName)}>{Object.keys(HERO_TRANSITIONS).map(value => <option key={value}>{value}</option>)}</select></label>
      <button className="button" type="button" disabled={saving} onClick={() => void save()}><AppLoader active={saving} label="Saving slider settings" />{saving ? "Saving…" : "Save slider settings"}</button>
    </div>
    {message && <p className="hero-settings-message" role="status">{message}</p>}
  </section>
}
