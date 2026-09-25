import "server-only"

import nodemailer from "nodemailer"
import { isSyntheticQaEmail } from "@italian-pizza/shared"

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]!)

export async function sendPosLoginOtp(input: { recipient:string; code:string; restaurantName:string; logoUrl?:string|null; primaryColor?:string|null }) {
  if(isSyntheticQaEmail(input.recipient))return {status:"SUPPRESSED" as const,error:"Synthetic QA recipient suppressed."}
  const host=process.env.SMTP_HOST?.trim(),user=process.env.SMTP_USER?.trim(),password=process.env.SMTP_PASSWORD?.trim()
  if(!host||!user||!password)return {status:"FAILED" as const,error:"Email / SMTP is not configured."}
  const port=Number(process.env.SMTP_PORT||587)
  const accent=/^#[0-9a-f]{6}$/i.test(input.primaryColor??"")?input.primaryColor!:"#a92114"
  const logo=/^https?:\/\//i.test(input.logoUrl??"")?`<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.restaurantName)}" style="display:block;width:auto;max-width:170px;max-height:70px;margin:0 auto 16px;object-fit:contain">`:""
  const html=`<div style="padding:28px 12px;background:#f5f2ef;font-family:Arial,sans-serif;color:#211d1b"><div style="max-width:540px;margin:auto;overflow:hidden;border:1px solid #e8ddd7;border-radius:16px;background:#fff"><div style="padding:26px;background:${accent};color:#fff;text-align:center">${logo}<h1 style="margin:0">${escapeHtml(input.restaurantName)}</h1><p style="margin:8px 0 0">Offline POS secure login</p></div><div style="padding:30px;text-align:center"><p>Enter this one-time code in the Desktop POS:</p><div style="margin:22px 0;font-size:38px;font-weight:800;letter-spacing:10px">${input.code}</div><p style="color:#6c625c">This code expires in 10 minutes and can be used once. Never share it with anyone.</p></div></div></div>`
  try{
    const transport=nodemailer.createTransport({host,port,secure:port===465,auth:{user,pass:password}})
    const result=await transport.sendMail({from:process.env.SMTP_FROM?.trim()||user,to:input.recipient,subject:`Your ${input.restaurantName} POS login code`,html,text:`Your ${input.restaurantName} Offline POS login code is ${input.code}. It expires in 10 minutes and can be used once.`})
    return {status:"SENT" as const,messageId:result.messageId}
  }catch(error){return {status:"FAILED" as const,error:error instanceof Error?error.message:"OTP email delivery failed."}}
}
