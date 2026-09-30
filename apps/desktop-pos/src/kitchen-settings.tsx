import {useEffect,useRef,useState} from "react";
import {db} from "./db";
import {copyKitchenJob,dispatchKitchenJob,prepareKitchenJob} from "./kitchen-print";
import {requireOfflinePermission} from "./offline-access";
import type {CatalogSnapshot,KitchenPrintJob,LocalOrder} from "./types";

const send=(job:KitchenPrintJob)=>window.desktopPrintTicket?window.desktopPrintTicket({deviceName:job.deviceName,ticket:job.ticket}):Promise.resolve({status:"FAILED",message:"Installed desktop application required."});
export function KitchenOrderPrint({catalog,order}:{catalog:CatalogSnapshot;order:LocalOrder}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const lock=useRef(false);
 const print=async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{
   await requireOfflinePermission(catalog.branchId,catalog.businessId,"receipts.print");
   const job=await prepareKitchenJob(catalog,order);setMessage(await dispatchKitchenJob(catalog.branchId,job.id,send));
 }catch(error){setMessage(error instanceof Error?error.message:"Kitchen ticket could not be prepared. Your sale is saved.");}finally{setBusy(false);lock.current=false}};
 return <div><button disabled={busy} onClick={()=>void print()}>{busy?"Preparing kitchen ticket…":"Send local kitchen ticket"}</button><small>Additional local ticket. If receipt printing already included a kitchen copy, do not send another.</small><p role="status">{message}</p></div>;
}
export function KitchenSettings({catalog}:{catalog:CatalogSnapshot}){
 const [printers,setPrinters]=useState<Array<{name:string;displayName:string}>>([]),[selected,setSelected]=useState(""),[jobs,setJobs]=useState<KitchenPrintJob[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");const lock=useRef(false);
 const refresh=async()=>{setJobs((await db.printJobs.where("branchId").equals(catalog.branchId).sortBy("createdAt")).reverse().slice(0,30));};
 useEffect(()=>{let active=true;void Promise.all([db.settings.get(`kitchen-printer:${catalog.branchId}`),db.printJobs.where("branchId").equals(catalog.branchId).sortBy("createdAt")]).then(([setting,rows])=>{if(active){setSelected(setting?.value??"");setJobs(rows.reverse().slice(0,30));}}).catch(()=>{if(active)setMessage("Saved printer settings could not be read.");});return()=>{active=false};},[catalog.branchId]);
 const action=async(work:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);try{await work();await refresh()}catch(error){setMessage(error instanceof Error?error.message:"Printer action failed. Saved orders are unchanged.");}finally{lock.current=false;setBusy(false)}};
 return <section aria-label="Local kitchen diagnostics"><h2>Local kitchen printer</h2><p>One branch kitchen destination. No LAN KDS or station routing is configured. Tickets print locally without internet; cloud KDS delivery is separate.</p>
 <button disabled={busy} onClick={()=>void action(async()=>{setPrinters(await window.desktopPrinters?.()??[]);})}>Discover kitchen printers</button>
 <label>Kitchen printer<select disabled={busy} value={selected} onChange={event=>{const value=event.target.value;void action(async()=>{await requireOfflinePermission(catalog.branchId,catalog.businessId,"register.manage");await db.settings.put({key:`kitchen-printer:${catalog.branchId}`,value});setSelected(value);setMessage("Kitchen destination saved on this device.");});}}><option value="">Not configured</option>{selected&&!printers.some(p=>p.name===selected)&&<option value={selected}>{selected} (discovery required)</option>}{printers.map(p=><option key={p.name} value={p.name}>{p.displayName||p.name}</option>)}</select></label>
 <button disabled={busy||!selected} onClick={()=>void action(async()=>{await requireOfflinePermission(catalog.branchId,catalog.businessId,"receipts.print");const result=await window.desktopPrintTicket?.({deviceName:selected,ticket:{width:catalog.receiptSettings?.width??80,title:"TEST — NOT AN ORDER",branch:catalog.branchName,reference:new Date().toLocaleString(),notes:"Verify paper width and legibility. No sale or kitchen dispatch was created.",lines:[{quantity:1,name:"QaziPRO printer diagnostic",details:["58/80mm layout · Local printer path"]}]}});setMessage(result?.message??"Installed desktop application required.");})}>Test kitchen printer</button>
 <p role="status">{message}</p><h3>Recent local kitchen jobs</h3>{jobs.map(job=><div key={job.id}><strong>{job.ticket.reference}</strong><p>{job.state} · {job.message}</p><button disabled={busy} onClick={()=>void action(async()=>{await requireOfflinePermission(catalog.branchId,catalog.businessId,"receipts.print");if(job.state==="QUEUED"){setMessage(await dispatchKitchenJob(catalog.branchId,job.id,send));return;}if(!window.confirm("Check the printer first. This can duplicate a preparation ticket. Print an explicitly marked COPY?"))return;const copy=await copyKitchenJob(catalog.branchId,job.id);setMessage(await dispatchKitchenJob(catalog.branchId,copy.id,send));})}>{job.state==="QUEUED"?"Send saved ticket":"Check output / print copy"}</button></div>)}{!jobs.length&&<p>No local kitchen tickets have been requested.</p>}
 </section>;
}
