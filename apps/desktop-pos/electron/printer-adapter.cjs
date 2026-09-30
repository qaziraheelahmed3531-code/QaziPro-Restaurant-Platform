// OS spooler acknowledgement is NOT proof that paper physically printed.
function createPrinterAdapter(contents) {
  let printing = false
  return {
    async list() {
      return (await contents.getPrintersAsync()).map(({name,displayName,isDefault,status})=>({name,displayName,isDefault,status}))
    },
    async print(options={}) {
      if(printing)return {status:'BUSY',message:'A print dialog is already open.'}
      if(contents.isDestroyed())return {status:'FAILED',message:'Receipt window is unavailable.'}
      printing=true
      try {
      const name=typeof options.deviceName==='string'?options.deviceName:''
      if(name && !(await contents.getPrintersAsync()).some(printer=>printer.name===name))
        return {status:'FAILED',message:'The selected printer is unavailable. Check its connection or choose another printer.'}
      // Always present OS confirmation. Never silently retry an uncertain job.
      return await new Promise(resolve=>{
        const timeout=setTimeout(()=>resolve({status:'UNKNOWN',message:'Printer acknowledgement timed out. Check the printer before reprinting.'}),60_000)
        try{contents.print({silent:false,printBackground:true,...(name?{deviceName:name}:{})},(success,reason)=>{
          clearTimeout(timeout)
          resolve(success?{status:'SUBMITTED',message:'Sent to the operating system. Check your printer for the receipt.'}:
            {status:/cancel/i.test(reason??'')?'CANCELLED':'FAILED',message:/cancel/i.test(reason??'')?'Printing cancelled. Your sale is saved.':'Printing failed. Your sale is saved; check the printer and retry printing only.'})
        })}catch{clearTimeout(timeout);resolve({status:'FAILED',message:'Printer could not start. Your sale is saved.'})}
      })}catch{return {status:'FAILED',message:'Printer discovery failed. Your sale is saved.'}}finally{printing=false}
    },
  }
}
module.exports={createPrinterAdapter}
