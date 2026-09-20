import { ReceiptDocument,type ReceiptData } from "@/components/receipt-document"

export function ReceiptBatch({receipt,copies=1,includeKitchen=false,kitchenPrices=false}:{receipt:ReceiptData;copies?:number;includeKitchen?:boolean;kitchenPrices?:boolean}){
  const count=Math.min(5,Math.max(1,Math.round(copies)))
  return <div className="print-batch">{Array.from({length:count},(_,index)=><div className="receipt-copy" key={index}><p className="receipt-copy-label no-print">Customer receipt{count>1?` · Copy ${index+1}`:""}</p><ReceiptDocument receipt={receipt}/></div>)}{includeKitchen&&receipt.kind!=="kitchen"&&<div className="receipt-copy receipt-copy--kitchen"><p className="receipt-copy-label no-print">Kitchen preparation ticket · not a second invoice</p><ReceiptDocument receipt={{...receipt,kind:"kitchen",showPrices:kitchenPrices}}/></div>}</div>
}
