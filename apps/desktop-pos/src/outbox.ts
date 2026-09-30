import { db } from "./db";
import type { LocalOrder } from "./types";

export type SyncReceipt = { id:string; orderNumber:string; status?:LocalOrder["operationalStatus"] };
type Dependencies = {
  branchIds: string[];
  send: (order:LocalOrder)=>Promise<SyncReceipt>;
  now?:()=>number;
  retryAttention?:boolean;
};
const LEASE_MS = 120_000;
export function syncFailure(error: unknown, attempts:number, now:number) {
  const code = String((error as {code?:string})?.code ?? "");
  const transient = !code || /^(08|40|53|57|PGRST00)/.test(code) || code === "TIMEOUT";
  return {
    syncState: "FAILED" as const,
    syncStartedAt: null,
    syncNeedsAttention: !transient,
    syncRetryAt: transient ? new Date(now + Math.min(300_000, 5_000 * 2 ** Math.min(attempts - 1, 6))*(0.8+Math.random()*0.4)).toISOString() : null,
    syncError: transient
      ? "Connection interrupted. Your saved sale is safe and will retry automatically."
      : "This sale needs manager review. Check branch access, catalog and payment settings, then retry sync.",
  };
}

// Durable leases protect even separate renderer contexts. An expired SYNCING
// entry replays its original order UUID; the canonical server RPC deduplicates it.
export async function drainOutbox({branchIds,send,now=Date.now,retryAttention=false}:Dependencies) {
  const allowed=new Set(branchIds);
  const candidates=await db.orders.where("syncState").anyOf("PENDING","FAILED","SYNCING").sortBy("soldAt");
  let synced=0,failed=0;
  for(const candidate of candidates){
    if(!allowed.has(candidate.branchId))continue;
    const order=await db.transaction("rw",db.orders,async()=>{
      const row=await db.orders.get(candidate.id);
      if(!row||row.syncState==="SYNCED")return null;
      if(row.syncState==="SYNCING" && row.syncStartedAt && now()-Date.parse(row.syncStartedAt)<LEASE_MS)return null;
      if(row.syncState==="FAILED" && !retryAttention &&
        (row.syncNeedsAttention || (row.syncRetryAt && Date.parse(row.syncRetryAt)>now())))return null;
      const claimed={...row,syncState:"SYNCING" as const,syncStartedAt:new Date(now()).toISOString(),syncAttempts:(row.syncAttempts??0)+1,syncError:null};
      await db.orders.put(claimed);return claimed;
    });
    if(!order)continue;
    try{
      const receipt=await send(order);
      if(!receipt || typeof receipt.id!=="string" || !receipt.id || typeof receipt.orderNumber!=="string" || !receipt.orderNumber)
        throw new Error("Uncertain server acknowledgement");
      await db.transaction("rw",db.orders,async()=>{
        const current=await db.orders.get(order.id);
        if(!current)return;
        const unchanged=(current.revision??0)===(order.revision??0);
        await db.orders.update(order.id,{
          syncState:unchanged?"SYNCED":"PENDING",serverOrderId:receipt.id,serverOrderNumber:receipt.orderNumber,
          operationalStatus:unchanged?(receipt.status??current.operationalStatus):current.operationalStatus,
          syncedAt:new Date(now()).toISOString(),syncError:null,syncStartedAt:null,syncRetryAt:null,syncNeedsAttention:false,
        });
      });
      synced++;
    }catch(error){
      failed++;
      await db.transaction("rw",db.orders,async()=>{
        const current=await db.orders.get(order.id);
        if(current && (current.revision??0)===(order.revision??0))
          await db.orders.update(order.id,syncFailure(error,order.syncAttempts!,now()));
      });
    }
  }
  return {synced,failed};
}
