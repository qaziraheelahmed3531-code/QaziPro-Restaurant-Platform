import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export async function GET(_request:Request,{params}:{params:Promise<{id:string;documentId:string}>}){
  await requirePlatformPermission("website.manage")
  const {id,documentId}=await params,client=await createClient()
  const document=await client.from("platform_onboarding_submission_documents").select("content,file_name,content_type").eq("id",documentId).eq("submission_id",id).maybeSingle()
  if(document.error||!document.data)return new Response(null,{status:404})
  const bytes=Buffer.from(String(document.data.content||"").replace(/^\\x/,""),"hex")
  const name=String(document.data.file_name||"QaziPro-document").replace(/["\\\r\n]/g,"_")
  return new Response(bytes,{headers:{"Content-Type":String(document.data.content_type||"application/octet-stream"),"Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
