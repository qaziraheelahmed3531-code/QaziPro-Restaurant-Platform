import { createHash,createHmac,timingSafeEqual } from "node:crypto"
import { NextRequest } from "next/server"
import { platformServerClient } from "@/lib/platform-cms"

export const runtime="nodejs"

export async function GET(request:NextRequest,{params}:{params:Promise<{reference:string}>}) {
  const {reference}=await params
  if (!/^QP-[0-9]{8}-[A-Z0-9]{6}$/.test(reference)) return new Response("Not found",{status:404})
  const client=platformServerClient()
  if (!client) return new Response("Unavailable",{status:503})
  const submission=await client.from("platform_onboarding_submissions").select("id,pdf_access_token_hash").eq("reference",reference).maybeSingle()
  if (!submission.data) return new Response("Not found",{status:404})
  const token=request.nextUrl.searchParams.get("token") ?? ""
  const expected=createHmac("sha256",process.env.SUPABASE_SERVICE_ROLE_KEY ?? "unconfigured").update(`qazipro-onboarding-pdf:${submission.data.id}`).digest("hex")
  const tokenHash=createHash("sha256").update(token).digest("hex")
  const stored=String(submission.data.pdf_access_token_hash ?? "")
  if (token.length!==64 || stored.length!==64 || expected.length!==token.length || !timingSafeEqual(Buffer.from(token),Buffer.from(expected)) || !timingSafeEqual(Buffer.from(tokenHash),Buffer.from(stored))) return new Response("Not found",{status:404})
  const document=await client.from("platform_onboarding_submission_documents").select("content").eq("submission_id",submission.data.id).eq("version",1).single()
  if (!document.data?.content) return new Response("Unavailable",{status:503})
  const raw=String(document.data.content)
  const bytes=raw.startsWith("\\x") ? Buffer.from(raw.slice(2),"hex") : Buffer.from(raw,"base64")
  return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${reference}-QaziPro-onboarding.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
