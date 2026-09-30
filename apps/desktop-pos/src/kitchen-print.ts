import {db} from "./db";
import type {CatalogSnapshot,KitchenPrintJob,LocalOrder} from "./types";

export async function prepareKitchenJob(catalog:CatalogSnapshot,order:LocalOrder){
  if(order.branchId!==catalog.branchId||order.operationalStatus==="CANCELLED")throw Error("This order cannot be sent to this kitchen.");
  const id=`kitchen:${order.id}:${order.revision??0}`;
  const existing=await db.printJobs.get(id);if(existing)return existing;
  const deviceName=(await db.settings.get(`kitchen-printer:${catalog.branchId}`))?.value;
  if(!deviceName)throw Error("Choose a kitchen printer in Settings first. Cloud KDS sync is separate.");
  const now=new Date().toISOString();
  const job:KitchenPrintJob={id,branchId:catalog.branchId,orderId:order.id,deviceName,state:"QUEUED",message:"Kitchen ticket saved; awaiting local print.",createdAt:now,updatedAt:now,ticket:{
    width:catalog.receiptSettings?.width??80,title:order.replacement?"REPLACEMENT — KITCHEN":"KITCHEN TICKET",branch:catalog.branchName,
    reference:`${order.serverOrderNumber??order.localNumber} · Token ${order.tokenNumber} · ${order.orderType}${order.tableReference?` · Table ${order.tableReference}`:""}`,
    notes:order.notes,lines:order.items.map(item=>({quantity:item.quantity,name:item.name,details:[...(item.variantName?[`Variant: ${item.variantName}`]:[]),...item.selections.map(selection=>`${selection.groupName}: ${selection.optionName}`)]}))}};
  return db.transaction("rw",db.printJobs,async()=>{const saved=await db.printJobs.get(id);if(saved)return saved;await db.printJobs.add(job);return job});
}

type Result={status:string;message:string};
// Claim is durable before native IPC. A crash after this point leaves PRINTING:
// it requires operator inspection, never automatic replay of a possibly fired ticket.
export async function dispatchKitchenJob(branchId:string,id:string,send:(job:KitchenPrintJob)=>Promise<Result>){
  const job=await db.transaction("rw",db.printJobs,async()=>{
    const row=await db.printJobs.get(id);if(!row||row.branchId!==branchId)throw Error("Kitchen ticket is unavailable for this branch.");
    if(row.state!=="QUEUED")return null;
    await db.printJobs.update(id,{state:"PRINTING",updatedAt:new Date().toISOString(),message:"Check the printer before retrying if this workstation restarts."});return row;
  });
  if(!job)return "Ticket was already attempted. Check Hardware diagnostics before requesting another copy.";
  let result:Result;
  try{result=await send(job)}catch{result={status:"UNKNOWN",message:"Printer response was interrupted. Check output before retrying."}}
  const state:KitchenPrintJob["state"]=result.status==="SUBMITTED"?"SUBMITTED":result.status==="CANCELLED"?"CANCELLED":result.status==="FAILED"||result.status==="BUSY"?"FAILED":"UNKNOWN";
  const message=state==="SUBMITTED"?"Kitchen ticket sent to the operating system. Check physical output.":state==="CANCELLED"?"Kitchen printing cancelled. Saved ticket remains in Hardware diagnostics.":state==="FAILED"?"Kitchen printer unavailable. Check connection and retry from Hardware diagnostics.":"Kitchen print status is uncertain. Check output before requesting another copy.";
  await db.printJobs.update(id,{state,message,updatedAt:new Date().toISOString()});return message;
}

// Explicit operator-confirmed reprint gets a new durable identity and a COPY
// heading. The original job stays as the audit evidence of the first attempt.
export async function copyKitchenJob(branchId:string,id:string){
  const job=await db.printJobs.get(id);if(!job||job.branchId!==branchId)throw Error("Kitchen ticket is unavailable for this branch.");
  const deviceName=(await db.settings.get(`kitchen-printer:${branchId}`))?.value;
  if(!deviceName)throw Error("Choose an available kitchen printer before requesting a copy.");
  const now=new Date().toISOString(),copy={...job,deviceName,id:`${job.orderId}:copy:${crypto.randomUUID()}`,state:"QUEUED" as const,message:"Explicit kitchen copy requested.",createdAt:now,updatedAt:now,ticket:{...job.ticket,title:"COPY — KITCHEN TICKET"}};
  await db.printJobs.add(copy);return copy;
}
