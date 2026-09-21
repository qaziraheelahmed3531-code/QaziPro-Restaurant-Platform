"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"

type Hour = { id?: string; branch_id: string; day_of_week: number; opens_at: string; closes_at: string; is_closed: boolean }
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function friendly(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value
  const suffix = hours >= 12 ? "PM" : "AM"
  return `${String(hours % 12 || 12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${suffix}`
}

export function HoursEditor({ branchId, timezone, initial }: { branchId: string; timezone: string; initial: Hour[] }) {
  const [rows, setRows] = useState(() => days.map((_, day) => initial.find((row) => row.day_of_week === day) ?? { branch_id: branchId, day_of_week: day, opens_at: "11:00", closes_at: "23:00", is_closed: false }))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const update = (day: number, patch: Partial<Hour>) => setRows((current) => current.map((row) => row.day_of_week === day ? { ...row, ...patch } : row))
  const save = async () => {
    setSaving(true); setMessage("")
    const { error } = await createClient().from("business_hours").upsert(rows.map(({ branch_id, day_of_week, opens_at, closes_at, is_closed }) => ({ branch_id, day_of_week, opens_at, closes_at, is_closed })), { onConflict: "branch_id,day_of_week" })
    setMessage(error ? "Hours could not be saved. Please try again." : "Opening hours saved."); setSaving(false)
  }
  const copyMonday = () => { const monday = rows.find((row) => row.day_of_week === 1); if (monday) setRows((current) => current.map((row) => row.day_of_week === 0 ? row : { ...row, opens_at: monday.opens_at, closes_at: monday.closes_at, is_closed: monday.is_closed })) }
  const allOpen = useMemo(() => rows.every((row) => !row.is_closed), [rows])
  return <section className="panel hours-editor"><div className="panel-header"><div><h2>Weekly schedule</h2><p>Times use the selected branch timezone ({timezone}). Closing earlier than opening supports overnight service.</p></div><div className="heading-actions"><button className="button button--outline" type="button" onClick={copyMonday}>Copy Monday to weekdays</button><button className="button button--outline" type="button" onClick={() => setRows((current) => current.map((row) => ({ ...row, is_closed: false })))}>Mark all open</button></div></div><div className="hours-list">{rows.map((row) => <div className="hours-row" key={row.day_of_week}><strong>{days[row.day_of_week]}</strong><label className="hours-toggle"><input type="checkbox" checked={!row.is_closed} onChange={(event) => update(row.day_of_week, { is_closed: !event.target.checked })} /><span>{row.is_closed ? "Closed" : "Open"}</span></label><label><span>Opens</span><input type="time" value={row.opens_at.slice(0, 5)} disabled={row.is_closed} onChange={(event) => update(row.day_of_week, { opens_at: event.target.value })} /><small>{friendly(row.opens_at)}</small></label><span className="hours-separator">to</span><label><span>Closes</span><input type="time" value={row.closes_at.slice(0, 5)} disabled={row.is_closed} onChange={(event) => update(row.day_of_week, { closes_at: event.target.value })} /><small>{friendly(row.closes_at)}</small></label></div>)}</div><div className="panel-footer"><span>{allOpen ? "Open every day" : "Some days are closed"}</span><button className="button" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save opening hours"}</button>{message && <span role="status">{message}</span>}</div></section>
}
