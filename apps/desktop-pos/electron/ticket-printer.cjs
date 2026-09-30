const {ticketHtml}=require('./ticket-document.cjs')
const {createPrinterAdapter}=require('./printer-adapter.cjs')
function createTicketPrinter({createWindow}){
 let busy=false
 return {async print(payload){
  if(busy)return {status:'BUSY',message:'Another kitchen or test ticket is printing.'}
  let html
  try{if(typeof payload?.deviceName!=='string'||!payload.deviceName||payload.deviceName.length>300)throw Error();html=ticketHtml(payload.ticket)}
  catch{return {status:'FAILED',message:'Choose a configured printer and a valid ticket.'}}
  busy=true;let window
  try{
   window=createWindow();
   window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
   window.webContents.on('will-navigate',event=>event.preventDefault())
   await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
   return await createPrinterAdapter(window.webContents).print({deviceName:payload.deviceName})
  }catch{return {status:'FAILED',message:'Ticket could not be prepared. Your order is still saved.'}}
  finally{if(window&&!window.isDestroyed())window.destroy();busy=false}
 }}
}
module.exports={createTicketPrinter}
