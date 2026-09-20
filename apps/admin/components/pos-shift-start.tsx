"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { adminError } from "@/lib/admin-errors"
export function PosShiftStart({ branchId }: { branchId: string }) {
  const [cash,setCash]=useState("0");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter()
  return <form className="panel section-gap" onSubmit={async event=>{event.preventDefault();setBusy(true);const result=await createClient().rpc("open_pos_shift",{p_branch_id:branchId,p_opening_cash:Number(cash)});if(result.error)setError(adminError(result.error));else router.refresh();setBusy(false)}}><h2>Start your counter shift</h2><p>Enter cash already in your drawer. Full register reconciliation remains restricted to staff with Register access.</p><label>Opening cash (PKR)<input required type="number" min="0" step="1" value={cash} onChange={e=>setCash(e.target.value)}/></label><button className="button" disabled={busy}>Open my counter shift</button>{error&&<p role="alert">{error}</p>}</form>
}
