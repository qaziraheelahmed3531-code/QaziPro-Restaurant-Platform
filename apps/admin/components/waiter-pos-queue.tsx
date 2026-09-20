"use client"

import { useRouter } from "next/navigation"
import { Banknote, Check, ChevronDown, Clock3, UtensilsCrossed } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { formatPkr } from "@italian-pizza/shared"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { createClient } from "@/lib/supabase/client"

export type WaiterPosOrder={id:string;order_number:string;token_number:number;table_reference:string|null;waiter_name:string|null;customer_name:string;order_notes:string|null;total:number;status:string;payment_status:string;created_at:string;order_items:Array<{id:string;product_name:string;quantity:number;line_total:number;order_item_modifiers:Array<{group_name:string;option_name:string}>}>}

export function WaiterPosQueue({branchId,shift,initialOrders}:{branchId:string;shift:{id:string}|null;initialOrders:WaiterPosOrder[]}){
  const router=useRouter()
  const [orders,setOrders]=useState(initialOrders)
  const [selected,setSelected]=useState<string|null>(null)
  const [cash,setCash]=useState("")
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState("")
  const settlingRef=useRef(false)
  useEffect(()=>{const client=createClient();const channel=client.channel(`waiter-pos-queue-${branchId}`).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`branch_id=eq.${branchId}`},()=>{if(!settlingRef.current)router.refresh()}).subscribe();return()=>{void client.removeChannel(channel)}},[branchId,router])
  if(!orders.length&&!message)return null
  const settle=async(order:WaiterPosOrder)=>{if(!shift){setMessage("Open your register shift before collecting a waiter payment.");return}const received=Math.round(Number(cash)||0);if(received<order.total){setMessage("Cash received is less than the order total.");return}settlingRef.current=true;setBusy(true);setMessage("");const {data,error}=await createClient().rpc("settle_waiter_pos_order",{p_order_id:order.id,p_shift_id:shift.id,p_cash_received:received});if(error){settlingRef.current=false;setMessage(error.message?.toLowerCase().includes("register shift")?error.message:"Unable to settle this waiter order. Refresh and try again.");setBusy(false);return}const result=data as {change:number};setOrders(rows=>rows.filter(row=>row.id!==order.id));setSelected(null);setCash("");setMessage(`${order.order_number} paid. Change ${formatPkr(Number(result.change))}.`);setBusy(false);window.setTimeout(()=>{settlingRef.current=false},1500)}
  return <section className="waiter-pos-queue no-print"><header><div><span className="eyebrow">LIVE TABLE SERVICE</span><h2>Waiter orders</h2><p>Orders sent from waiter tablets are already in the kitchen. Collect payment here.</p></div><b>{orders.length} awaiting payment</b></header>{message&&<p className={`inline-notice ${message.includes("paid.")?"":"is-error"}`} role="status">{message}</p>}<div className="waiter-pos-cards">{orders.map(order=>{const open=selected===order.id;return <article key={order.id}><button className="waiter-pos-summary" onClick={()=>{setSelected(open?null:order.id);setCash(open?"":String(order.total))}}><span><small>TABLE</small><strong>{order.table_reference??"Guest"}</strong></span><span><small>WAITER</small><strong>{order.waiter_name??"Staff"}</strong></span><span><small>ORDER / TOKEN</small><strong>{order.order_number} · {String(order.token_number).padStart(3,"0")}</strong></span><span><small>TOTAL</small><strong>{formatPkr(Number(order.total))}</strong></span><ChevronDown className={open?"is-open":""}/></button>{open&&<div className="waiter-pos-detail"><div className="waiter-pos-items">{order.order_items.map(item=><div key={item.id}><span><strong>{item.quantity}× {item.product_name}</strong>{item.order_item_modifiers.map(option=><small key={`${item.id}-${option.option_name}`}>{option.group_name}: {option.option_name}</small>)}</span><b>{formatPkr(Number(item.line_total))}</b></div>)}{order.order_notes&&<p><UtensilsCrossed/>{order.order_notes}</p>}</div><div className="waiter-pos-payment"><span><Clock3/>{new Date(order.created_at).toLocaleTimeString("en-PK",{timeZone:"Asia/Karachi",hour:"2-digit",minute:"2-digit"})} · Kitchen: {order.status.replaceAll("_"," ")}</span><label>Cash received<input type="number" min={0} value={cash} onChange={event=>setCash(event.target.value)}/></label><button className="button button--outline" onClick={()=>setCash(String(order.total))}><Banknote/>Exact cash</button><button className="button" disabled={busy||!shift} onClick={()=>void settle(order)}>{busy?<AppLoader active delay={0} label="Recording payment"/>:<Check/>}{busy?"Saving…":"Mark paid"}</button></div></div>}</article>})}</div></section>
}
