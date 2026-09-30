import {useState} from "react";
import {db,deviceId} from "./db";
export function DeviceSettings({branchId}:{branchId:string}){
 const [busy,setBusy]=useState(false),[update,setUpdate]=useState<{status:string;message:string;version?:string}|null>(null),[notice,setNotice]=useState("");
 const action=async(kind:"check"|"download"|"install")=>{
  setBusy(true);try{setUpdate(await window.desktopUpdates?.run(kind)??{status:"NOT_CONFIGURED",message:"Updates require the installed Windows app."});}
  catch{setNotice("Update service is unavailable. Saved sales are unchanged.");}finally{setBusy(false);}
 };
 const diagnostics=async()=>{
  setBusy(true);try{
   const [meta,id,rows,shifts,prints]=await Promise.all([window.desktopPOS?.meta(),deviceId(),db.orders.where("branchId").equals(branchId).toArray(),db.shifts.where("branchId").equals(branchId).toArray(),db.printJobs.where("branchId").equals(branchId).toArray()]);
   // Deliberate allowlist: no customer, receipt, token, address, payload or stack.
   const summary={schemaVersion:db.verno,appVersion:meta?.version,platform:meta?.platform,deviceId:id,branchId,online:navigator.onLine,generatedAt:new Date().toISOString(),counts:{pending:rows.filter(r=>r.syncState!=="SYNCED").length,attention:rows.filter(r=>r.syncNeedsAttention).length,shiftsPending:shifts.filter(s=>s.syncedRevision!==(s.revision??1)).length,shiftsAttention:shifts.filter(s=>s.syncNeedsAttention).length,kitchenAttention:prints.filter(p=>p.state!=="SUBMITTED").length},lastSync:rows.map(r=>r.syncedAt).filter(Boolean).sort().at(-1)??null};
   const url=URL.createObjectURL(new Blob([JSON.stringify(summary,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="qazipro-device-diagnostics.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice("Diagnostics prepared without customer details or credentials.");
  }catch{setNotice("Diagnostics could not be prepared. Check available device storage.");}finally{setBusy(false);}
 };
 return <section aria-label="Device and updates"><h2>Device & updates</h2><p>Updates never restart an active checkout. Unsynced sales and unfinished carts must be resolved first.</p><button disabled={busy} onClick={()=>void action("check")}>{busy?"Working…":"Check signed update"}</button>{update?.status==="AVAILABLE"&&<button disabled={busy} onClick={()=>void action("download")}>Download update</button>}{update?.status==="READY"&&<button disabled={busy} onClick={()=>void action("install")}>Install and restart</button>}{update&&<p role="status">{update.version?`v${update.version} · `:""}{update.message}</p>}<button disabled={busy} onClick={()=>void diagnostics()}>Export safe diagnostics</button><button onClick={()=>void window.desktopFullscreen?.()}>Toggle full screen (F11)</button><p>{notice}</p><p>Do not uninstall or reset this Windows profile with pending sales. Close and update normally to preserve the local database.</p></section>;
}
