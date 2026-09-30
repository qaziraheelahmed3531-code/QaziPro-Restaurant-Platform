import Dexie,{type EntityTable} from "dexie"
import type {CatalogSnapshot,DesktopDraft,HeldOrder,LocalOrder,LocalShift,WebsiteOrder,KitchenPrintJob} from "./types"

class PosDatabase extends Dexie{
  catalogs!:EntityTable<CatalogSnapshot,"branchId">
  orders!:EntityTable<LocalOrder,"id">
  shifts!:EntityTable<LocalShift,"id">
  held!:EntityTable<HeldOrder,"id">
  settings!:EntityTable<{key:string;value:string},"key">
  drafts!:EntityTable<DesktopDraft,"key">
  cloudOrders!:EntityTable<WebsiteOrder & {branchId:string},"id">
  printJobs!:EntityTable<KitchenPrintJob,"id">
  constructor(){super("kings-cafe-offline-pos-v1",{chromeTransactionDurability:"strict"});this.version(1).stores({catalogs:"branchId,updatedAt",orders:"id,branchId,shiftId,businessDate,soldAt,syncState,serverOrderId",shifts:"id,branchId,status,openedAt",held:"id,createdAt",settings:"key"});this.version(2).stores({catalogs:"branchId,updatedAt",orders:"id,branchId,shiftId,businessDate,soldAt,syncState,serverOrderId,operationalStatus,paymentMethodCode",shifts:"id,branchId,status,openedAt",held:"id,createdAt",settings:"key"});this.version(3).stores({held:"id,branchId,createdAt"});this.version(4).stores({drafts:"key,branchId,userId",held:"id,branchId,userId,createdAt"});this.version(5).stores({cloudOrders:"id,branchId,updated_at"});this.version(6).stores({printJobs:"id,branchId,orderId,state,createdAt"})}
}
export const db=new PosDatabase()
export const localId=()=>crypto.randomUUID()
export async function deviceId(){return db.transaction("rw",db.settings,async()=>{const existing=await db.settings.get("deviceId");if(existing)return existing.value;const value=localId();await db.settings.put({key:"deviceId",value});return value})}
export async function activeShift(branchId:string){return db.shifts.where({branchId,status:"OPEN"}).first()}
export async function openShift(branchId:string,openingCash:number){
  if(!Number.isSafeInteger(openingCash)||openingCash<0)throw Error("Enter a valid whole opening cash amount.");
  return db.transaction("rw",db.shifts,async()=>{const existing=await activeShift(branchId);if(existing)return existing;const shift:LocalShift={id:localId(),branchId,openingCash,openedAt:new Date().toISOString(),closedAt:null,countedCash:null,status:"OPEN",syncedAt:null,revision:1};await db.shifts.add(shift);return shift});
}
export async function closeShift(id:string,countedCash:number){
  if(!Number.isSafeInteger(countedCash)||countedCash<0)throw Error("Enter a valid whole cash amount.");
  return db.transaction("rw",db.shifts,async()=>{
    const shift=await db.shifts.get(id);if(!shift)throw Error("Shift not found.");
    if(shift.status==="CLOSED")return shift;
    const closed={...shift,status:"CLOSED" as const,closedAt:new Date().toISOString(),countedCash,syncedAt:null,revision:(shift.revision??1)+1};
    await db.shifts.put(closed);return closed;
  });
}
export async function recordLocalCashMovement(shiftId:string,movement:NonNullable<LocalShift["cashMovements"]>[number]){
  if(!movement.id||!Number.isSafeInteger(movement.amount)||movement.amount<=0||movement.reason.trim().length<2||movement.reason.length>300||!["CASH_IN","CASH_OUT"].includes(movement.type))throw Error("Enter a positive cash amount and a reason.");
  return db.transaction("rw",db.shifts,async()=>{
    const shift=await db.shifts.get(shiftId);if(!shift||shift.status!=="OPEN")throw Error("An open shift is required.");
    if(shift.cashMovements?.some(row=>row.id===movement.id))return;
    await db.shifts.update(shiftId,{cashMovements:[...(shift.cashMovements??[]),movement],revision:(shift.revision??1)+1,syncedAt:null});
  });
}
export async function nextToken(branchId:string,date:string){return db.transaction("rw",db.orders,async()=>{const sameDay=await db.orders.where({branchId,businessDate:date}).toArray();return sameDay.reduce((max,row)=>Math.max(max,row.tokenNumber),0)+1})}
// Sequence allocation and sale insertion must commit or roll back together.
export async function commitSale(order:LocalOrder,draftKey?:string,heldId?:string|null){return db.transaction("rw",db.orders,db.drafts,db.held,db.settings,async()=>{
  const existing=await db.orders.get(order.id);if(existing)return existing;
  const token=await nextToken(order.branchId,order.businessDate);
  const device=(await deviceId()).replaceAll("-","").slice(0,8).toUpperCase();
  const saved={...order,tokenNumber:token,localNumber:`OFF-${device}-${order.businessDate.replaceAll("-","")}-${String(token).padStart(4,"0")}`};
  await db.orders.add(saved);if(draftKey)await db.drafts.delete(draftKey);if(heldId)await db.held.delete(heldId);return saved;
})}
export async function posLocked(){return (await db.settings.get("locked"))?.value==="true"}
export async function setPosLocked(value:boolean){await db.settings.put({key:"locked",value:String(value)})}
