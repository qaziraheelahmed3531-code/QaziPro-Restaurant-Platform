import {db} from "./db";
import type {LocalOrder} from "./types";

type CloudStatus={id:string;status:string};
const allowed=new Set(["CONFIRMED","PREPARING","READY","DELIVERED","CANCELLED"]);
const running=new Map<string,Promise<void>>();
// Reconcile canonical kitchen/order state, never overwrite local money or a
// pending mutation. Server queries remain business + branch scoped by caller.
export function reconcileOrderStatuses(branchId:string,fetchStatuses:(ids:string[])=>Promise<CloudStatus[]>){
  const existing=running.get(branchId);if(existing)return existing;
  const work=(async()=>{
    const orders=(await db.orders.where("branchId").equals(branchId).toArray()).filter(row=>row.syncState==="SYNCED"&&row.serverOrderId);
    for(let offset=0;offset<orders.length;offset+=100){
      const batch=orders.slice(offset,offset+100),byServerId=new Map(batch.map(order=>[order.serverOrderId!,order]));
      const statuses=await fetchStatuses([...byServerId.keys()]);
      await db.transaction("rw",db.orders,async()=>{
        for(const remote of statuses){
          const previous=byServerId.get(remote.id);if(!previous||!allowed.has(remote.status))continue;
          const current=await db.orders.get(previous.id);
          if(current?.branchId!==branchId||current.syncState!=="SYNCED"||current.serverOrderId!==remote.id||(current.revision??0)!==(previous.revision??0))continue;
          if(current.operationalStatus!==remote.status)await db.orders.update(current.id,{operationalStatus:remote.status as LocalOrder["operationalStatus"]});
        }
      });
    }
  })().finally(()=>running.delete(branchId));
  running.set(branchId,work);return work;
}
