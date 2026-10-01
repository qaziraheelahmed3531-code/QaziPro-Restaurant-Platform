import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { calculatePricing } from "@/lib/onboarding"
import { createOnboardingPdf } from "@/lib/onboarding-pdf"
import { getPublishedOnboardingForm, platformServerClient } from "@/lib/platform-cms"

export const runtime = "nodejs"

const inputSchema = z.object({
  requestKey: z.string().uuid(),
  values: z.record(z.string(),z.union([z.string().max(5000),z.number().finite(),z.boolean()])),
  serviceIds: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)).max(50),
  packageId: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).nullable(),
  signature: z.string().max(500000),
  consent: z.literal(true),
  website: z.string().max(0).optional().default(""),
  startedAt: z.number().int().positive(),
})

function reply(status:number,body:Record<string,unknown>,requestId:string) {
  return NextResponse.json(body,{status,headers:{"Cache-Control":"no-store","X-Request-Id":requestId}})
}

function pdfToken(submissionId:string) {
  return createHmac("sha256",process.env.SUPABASE_SERVICE_ROLE_KEY ?? "unconfigured").update(`qazipro-onboarding-pdf:${submissionId}`).digest("hex")
}

function validSignature(value:string) {
  const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value)
  if (!match) return false
  try {
    const bytes=Buffer.from(match[1],"base64")
    return bytes.length>=100 && bytes.length<=350000 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  } catch { return false }
}

function normalizeValues(values:Record<string,string|number|boolean>) {
  return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,String(value).trim()]))
}

