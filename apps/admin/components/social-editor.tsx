"use client"

import { useEffect, useState } from "react"
import { socialPlatforms, normalizeSocialUrl, type SocialPlatform } from "@italian-pizza/shared/social"
import { socialIcons } from "@italian-pizza/shared/social-icons"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { createClient } from "@/lib/supabase/client"
import { adminError } from "@/lib/admin-errors"

type Row = { id?: string; platform: SocialPlatform; url: string; is_active: boolean; sort_order: number }
export function SocialEditor({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => {
    let active = true
    void createClient().from("social_links").select("id,platform,url,is_active,sort_order").eq("business_id", businessId).order("sort_order").then(({data,error}) => {
      if (!active) return
      if (error) setMessage(adminError(error))
      else setRows(socialPlatforms.map((platform,index) => {
        const existing = data?.find(row => row.platform.trim().toLowerCase() === platform.toLowerCase())
        return { id: existing?.id, platform, url: existing?.url ?? "", is_active: existing?.is_active ?? false, sort_order: existing?.sort_order ?? (index + 1) * 10 }
      }))
      setLoading(false)
    })
    return () => { active = false }
  }, [businessId])
  const update = (platform: string, patch: Partial<Row>) => setRows(current => current.map(row => row.platform === platform ? {...row,...patch} : row))
  const save = async (row: Row) => {
    setBusy(row.platform); setMessage("")
    try {
      if(!Number.isInteger(row.sort_order)||row.sort_order<0) throw new Error("Sort order must be a non-negative whole number.")
      const url = normalizeSocialUrl(row.platform,row.url)
      if (row.is_active && !url) throw new Error("Add a valid destination before enabling this platform.")
      const db = createClient()
      // Empty inactive cards do not need placeholder URLs or database rows.
      if (!url && !row.id) { setMessage(row.platform + " remains hidden."); return }
      const payload = { business_id: businessId, platform: row.platform, url, is_active: row.is_active, sort_order: row.sort_order }
      const result = row.id
        ? await db.from("social_links").update(payload).eq("id",row.id).eq("business_id",businessId).select("id").single()
        : await db.from("social_links").insert(payload).select("id").single()
      if (result.error) throw new Error(adminError(result.error))
      update(row.platform,{id:result.data.id,url})
      await fetch("/api/revalidate-customer",{method:"POST"})
      setMessage(row.platform + (row.is_active ? " is visible on the storefront." : " is hidden from the storefront."))
    } catch(error) { setMessage(error instanceof Error ? error.message : "Social link could not be saved.") }
    finally { setBusy(null) }
  }
  return <section className="social-editor"><div className="page-heading"><div><h1>Footer / Social Media</h1><p>Only enabled platforms with a valid link appear to customers.</p></div></div>
    {message && <p className="inline-notice" role="status">{message}</p>}
    {loading ? <p className="state-box--loading" role="status"><AppLoader active delay={0} label="Loading social links"/><span>Loading social links…</span></p> : <div className="social-editor__grid">{rows.map(row => <article className="panel social-editor__card" key={row.platform}>
      <header><svg width="24" height="24" viewBox="0 0 24 24" fill={"#"+socialIcons[row.platform].hex} aria-hidden="true"><path d={socialIcons[row.platform].path}/></svg><h2>{row.platform}</h2>
        <label><input disabled={Boolean(busy)} type="checkbox" role="switch" checked={row.is_active} onChange={e=>update(row.platform,{is_active:e.target.checked})} aria-label={"Enable "+row.platform}/> Enabled</label></header>
      <label>Link<input disabled={Boolean(busy)} value={row.url} onChange={e=>update(row.platform,{url:e.target.value})} placeholder={row.platform==="WhatsApp"?"923XXXXXXXXX or https://wa.me/...":"https://"} /></label>
      <footer><label>Sort order<input disabled={Boolean(busy)} type="number" min="0" value={row.sort_order} onChange={e=>update(row.platform,{sort_order:Number(e.target.value)})}/></label><button className="button" disabled={Boolean(busy)} onClick={()=>void save(row)}>{busy===row.platform?"Saving...":"Save "+row.platform}</button></footer>
    </article>)}</div>}
  </section>
}
