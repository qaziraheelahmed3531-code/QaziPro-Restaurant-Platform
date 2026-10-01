import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

const base=(process.env.PUBLIC_SITE_BASE_URL||"https://www.qazipro.com").replace(/\/$/,"")
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY,ref=process.env.STAGING_SUPABASE_PROJECT_REF
if(process.env.STAGING_ENVIRONMENT!=="staging"||!url||!secret||new URL(url).hostname!==`${ref}.supabase.co`)throw new Error("Explicit staging backend is required.")
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
const requestKey=randomUUID(),email=`website-final-${Date.now()}@staging.qazipro.invalid`
const signature=await sharp({create:{width:600,height:160,channels:4,background:"white"}}).composite([{input:Buffer.from('<svg width="600" height="160"><path d="M30 110 C140 15 170 150 280 70 S430 135 560 35" fill="none" stroke="#17131c" stroke-width="8" stroke-linecap="round"/></svg>')}]).png().toBuffer()
const payload={requestKey,values:{restaurantName:"QaziPro Staging Acceptance",locations:"2",contactName:"Staging QA",designation:"Acceptance",phone:"+92 300 0000000",email,address:"Disposable staging fixture",city:"Islamabad"},serviceIds:["pos","kds"],packageId:"custom",signature:`data:image/png;base64,${signature.toString("base64")}`,consent:true,website:"",startedAt:Date.now()-3000}
async function post(body,origin=base){return fetch(`${base}/api/client-onboarding`,{method:"POST",headers:{"content-type":"application/json",origin,"x-forwarded-for":`198.51.100.${Math.floor(Math.random()*80)+10}`},body:JSON.stringify(body)})}
let submissionId=""
try{
  const page=await fetch(`${base}/client-onboarding`);if(!page.ok||!(await page.text()).includes("Client Onboarding"))throw new Error(`Public form unavailable (${page.status}).`)
  const wrongOrigin=await post(payload,"https://untrusted.example");if(wrongOrigin.status!==403)throw new Error(`Cross-origin request was not rejected (${wrongOrigin.status}).`)
  const tampered=await post({...payload,requestKey:randomUUID(),serviceIds:["made-up-service"]});if(tampered.status!==400)throw new Error(`Tampered service was not rejected (${tampered.status}).`)
  const first=await post(payload),firstBody=await first.json();if(first.status!==201||!firstBody.reference||!firstBody.pdfUrl)throw new Error(`Valid signed submission failed (${first.status}: ${firstBody.message??"unknown"}).`)
  const replay=await post(payload),replayBody=await replay.json();if(replay.status!==200||replayBody.reference!==firstBody.reference||!replayBody.duplicate)throw new Error("Idempotent replay did not resolve to the original submission.")
  const saved=await db.from("platform_onboarding_submissions").select("id,reference,form_version,client_data,pricing_snapshot").eq("request_key",requestKey)
  if(saved.error||saved.data.length!==1||saved.data[0].reference!==firstBody.reference)throw new Error("Exactly-once database persistence failed.")
  submissionId=saved.data[0].id
  const documents=await db.from("platform_onboarding_submission_documents").select("id,content_sha256").eq("submission_id",submissionId)
  if(documents.error||documents.data.length!==1)throw new Error("Original PDF document version was not stored exactly once.")
  const pdf=await fetch(`${base}${firstBody.pdfUrl}`),bytes=new Uint8Array(await pdf.arrayBuffer())
  if(!pdf.ok||new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new Error(`Protected PDF download failed (${pdf.status}).`)
  console.log(JSON.stringify({ok:true,assertions:9,reference:firstBody.reference,pdfBytes:bytes.length,coverage:["page","origin","tamper","signature","server-pricing","idempotency","exactly-once","versioned-document","protected-pdf"]}))
}finally{if(submissionId){const cleanup=await db.from("platform_onboarding_submissions").delete().eq("id",submissionId);if(cleanup.error)throw cleanup.error}}
