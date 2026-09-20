import Dexie,{type EntityTable} from "dexie"
import type {CatalogSnapshot,HeldOrder,LocalOrder,LocalShift} from "./types"

class PosDatabase extends Dexie{
  catalogs!:EntityTable<CatalogSnapshot,"branchId">
  orders!:EntityTable<LocalOrder,"id">
  shifts!:EntityTable<LocalShift,"id">
  held!:EntityTable<HeldOrder,"id">
  settings!:EntityTable<{key:string;value:string},"key">
  constructor(){super("kings-cafe-offline-pos-v1");this.version(1).stores({catalogs:"branchId,updatedAt",orders:"id,branchId,shiftId,businessDate,soldAt,syncState,serverOrderId",shifts:"id,branchId,status,openedAt",held:"id,createdAt",settings:"key"});this.version(2).stores({catalogs:"branchId,updatedAt",orders:"id,branchId,shiftId,businessDate,soldAt,syncState,serverOrderId,operationalStatus,paymentMethodCode",shifts:"id,branchId,status,openedAt",held:"id,createdAt",settings:"key"})}
}
export const db=new PosDatabase()
export const localId=()=>crypto.randomUUID()
export async function deviceId(){const existing=await db.settings.get("deviceId");if(existing)return existing.value;const value=localId();await db.settings.put({key:"deviceId",value});return value}
export async function activeShift(branchId:string){return db.shifts.where({branchId,status:"OPEN"}).first()}
export async function openShift(branchId:string,openingCash:number){const existing=await activeShift(branchId);if(existing)return existing;const shift:LocalShift={id:localId(),branchId,openingCash:Math.max(0,Math.floor(openingCash)),openedAt:new Date().toISOString(),closedAt:null,countedCash:null,status:"OPEN",syncedAt:null};await db.shifts.add(shift);return shift}
export async function closeShift(id:string,countedCash:number){await db.shifts.update(id,{status:"CLOSED",closedAt:new Date().toISOString(),countedCash:Math.max(0,Math.floor(countedCash)),syncedAt:null})}
export async function nextToken(branchId:string,date:string){return db.transaction("rw",db.orders,async()=>{const sameDay=await db.orders.where({branchId,businessDate:date}).toArray();return sameDay.reduce((max,row)=>Math.max(max,row.tokenNumber),0)+1})}
export async function posLocked(){return (await db.settings.get("locked"))?.value==="true"}
export async function setPosLocked(value:boolean){await db.settings.put({key:"locked",value:String(value)})}
