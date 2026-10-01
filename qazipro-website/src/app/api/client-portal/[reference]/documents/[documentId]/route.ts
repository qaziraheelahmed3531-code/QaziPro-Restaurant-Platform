import { getPortalApplication } from "@/lib/client-portal"
import { platformServerClient } from "@/lib/platform-cms"

export async function GET(_request:Request,{params}:{params:Promise<{reference:string;documentId:string}>}){
  const {reference,documentId}=await params
  const application=await getPortalApplication(reference),admin=platformServerClient()
  if(!application||!admin)return new Response(null,{status:404})
  const document=await admin.from("platform_onboarding_submission_documents").select("content,file_name,content_type").eq("id",documentId).eq("submission_id",application.id).eq("is_client_visible",true).maybeSingle()
  if(document.error||!document.data)return new Response(null,{status:404})
  const raw=String(document.data.content||"").replace(/^\\x/,""),bytes=Buffer.from(raw,"hex")
  const name=String(document.data.file_name||"QaziPro-document").replace(/["\\\r\n]/g,"_")
  return new Response(bytes,{headers:{"Content-Type":String(document.data.content_type||"application/octet-stream"),"Content-Disposition":`attachment; filename="${name}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
