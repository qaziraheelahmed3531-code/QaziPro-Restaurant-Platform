"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, X } from "lucide-react"
import { markAttentionRead } from "@/app/attention-actions"
import type { AttentionItem } from "@/lib/attention"

export function AttentionMenu() {
  const dialog=useRef<HTMLDialogElement>(null)
  const [data,setData]=useState<{items:AttentionItem[];hasMore:boolean}|null>(null)
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  const [revision,setRevision]=useState(0)
  const [pending,setPending]=useState<string|null>(null)
  const lock=useRef(false)
  useEffect(()=>{
    const controller=new AbortController()
    fetch('/api/attention',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok) throw Error('unavailable')
      const value=await response.json()
      if(!controller.signal.aborted) {setData(value);setError("")}
    }).catch(()=>{if(!controller.signal.aborted)setError('Notifications could not load. Please retry.')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return ()=>controller.abort()
  },[revision])
  const unread=data?.items.filter(item=>!item.read).length ?? 0
  async function mark(key:string) {
    if(lock.current)return
    lock.current=true;setPending(key);setError("")
    try {
      const result=await markAttentionRead(key)
      if(result.error)setError(result.error)
      else setData(value=>value?{...value,items:value.items.map(item=>item.key===key?{...item,read:true}:item)}:value)
    } catch {setError('Could not confirm the change. Refresh the list before retrying.')}
    finally {lock.current=false;setPending(null)}
  }
  return <><button type="button" className="icon-button attention-trigger" aria-label={unread?`Notifications, ${unread} unread in recent items`:"Notifications"} onClick={()=>dialog.current?.showModal()}><Bell/>{unread>0?<span className="attention-dot" aria-hidden="true"/>:null}</button>
    <dialog ref={dialog} className="confirmation-dialog attention-dialog" aria-labelledby="attention-title" aria-describedby="attention-description">
      <header><h2 id="attention-title">Notifications</h2><button className="icon-button" type="button" autoFocus aria-label="Close notifications" onClick={()=>dialog.current?.close()}><X/></button></header>
      <p id="attention-description">Recent unresolved incidents and failed deployments you can manage. Read status is personal to you.</p>
      {loading?<p role="status">Loading notifications…</p>:null}
      {error?<p role="alert" className="form-error">{error}</p>:null}
      {!loading && data && !data.items.length?<p>No incidents or failed deployments need attention.</p>:null}
      {data?.items.map(item=><article key={item.key} className="attention-item"><Link prefetch={false} href={item.href} onClick={()=>dialog.current?.close()}><strong>{item.title}</strong><small>{item.detail}</small></Link>{item.read?<span className="status status-neutral">Read</span>:<button type="button" className="button button-small button-secondary" disabled={pending!==null} onClick={()=>void mark(item.key)}>{pending===item.key?'Saving…':'Mark read'}</button>}</article>)}
      {data?.hasMore?<p>Showing the latest 20 items per source. Open System Health or Deployments for older records.</p>:null}
      <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={loading||pending!==null} onClick={()=>{setLoading(true);setRevision(value=>value+1)}}>Refresh notifications</button></div>
    </dialog></>
}
