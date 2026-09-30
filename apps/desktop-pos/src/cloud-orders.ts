import { db } from "./db";
import type { WebsiteOrder } from "./types";
export type OrderCursor={updatedAt:string;id:string};
export type OrderPage={orders:WebsiteOrder[];cursor?:OrderCursor|null;hasMore?:boolean};
const inFlight=new Map<string,Promise<WebsiteOrder[]>>();
export const cachedCloudOrders=async(branchId:string)=>(await db.cloudOrders.where("branchId").equals(branchId).toArray()).sort((a,b)=>b.created_at.localeCompare(a.created_at));
// Persist the received page and its cursor together. A crash/retry can replay
// the page safely but can never advance past orders that were not saved.
export function backfillCloudOrders(branchId:string,fetchPage:(cursor:OrderCursor|null)=>Promise<OrderPage>):Promise<WebsiteOrder[]> {
  const running=inFlight.get(branchId);if(running)return running;
  const run=(async()=>{
    const key=`cloud-orders:${branchId}:cursor`;
    let cursor:OrderCursor|null=JSON.parse((await db.settings.get(key))?.value??"null");
    // Yield after a bounded batch; the durable cursor resumes next refresh.
    for(let page=0;page<25;page++){
      const result=await fetchPage(cursor);
      if(!Array.isArray(result.orders))throw Error("Order service returned an invalid page.");
      if(result.orders.length && (!result.cursor || (cursor&&result.cursor.id===cursor.id&&result.cursor.updatedAt===cursor.updatedAt)))
        throw Error("Order service did not confirm sync progress.");
      await db.transaction("rw",db.cloudOrders,db.settings,async()=>{
        await db.cloudOrders.bulkPut(result.orders.map(order=>({...order,branchId})));
        if(result.cursor)await db.settings.put({key,value:JSON.stringify(result.cursor)});
      });
      cursor=result.cursor??cursor;
      if(!result.hasMore)break;
    }
    return cachedCloudOrders(branchId);
  })().finally(()=>inFlight.delete(branchId));
  inFlight.set(branchId,run);return run;
}
