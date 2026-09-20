"use client"
import { useEffect,useState } from "react"
import { formatPkr } from "@italian-pizza/shared"
import { createClient } from "@/lib/supabase/client"
type Summary={opening:number;sales:number;refunds:number;cashIn:number;cashOut:number;expected:number;counted:number|null;difference:number|null;status:string}
export function RegisterSummary({shiftId}:{shiftId:string}){
  const [data,setData]=useState<Summary|null>(null);const [error,setError]=useState("")
  useEffect(()=>{let active=true;const refresh=async()=>{const result=await createClient().rpc("register_summary",{p_shift_id:shiftId});if(active){if(result.error)setError(result.error.message);else{setData(result.data as Summary);setError("")}}};void refresh();const timer=setInterval(()=>void refresh(),10000);return()=>{active=false;clearInterval(timer)}},[shiftId])
  return <section className="panel section-gap"><div className="panel-header"><h2>Cash breakdown</h2><small>Updates every 10 seconds</small></div>{error?<p role="alert">{error}</p>:data?<div className="report-coverage">{Object.entries({"Opening cash":data.opening,"Cash sales":data.sales,"Cash returned":data.refunds,"Cash in":data.cashIn,"Cash out":data.cashOut,"Expected cash":data.expected,...(data.counted!==null?{"Counted cash":data.counted,"Difference":data.difference??0}:{})}).map(([label,value])=><span key={label}>{label}: <strong>{formatPkr(value)}</strong></span>)}</div>:<p>Loading shift breakdown…</p>}</section>
}
