import {db} from "./db";
import {syncFailure} from "./outbox";
import type {LocalShift} from "./types";

type Receipt={id:string;revision:number;status:string};
let running:Promise<{synced:number;failed:number}>|null=null;
// The existing local shift is its durable outbox record. No second register model.
export function syncShifts(options:{branchIds:string[];retryAttention?:boolean;now?:()=>number;send:(shift:LocalShift)=>Promise<Receipt>}){
  if(running)return running;
  running=run(options).finally(()=>{running=null});return running;
}
async function run({branchIds,retryAttention=false,now=Date.now,send}:Parameters<typeof syncShifts>[0]){
  let synced=0,failed=0;
  for(const shift of await db.shifts.orderBy("openedAt").toArray()){
    const revision=shift.revision??1;
    if(!branchIds.includes(shift.branchId)||shift.syncedRevision===revision)continue;
    if(!retryAttention&&(shift.syncNeedsAttention||(shift.syncRetryAt&&Date.parse(shift.syncRetryAt)>now())))continue;
    // Never publish a final count while local sales from that shift are pending.
    if(shift.status==="CLOSED"&&(await db.orders.where("shiftId").equals(shift.id).toArray()).some(order=>order.syncState!=="SYNCED"))continue;
    try{
      const receipt=await send(shift);
      if(!receipt?.id||receipt.revision!==revision||receipt.status!==shift.status)throw Error("Uncertain shift acknowledgement");
      await db.transaction("rw",db.shifts,async()=>{
        const current=await db.shifts.get(shift.id);if(!current)return;
        await db.shifts.update(shift.id,{serverId:receipt.id,syncedRevision:revision,syncedAt:(current.revision??1)===revision?new Date(now()).toISOString():null,syncError:null,syncRetryAt:null,syncNeedsAttention:false});
      });synced++;
    }catch(error){
      const attempts=(shift.syncAttempts??0)+1,failure=syncFailure(error,attempts,now());
      await db.shifts.update(shift.id,{syncAttempts:attempts,syncError:failure.syncNeedsAttention?"Shift needs manager review. Cash records remain saved on this device.":"Shift sync interrupted. Saved cash records will retry automatically.",syncRetryAt:failure.syncRetryAt,syncNeedsAttention:failure.syncNeedsAttention});failed++;
    }
  }
  return {synced,failed};
}
