const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const text=(value,max)=>typeof value==='string'&&value.length<=max
function ticketHtml(ticket){
 if(!ticket||![58,80].includes(ticket.width)||!text(ticket.title,120)||!text(ticket.branch,200)||!text(ticket.reference,160)||!text(ticket.notes,2000)||!Array.isArray(ticket.lines)||ticket.lines.length<1||ticket.lines.length>250)
  throw Error('Invalid print ticket')
 for(const line of ticket.lines)if(!text(line.name,300)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>10000||!Array.isArray(line.details)||line.details.length>100||line.details.some(detail=>!text(detail,400)))throw Error('Invalid ticket line')
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>QaziPRO local ticket</title><style>@page{margin:3mm}*{box-sizing:border-box}body{width:${ticket.width-6}mm;margin:0;font:14px sans-serif;color:#000;overflow-wrap:anywhere}h1{font-size:20px}h1,p{margin:0 0 8px}.line{border-top:1px dashed #000;padding:8px 0;break-inside:avoid}.line small{display:block}footer{border-top:1px solid #000;font-size:10px;padding-top:8px}</style></head><body><h1>${escape(ticket.title)}</h1><p>${escape(ticket.branch)}</p><p>${escape(ticket.reference)}</p>${ticket.notes?`<p>${escape(ticket.notes)}</p>`:''}${ticket.lines.map(line=>`<div class="line"><strong>${line.quantity} × ${escape(line.name)}</strong>${line.details.map(detail=>`<small>${escape(detail)}</small>`).join('')}</div>`).join('')}<footer>QaziPRO · local preparation / diagnostic ticket</footer></body></html>`
}
module.exports={ticketHtml}