export async function POST(request:NextRequest) {
  const requestId=randomUUID()
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403,{ok:false,message:"This request could not be accepted."},requestId)
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415,{ok:false,message:"Please submit the form again."},requestId)
  const client=platformServerClient()
  if (!client) return reply(503,{ok:false,message:"Client onboarding is temporarily unavailable."},requestId)
  try {
    const raw=await request.text()
    if (raw.length>750000) return reply(413,{ok:false,message:"The signed form is too large. Clear and sign again."},requestId)
    const parsed=inputSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return reply(400,{ok:false,message:"Please check the form fields and try again."},requestId)
    if (parsed.data.website) return reply(201,{ok:true,message:"Application submitted."},requestId)
    if (Date.now()-parsed.data.startedAt<1200) return reply(400,{ok:false,message:"Please review the form before submitting."},requestId)

    const address=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
    const rateKey=createHash("sha256").update(`qazipro-onboarding:${process.env.SUPABASE_SERVICE_ROLE_KEY}:${address}`).digest("hex")
    const limit=await client.rpc("consume_api_rate_limit",{p_key_hash:rateKey,p_limit:4,p_window_seconds:1800})
    if (limit.error) return reply(503,{ok:false,message:"Client onboarding is temporarily unavailable."},requestId)
    if (!limit.data) return reply(429,{ok:false,message:"Too many attempts. Please try again later."},requestId)

    const form=await getPublishedOnboardingForm()
    if (!form.id || form.version<1) return reply(503,{ok:false,message:"The onboarding form is not published yet."},requestId)
    const values=normalizeValues(parsed.data.values)
    const enabledFields=form.definition.fields.filter(item=>item.enabled)
    for (const field of enabledFields) {
      const value=values[field.id] ?? ""
      if (field.required && !value) return reply(400,{ok:false,message:`${field.label} is required.`},requestId)
      if (value.length>5000) return reply(400,{ok:false,message:`${field.label} is too long.`},requestId)
      if (field.type==="email" && value && !z.string().email().safeParse(value).success) return reply(400,{ok:false,message:"Enter a valid email address."},requestId)
      if (field.type==="number" && value && (!Number.isFinite(Number(value)) || Number(value)<0)) return reply(400,{ok:false,message:`${field.label} must be a valid number.`},requestId)
    }
    const validServiceIds=new Set(form.definition.services.filter(item=>item.active).map(item=>item.id))
    if (parsed.data.serviceIds.some(id=>!validServiceIds.has(id))) return reply(400,{ok:false,message:"One selected service is no longer available."},requestId)
    if (parsed.data.packageId && !form.definition.packages.some(item=>item.active && item.id===parsed.data.packageId)) return reply(400,{ok:false,message:"The selected package is no longer available."},requestId)
    if (form.signatureRequired && !validSignature(parsed.data.signature)) return reply(400,{ok:false,message:"Please add your signature before submitting."},requestId)

    const existing=await client.from("platform_onboarding_submissions").select("id,reference").eq("request_key",parsed.data.requestKey).maybeSingle()
    if (existing.data) {
      const token=pdfToken(String(existing.data.id))
      return reply(200,{ok:true,duplicate:true,reference:existing.data.reference,pdfUrl:`/api/client-onboarding/${existing.data.reference}/pdf?token=${token}`},requestId)
    }
    if (existing.error) return reply(503,{ok:false,message:"We could not confirm your application. Please try again."},requestId)

    const locations=Math.min(10000,Math.max(1,Number.parseInt(values.locations || "1",10) || 1))
    const pricing=calculatePricing(form.definition,parsed.data.packageId,parsed.data.serviceIds,locations)
    const selectedServices=form.definition.services.filter(item=>parsed.data.serviceIds.includes(item.id)).map(item=>({id:item.id,name:item.name,monthlyFee:item.monthlyFee,setupFee:item.setupFee,perLocationFee:item.perLocationFee,percentageFee:item.percentageFee}))
    const selectedPackage=form.definition.packages.find(item=>item.id===parsed.data.packageId) ?? null
    const submittedAt=new Date().toISOString()
    const reference=`QP-${submittedAt.slice(0,10).replaceAll("-","")}-${randomBytes(4).toString("hex").slice(0,6).toUpperCase()}`
    const signatureHash=createHash("sha256").update(parsed.data.signature).digest("hex")
    const ipHash=createHash("sha256").update(`qazipro-onboarding-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY}:${address}`).digest("hex")
    const pdf=await createOnboardingPdf({reference,formVersion:form.version,submittedAt,values,definition:form.definition,serviceIds:parsed.data.serviceIds,packageId:parsed.data.packageId,pricing,signatureData:parsed.data.signature,consentText:form.definition.consentText})
    const submissionId=randomUUID()
    const token=pdfToken(submissionId)
    const insert=await client.from("platform_onboarding_submissions").insert({
      id:submissionId,reference,request_key:parsed.data.requestKey,form_id:form.id,form_version:form.version,
      client_data:values,selected_services:selectedServices,selected_package:selectedPackage,
      pricing_snapshot:pricing,terms_snapshot:form.definition.terms.filter(item=>item.active),form_snapshot:form.definition,
      signature_data:parsed.data.signature,signature_hash:signatureHash,consent_text:form.definition.consentText,
      consented_at:submittedAt,source_ip_hash:ipHash,user_agent:(request.headers.get("user-agent")||"").slice(0,500),
      pdf_access_token_hash:createHash("sha256").update(token).digest("hex"),
    })
    if (insert.error) {
      if (insert.error.code==="23505") {
        const replay=await client.from("platform_onboarding_submissions").select("id,reference").eq("request_key",parsed.data.requestKey).single()
        if (replay.data) { const replayToken=pdfToken(String(replay.data.id)); return reply(200,{ok:true,duplicate:true,reference:replay.data.reference,pdfUrl:`/api/client-onboarding/${replay.data.reference}/pdf?token=${replayToken}`},requestId) }
      }
      return reply(503,{ok:false,message:"We couldn't submit your form. Your information is still here. Please try again."},requestId)
    }
    const document=await client.from("platform_onboarding_submission_documents").insert({submission_id:submissionId,version:1,document_type:"ORIGINAL_SIGNED",content:`\\x${Buffer.from(pdf).toString("hex")}`,content_sha256:createHash("sha256").update(pdf).digest("hex"),file_name:`${reference}-QaziPro-onboarding.pdf`,content_type:"application/pdf",is_client_visible:true})
    if (document.error) {
      await client.from("platform_onboarding_submissions").delete().eq("id",submissionId)
      return reply(503,{ok:false,message:"We couldn't generate your signed copy. Your information is still here. Please try again."},requestId)
    }
    await client.from("platform_onboarding_submission_activity").insert({submission_id:submissionId,action:"PUBLIC_SUBMITTED",detail:"Original signed snapshot and PDF version 1 created.",public_label:"Application submitted",is_client_visible:true})
    return reply(201,{ok:true,reference,pdfUrl:`/api/client-onboarding/${reference}/pdf?token=${token}`,message:"Application submitted."},requestId)
  } catch {
    return reply(400,{ok:false,message:"Please check the form fields and try again."},requestId)
  }
}
