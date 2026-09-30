import { authStorage } from "./auth-storage";
const KEY = "sb-desktop-offline-access";
// Conservative device policy: one working day after the last successful server
// authorization. No cached grant is indefinite and clock rollback fails closed.
export const OFFLINE_ACCESS_MS = 24 * 60 * 60 * 1000;
export type OfflineAccess = {userId:string;branches:Array<{id:string;business_id:string;permissions?:string[]}>;verifiedAt:number;expiresAt:number};
function validAccess(value:unknown):value is OfflineAccess {
  if(!value||typeof value!=="object")return false;
  const v=value as OfflineAccess;
  return typeof v.userId==="string"&&v.userId.length>0&&Array.isArray(v.branches)&&v.branches.length>0&&
    v.branches.every(b=>b&&typeof b.id==="string"&&b.id.length>0&&typeof b.business_id==="string"&&b.business_id.length>0)&&
    Number.isFinite(v.verifiedAt)&&Number.isFinite(v.expiresAt)&&v.expiresAt>v.verifiedAt&&v.expiresAt-v.verifiedAt<=OFFLINE_ACCESS_MS;
}
export function permitsOffline(access:OfflineAccess|null,branchId:string,businessId:string,now=Date.now()) {
  return Boolean(validAccess(access) && now>=access.verifiedAt-60_000 && now<access.expiresAt &&
    access.expiresAt-access.verifiedAt<=OFFLINE_ACCESS_MS && access.branches.some(b=>b.id===branchId&&b.business_id===businessId));
}
export async function readOfflineAccess():Promise<OfflineAccess|null>{
  try{const raw=await authStorage.getItem(KEY);if(!raw)return null;const v=JSON.parse(raw);
    return validAccess(v)?v:null;
  }catch{return null;}
}
export async function saveOfflineAccess(userId:string,branches:OfflineAccess["branches"]){
  const verifiedAt=Date.now();await authStorage.setItem(KEY,JSON.stringify({userId,branches,verifiedAt,expiresAt:verifiedAt+OFFLINE_ACCESS_MS}));
}
export async function clearOfflineAccess(){await authStorage.removeItem(KEY);}
export async function requireOfflinePermission(branchId:string,businessId:string,permission:string){
  const grant=await readOfflineAccess();
  if(!permitsOffline(grant,branchId,businessId)||!grant?.branches.some(b=>b.id===branchId&&b.business_id===businessId&&Array.isArray(b.permissions)&&b.permissions.includes(permission)))
    throw Error("Manager permission is required. Reconnect with an authorized account to refresh access.");
}
