"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MonitorCheck, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Device={id:string;device_name:string;app_version:string;is_active:boolean;last_catalog_at:string|null;last_sync_at:string|null;created_at:string;branches:{name:string;restaurant_name:string|null;city:string}|Array<{name:string;restaurant_name:string|null;city:string}>|null}
const stamp=(value:string|null)=>value?new Date(value).toLocaleString("en-PK",{timeZone:"Asia/Karachi"}):"Not yet"

export function DesktopPosDevices({initialDevices,canManage}:{initialDevices:Device[];canManage:boolean}){
  const router=useRouter();const [busy,setBusy]=useState("");const [error,setError]=useState("")
  const toggle=async(device:Device)=>{setBusy(device.id);setError("");const {error:problem}=await createClient().rpc("set_desktop_pos_device_active",{p_device_id:device.id,p_active:!device.is_active});if(problem)setError(problem.message);else router.refresh();setBusy("")}
  return <>
    <section className="metric-grid">
      <article className="metric-card"><span>Paired counters</span><strong>{initialDevices.length}</strong><small>Desktop installations registered to this business</small></article>
      <article className="metric-card"><span>Active devices</span><strong>{initialDevices.filter(device=>device.is_active).length}</strong><small>Allowed to download menus and upload sales</small></article>
      <article className="metric-card"><span>Pending reconnect</span><strong>{initialDevices.filter(device=>!device.last_sync_at).length}</strong><small>Paired, but no offline sale uploaded yet</small></article>
    </section>
    <section className="panel section-gap">
      <div className="panel-header"><div><h2>Desktop counters</h2><p>Disable a lost or retired counter immediately. Cached sales remain on that computer until access is restored.</p></div><MonitorCheck/></div>
      {error&&<p className="inline-notice is-error" role="alert">{error}</p>}
      {initialDevices.length?<div className="data-table-wrap"><table className="data-table"><thead><tr><th>Device</th><th>Restaurant</th><th>App</th><th>Last menu</th><th>Last order sync</th><th>Status</th><th>Action</th></tr></thead><tbody>{initialDevices.map(device=>{const branch=Array.isArray(device.branches)?device.branches[0]:device.branches;return <tr key={device.id}><td data-label="Device"><strong>{device.device_name}</strong><small>{device.id}</small></td><td data-label="Restaurant">{branch?.restaurant_name||branch?.name||"Branch"}<small>{branch?.city}</small></td><td data-label="App">v{device.app_version}</td><td data-label="Last menu">{stamp(device.last_catalog_at)}</td><td data-label="Last sync">{stamp(device.last_sync_at)}</td><td data-label="Status"><span className={`status-badge ${device.is_active?"is-success":"is-warning"}`}>{device.is_active?<><Wifi/> Active</>:<><WifiOff/> Disabled</>}</span></td><td data-label="Action">{canManage&&<button className={`button ${device.is_active?"button--outline":""}`} disabled={busy===device.id} onClick={()=>void toggle(device)}>{busy===device.id?<RefreshCw className="spin"/>:<ShieldCheck/>}{device.is_active?"Disable":"Enable"}</button>}</td></tr>})}</tbody></table></div>:<div className="empty-panel"><MonitorCheck/><p>No desktop counter has been paired yet. Open the Windows app online once and sign in with a staff account that has POS access.</p></div>}
    </section>
    <section className="panel section-gap"><div className="panel-header"><div><h2>How offline sync works</h2><p>The counter never waits for the website.</p></div></div><div className="security-list"><span>Menu, prices, options, restaurant name and logo are downloaded while online.</span><span>Every cash sale, held order, shift and replacement is saved locally first.</span><span>When internet returns, unsynced orders retry automatically with unique device/order keys.</span><span>Server-signed catalog snapshots reject changed or forged offline prices.</span></div></section>
  </>
}
