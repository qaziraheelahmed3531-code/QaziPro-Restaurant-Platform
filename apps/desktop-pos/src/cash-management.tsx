import {useState,useRef} from "react";
import {localId,recordLocalCashMovement} from "./db";
import {requireOfflinePermission} from "./offline-access";
import type {LocalOrder,LocalShift} from "./types";

export function CashManagement({shift,orders,businessId,onChange}:{shift:LocalShift;orders:LocalOrder[];businessId:string;onChange:()=>Promise<void>}){
  const [amount,setAmount]=useState(""),[reason,setReason]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const lock=useRef(false),intent=useRef(localId());
  const movements=shift.cashMovements??[];
  const sales=orders.filter(o=>o.shiftId===shift.id&&(o.paymentMethodCode??"CASH")==="CASH"&&o.operationalStatus!=="CANCELLED").reduce((sum,o)=>sum+o.total,0);
  const expected=shift.openingCash+sales+movements.reduce((sum,m)=>sum+(m.type==="CASH_IN"?m.amount:-m.amount),0);
  const record=async(type:"CASH_IN"|"CASH_OUT")=>{
    if(lock.current)return;lock.current=true;setBusy(true);
    try{
      await requireOfflinePermission(shift.branchId,businessId,"register.manage");
      await recordLocalCashMovement(shift.id,{id:intent.current,type,amount:Number(amount),reason:reason.trim(),createdAt:new Date().toISOString()});
      intent.current=localId();setAmount("");setReason("");setNotice("Cash movement saved on this device. It will sync when online.");await onChange();
    }catch(error){setNotice(error instanceof Error?error.message:"Cash movement could not be saved.");}
    finally{lock.current=false;setBusy(false);}
  };
  return <section aria-label="Shift cash management"><h2>This device · current shift</h2>
    <p>Opening cash: {shift.openingCash.toLocaleString()} · Known cash sales: {sales.toLocaleString()} · Local expected cash: {expected.toLocaleString()}</p>
    <p>Server reconciliation includes authoritative refunds. Cash movements and closing require manager register permission.</p>
    <label>Cash movement amount<input type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label>
    <label>Cash movement reason<input value={reason} maxLength={300} onChange={e=>setReason(e.target.value)} disabled={busy}/></label>
    <button disabled={busy||!amount||reason.trim().length<2} onClick={()=>void record("CASH_IN")}>Paid in</button>
    <button disabled={busy||!amount||reason.trim().length<2} onClick={()=>void record("CASH_OUT")}>Paid out / cash drop</button>
    <p role="status">{notice||shift.syncError||(shift.syncedRevision===(shift.revision??1)?"Shift changes synced":"Shift changes waiting to sync")}</p>
  </section>;
}
