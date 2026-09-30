import { useState } from "react";
import { db } from "./db";

export async function printReceipt(branchId:string) {
  if(!window.desktopPrintReceipt)return {status:"FAILED",message:"Printing is available in the installed desktop application."};
  const deviceName=(await db.settings.get(`printer:${branchId}`))?.value;
  return window.desktopPrintReceipt({deviceName});
}
export function HardwareSettings({branchId}:{branchId:string}) {
  const [printers,setPrinters]=useState<Array<{name:string;displayName:string;isDefault:boolean;status:number}>>([]);
  const [selected,setSelected]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const inspect=async()=>{
    setBusy(true);try{
      if(!window.desktopPrinters)throw Error("Install the Desktop app to discover operating-system printers.");
      const [list,saved]=await Promise.all([window.desktopPrinters(),db.settings.get(`printer:${branchId}`)]);
      setPrinters(list);setSelected(saved?.value??"");
      setMessage(`${list.length} installed printer${list.length===1?"":"s"} found. Paper output still needs a physical test.`);
    }catch(error){setMessage(error instanceof Error?error.message:"Printer discovery failed.");}finally{setBusy(false);}
  };
  return <section aria-label="Hardware diagnostics">
    <h2>Receipt & kitchen printing</h2>
    <p>Receipt and configured kitchen copies use the Windows print dialog. A spooler acknowledgement does not confirm physical paper output.</p>
    <button className="setting-button" disabled={busy} onClick={()=>void inspect()}>{busy?"Finding printers…":"Find installed printers"}</button>
    <label>Printer for this branch<select value={selected} onChange={async event=>{
      const value=event.target.value;try{await db.settings.put({key:`printer:${branchId}`,value});setSelected(value);setMessage("Printer preference saved on this device.");}
      catch{setMessage("Printer preference could not be saved. Check device storage.");}
    }}><option value="">System default / choose in dialog</option>{printers.map(printer=><option key={printer.name} value={printer.name}>{printer.displayName||printer.name}{printer.isDefault?" (default)":""}</option>)}</select></label>
    {message&&<p role="status">{message}</p>}
    <p>Cash drawer and payment terminal: no hardware driver configured. Offline card capture is disabled; no card details are stored.</p>
  </section>;
}
