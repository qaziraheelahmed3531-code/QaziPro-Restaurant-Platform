"use client"
import { useRef,useState } from "react"
import { useRouter } from "next/navigation"

type Campaign={id:string;subject:string;status:string;recipient_count:number;sent_count:number;failed_count:number}
export function CustomerPushManager({branchName,campaigns}:{branchName:string;campaigns:Campaign[]}){
  const router=useRouter()
  const [title,setTitle]=useState("");const [message,setMessage]=useState("");const [path,setPath]=useState("/")
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");const [error,setError]=useState("");const [confirm,setConfirm]=useState(false)
  const pending=useRef(false);const request=useRef<{fingerprint:string;id:string}|null>(null)
  async function send(){
    if(pending.current)return
    pending.current=true;setBusy(true);setError("");setNotice("")
    const draft={title:title.trim(),message:message.trim(),path}
    const fingerprint=JSON.stringify(draft)
    if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()}
    try{
      const response=await fetch("/api/customer-push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...draft,requestId:request.current.id})})
      const result=await response.json() as {error?:string;recipientCount?:number}
      if(!response.ok)throw Error(result.error||"Notification could not be queued.")
      setNotice(result.recipientCount?`Queued for ${result.recipientCount} opted-in customers. Queued is not delivered; refresh delivery history to check provider results.`:"No opted-in browser customers in this branch. No notifications were sent.")
      setTitle("");setMessage("");setConfirm(false);request.current=null;router.refresh()
    }catch(error){setError(error instanceof Error?error.message:"Connection interrupted. Retry this same draft.")}
    finally{pending.current=false;setBusy(false)}
  }
  return <div className="page-stack"><div className="page-heading"><div><span className="eyebrow">CUSTOMER MESSAGING</span><h1>Browser notifications</h1><p>Only customers who opted into offers in {branchName}. Private order updates are sent separately.</p></div></div>
    <section className="panel"><form className="form-grid" onSubmit={event=>{event.preventDefault();setConfirm(true)}}>
      <label>Title<input required minLength={3} maxLength={140} value={title} onChange={e=>{setTitle(e.target.value);setConfirm(false)}} disabled={busy}/></label>
      <label>Message<textarea required minLength={3} maxLength={500} value={message} onChange={e=>{setMessage(e.target.value);setConfirm(false)}} disabled={busy}/></label>
      <label>Open on click<select value={path} onChange={e=>{setPath(e.target.value);setConfirm(false)}} disabled={busy}><option value="/">Restaurant menu</option><option value="/#deals">Restaurant deals</option><option value="/orders">Customer&apos;s orders</option></select></label>
      <aside className="state-box" aria-label="Notification preview"><strong>{title||"Notification title"}</strong><p>{message||"Your message preview appears here."}</p><small>Opens this restaurant&apos;s website only.</small></aside>
      {confirm?<div role="group" aria-label="Confirm notification"><p>Queue this message for opted-in customers in {branchName}?</p><button className="button" type="button" disabled={busy} onClick={()=>void send()}>{busy?"Queueing…":"Confirm and queue"}</button><button className="button button--outline" type="button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></div>:<button className="button" type="submit">Review notification</button>}
    </form>{error&&<p role="alert" className="inline-notice is-error">{error}</p>}{notice&&<p role="status" className="inline-notice">{notice}</p>}</section>
    <section className="panel"><div className="panel-header"><h2>Delivery history</h2><button className="button button--outline" onClick={()=>router.refresh()}>Refresh status</button></div>{campaigns.length?campaigns.map(item=><article key={item.id} className="state-box"><strong>{item.subject}</strong><p>{item.status} · {item.sent_count}/{item.recipient_count} accepted by provider · {item.failed_count} failed</p></article>):<p className="state-box">No browser campaigns in this branch yet.</p>}</section>
  </div>
}
