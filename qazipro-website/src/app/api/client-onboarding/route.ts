import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { calculatePricing } from "@/lib/onboarding"
import { createOnboardingPdf } from "@/lib/onboarding-pdf"
import { getPublishedOnboardingForm, platformServerClient } from "@/lib/platform-cms"
import { validSignature } from "@/lib/signature-validation"

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
    if (form.signatureRequired && !(await validSignature(parsed.data.signature))) return reply(400,{ok:false,message:"Please add your signature before submitting."},requestId)

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
    const submission = {
      id:submissionId,reference,request_key:parsed.data.requestKey,form_id:form.id,form_version:form.version,
      client_data:values,selected_services:selectedServices,selected_package:selectedPackage,
      pricing_snapshot:pricing,terms_snapshot:form.definition.terms.filter(item=>item.active),form_snapshot:form.definition,
      signature_data:parsed.data.signature,signature_hash:signatureHash,consent_text:form.definition.consentText,
      consented_at:submittedAt,source_ip_hash:ipHash,user_agent:(request.headers.get("user-agent")||"").slice(0,500),
      pdf_access_token_hash:createHash("sha256").update(token).digest("hex"),
    }
    const saved = await client.rpc("submit_platform_onboarding_signed", {
      p_submission: submission,
      p_pdf: `\\x${Buffer.from(pdf).toString("hex")}`,
      p_pdf_hash: createHash("sha256").update(pdf).digest("hex"),
    })
    if (saved.error || !saved.data?.id || !saved.data?.reference) {
      return reply(saved.error?.code === "22023" ? 409 : 503,{ok:false,message:"We couldn't confirm your signed application. Your information is still here. Please try again."},requestId)
    }
    const savedToken = pdfToken(String(saved.data.id))
    return reply(saved.data.duplicate ? 200 : 201,{ok:true,duplicate:Boolean(saved.data.duplicate),reference:saved.data.reference,pdfUrl:`/api/client-onboarding/${saved.data.reference}/pdf?token=${savedToken}`,message:"Application submitted."},requestId)
  } catch {
    return reply(400,{ok:false,message:"Please check the form fields and try again."},requestId)
  }
}
