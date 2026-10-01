import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { getPortalApplication, getPortalSession } from "@/lib/client-portal"
import { platformServerClient } from "@/lib/platform-cms"

const allowed=new Set(["application/pdf","image/png","image/jpeg","image/webp"])

export async function POST(request:Request,{params}:{params:Promise<{reference:string}>}){
  if(request.headers.get("origin")!==new URL(request.url).origin)return Response.json({message:"This upload could not be accepted."},{status:403})
  const {reference}=await params
  const [session,application]=await Promise.all([getPortalSession(),getPortalApplication(reference)])
  const admin=platformServerClient()
  if(!session||!application||!admin)return Response.json({message:"Sign in again to upload this document."},{status:401})
  const form=await request.formData(),file=form.get("document")
  if(!(file instanceof File)||!file.size||file.size>3145728||!allowed.has(file.type))return Response.json({message:"Use a PDF, PNG, JPEG or WebP file under 3 MB."},{status:400})
  const name=file.name.replace(/[^a-zA-Z0-9._() -]/g,"_").slice(0,180)||"client-document"
  const bytes=Buffer.from(await file.arrayBuffer()),hash=createHash("sha256").update(bytes).digest("hex")
  const result=await admin.rpc("append_platform_onboarding_document",{
    p_submission_id:application.id,p_document_type:"CLIENT_UPLOAD",p_content:`\\x${bytes.toString("hex")}`,
    p_content_sha256:hash,p_file_name:name,p_content_type:file.type,p_client_user_id:session.userId,
    p_created_by:null,p_is_client_visible:true,
  })
  if(result.error)return Response.json({message:"We couldn't store that document safely."},{status:500})
  await admin.from("platform_onboarding_submission_activity").insert({submission_id:application.id,action:"CLIENT_DOCUMENT_UPLOADED",detail:"The client uploaded a requested document.",public_label:"Document uploaded",is_client_visible:true})
  revalidatePath(`/client-portal/${reference}`)
  return Response.json({ok:true,id:result.data},{status:201})
}
