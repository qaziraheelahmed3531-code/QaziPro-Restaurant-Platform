"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function CashRefund({paymentId,maximum,method="CASH"}:{paymentId:string;maximum:number;method?:string}) {
  const router=useRouter();const [open,setOpen]=useState(false);const [amount,setAmount]=useState("");const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("")
  const refund=async()=>{
    setBusy(true);setError("")
    const result=await createClient().rpc("record_manual_refund",{p_payment_id:paymentId,p_amount:Number(amount),p_reason:reason})
    if(result.error)setError(result.error.message);else{setOpen(false);router.refresh()}
    setBusy(false)
  }
  return <><button className="button button--outline" onClick={()=>setOpen(true)}>Record refund</button>{open&&<div className="drawer-backdrop"><section className="editor" role="dialog" aria-modal="true" aria-labelledby={`refund-${paymentId}`}><header><h2 id={`refund-${paymentId}`}>Record returned payment</h2><button aria-label="Close refund" disabled={busy} onClick={()=>setOpen(false)}>×</button></header><form onSubmit={event=>{event.preventDefault();void refund()}}><div className="editor-form"><p className="is-wide">{method==="CASH"?"Confirm physical cash has been returned. This records the refund against the open cash drawer.":"Confirm this payment has already been returned through your bank or card terminal. This only records the refund; it does not transfer funds."}</p><label>Amount (PKR)<input required type="number" min="1" max={maximum} step="1" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>Reason<textarea required minLength={3} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>{error&&<p role="alert" className="inline-notice is-error">{error}</p>}</div><footer className="editor-footer"><button type="button" className="button button--outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="button button--danger" disabled={busy}>{busy?"Recording…":"Confirm recorded refund"}</button></footer></form></section></div>}</>
}
