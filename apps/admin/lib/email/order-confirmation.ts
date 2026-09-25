import "server-only"

import nodemailer from "nodemailer"
import { isSyntheticQaEmail } from "@italian-pizza/shared"

type Branch={restaurant_name?:string|null;name:string;formatted_address?:string|null;address?:string|null;phone?:string|null}
export type OrderEmail={order_number:string;token_number:number;customer_email:string|null;customer_name:string;service_mode:string;delivery_address:string|null;total:number;order_items:Array<{product_name:string;quantity:number;line_total:number}>;branches:Branch|Branch[]|null}
const clean=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]!)
const qaAddress=(value:string)=>isSyntheticQaEmail(value)||/@example\.(test|invalid)$/i.test(value)||/qa[-_.+ ]|do.?not.?fulfill|test/i.test(value)
const publicImageUrl=(value?:string|null)=>{
  if(!value?.trim())return null
  try{const url=new URL(value,process.env.CUSTOMER_APP_URL||"http://localhost:3000");return url.protocol==="https:"||url.protocol==="http:"?url.href:null}catch{return null}
}

export async function sendOrderConfirmation(order:OrderEmail,branding?:{logoUrl?:string|null;primaryColor?:string|null}){
  const recipient=order.customer_email?.trim().toLowerCase();if(!recipient)return {status:"SKIPPED" as const,error:"Order has no email address."}
  if(qaAddress(recipient)||/qa test|do not fulfill/i.test(order.customer_name))return {status:"SKIPPED" as const,error:"Automated/test recipient suppressed."}
  const host=process.env.SMTP_HOST?.trim(),user=process.env.SMTP_USER?.trim(),password=process.env.SMTP_PASSWORD?.trim();if(!host||!user||!password)return {status:"FAILED" as const,error:"Email provider is not configured."}
  const branch=Array.isArray(order.branches)?order.branches[0]:order.branches;const restaurant=branch?.restaurant_name||branch?.name||"Restaurant";const port=Number(process.env.SMTP_PORT||587);const trackUrl=new URL("/orders/"+encodeURIComponent(order.order_number),process.env.CUSTOMER_APP_URL||"http://localhost:3000").href
  const logoUrl=publicImageUrl(branding?.logoUrl)
  const accent=/^#[0-9a-f]{6}$/i.test(branding?.primaryColor??"")?branding!.primaryColor!:"#981f16"
  const logo=logoUrl?"<img src='"+clean(logoUrl)+"' alt='"+clean(restaurant)+" logo' width='180' style='display:block;width:auto;max-width:180px;max-height:80px;margin:0 auto 14px;object-fit:contain' />":""
  const items=order.order_items.map(item=>"<tr><td style='padding:7px 0'>"+item.quantity+" × "+clean(item.product_name)+"</td><td style='padding:7px 0;text-align:right'>Rs "+Number(item.line_total).toLocaleString("en-PK")+"</td></tr>").join("")
  const html="<div style='max-width:620px;margin:auto;font-family:Arial,sans-serif;color:#211d1a'><div style='padding:24px;background:"+accent+";color:white;text-align:center'>"+logo+"<h1 style='margin:0'>"+clean(restaurant)+"</h1></div><div style='padding:28px;border:1px solid #eadfd8'><h2>Your order is confirmed</h2><p>Hello "+clean(order.customer_name)+", the restaurant has confirmed your order.</p><p><strong>Order:</strong> "+clean(order.order_number)+"<br><strong>Token:</strong> "+String(order.token_number).padStart(3,"0")+"<br><strong>Order type:</strong> "+clean(order.service_mode)+"</p><table style='width:100%;border-collapse:collapse'>"+items+"<tr style='border-top:2px solid #211d1a'><td style='padding-top:12px'><strong>Total</strong></td><td style='padding-top:12px;text-align:right'><strong>Rs "+Number(order.total).toLocaleString("en-PK")+"</strong></td></tr></table>"+(order.delivery_address?"<p><strong>Delivery address:</strong><br>"+clean(order.delivery_address)+"</p>":"")+"<p style='margin:28px 0'><a href='"+trackUrl+"' style='padding:12px 18px;border-radius:8px;background:"+accent+";color:white;text-decoration:none'>Track your order</a></p><p style='color:#6c625c'>Status updates are based on restaurant order progress.</p><hr style='border:0;border-top:1px solid #eadfd8'><p>"+clean(branch?.formatted_address||branch?.address||"")+(branch?.phone?"<br>"+clean(branch.phone):"")+"</p></div></div>"
  try{const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass:password}});const result=await transport.sendMail({from:process.env.SMTP_FROM||user,to:recipient,subject:"Your order is confirmed — "+restaurant,html,text:"Your order "+order.order_number+" is confirmed by "+restaurant+". Token "+String(order.token_number).padStart(3,"0")+". Total Rs "+order.total+". Track: "+trackUrl});return {status:"SENT" as const,messageId:result.messageId}}
  catch(error){return {status:"FAILED" as const,error:error instanceof Error?error.message:"Email delivery failed."}}
}
