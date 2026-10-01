import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  await requirePlatformPermission("website.manage")
  const {id}=await params
  const client=await createClient()
  const [submission,document]=await Promise.all([
    client.from("platform_onboarding_submissions").select("reference").eq("id",id).maybeSingle(),
    client.from("platform_onboarding_submission_documents").select("content").eq("submission_id",id).eq("version",1).maybeSingle(),
  ])
  if(!submission.data||!document.data?.content)return new Response("Not found",{status:404})
  const raw=String(document.data.content),bytes=raw.startsWith("\\x")?Buffer.from(raw.slice(2),"hex"):Buffer.from(raw,"base64")
  return new Response(bytes,{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${submission.data.reference}-QaziPro-onboarding.pdf"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
