"use server"

import { createHash,randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createPlatformAdminClient } from "@/lib/supabase/admin"
import { normalizeBrandingImage } from "@/lib/branding-image"
import { aboutContentSchema,formDefinitionSchema,safeObject } from "@/lib/website-cms"

async function audit(actor:string,action:string,targetType:string,targetId:string,reason:string,before?:unknown,after?:unknown) {
  const client=await createClient()
  await client.from("platform_audit_logs").insert({actor_user_id:actor,action,target_type:targetType,target_id:targetId,reason,before_data:before??null,after_data:after??null})
}

async function refreshWebsite() {
  const origin=process.env.QAZIPRO_PUBLIC_SITE_URL
  const secret=process.env.CMS_REVALIDATE_SECRET
  if(!origin||!secret)return false
  try {const response=await fetch(`${origin.replace(/\/$/,"")}/api/revalidate`,{method:"POST",headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(5000)});return response.ok}catch{return false}
}

export async function saveSiteDocumentAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const key=String(form.get("key")??"")
  const expected=Number(form.get("revision"))
  if(!/^[a-z][a-z0-9_-]{1,63}$/.test(key)||!Number.isSafeInteger(expected))return{error:"Invalid content revision."}
  let content:Record<string,unknown>
  try{content=safeObject(String(form.get("content")??""))}catch{return{error:"Content must be valid structured JSON."}}
  if(key==="about"){
    const validated=aboutContentSchema.safeParse(content)
    if(!validated.success)return{error:"Check the About fields and choose a supported CTA destination."}
    content=validated.data
  }
  const client=await createClient()
  const current=await client.from("platform_site_documents").select("draft_data,draft_revision").eq("key",key).single()
  if(current.error)return{error:"Website content is unavailable."}
  if(Number(current.data.draft_revision)!==expected)return{error:"This content changed in another session. Reload before saving."}
  const updated=await client.from("platform_site_documents").update({draft_data:content,draft_revision:expected+1,updated_by:context.userId}).eq("key",key).eq("draft_revision",expected).select("draft_revision").single()
  if(updated.error)return{error:"Draft could not be saved."}
  await audit(context.userId,"WEBSITE_DRAFT_SAVED","platform_site_document",key,"Website CMS draft edit",current.data.draft_data,content)
  revalidatePath("/website")
  return{success:"Draft saved."}
}

export async function publishSiteDocumentAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const key=String(form.get("key")??"")
  const expected=Number(form.get("revision"))
  if(!form.has("revision")||!Number.isSafeInteger(expected))return{error:"Reload this editor before publishing."}
  const client=await createClient()
  const current=await client.from("platform_site_documents").select("draft_data,draft_revision,published_data,published_version").eq("key",key).single()
  if(current.error)return{error:"Website content is unavailable."}
  if(Number(current.data.draft_revision)!==expected)return{error:"This draft changed in another session. Reload and review before publishing."}
  if(key==="about"&&!aboutContentSchema.safeParse(current.data.draft_data).success)return{error:"Check and save the About fields before publishing."}
  const result=await client.from("platform_site_documents").update({published_data:current.data.draft_data,published_version:Number(current.data.published_version)+1,published_at:new Date().toISOString(),published_by:context.userId}).eq("key",key).eq("draft_revision",expected).eq("published_version",current.data.published_version).select("key").single()
  if(result.error)return{error:"Couldn't publish this change."}
  await audit(context.userId,"WEBSITE_CONTENT_PUBLISHED","platform_site_document",key,"Approved public website publish",current.data.published_data,current.data.draft_data)
  revalidatePath("/website");await refreshWebsite()
  return{success:"Published website content."}
}

export async function saveOnboardingFormAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const id=String(form.get("id")??"")
  const expected=Number(form.get("revision"))
  let raw:unknown
  try{raw=JSON.parse(String(form.get("definition")??""))}catch{return{error:"The form definition is not valid JSON."}}
  const parsed=formDefinitionSchema.safeParse(raw)
  if(!parsed.success)return{error:`Form definition rejected: ${parsed.error.issues[0]?.message??"invalid field"}`}
  const client=await createClient()
  const current=await client.from("platform_onboarding_forms").select("draft_definition,draft_revision").eq("id",id).single()
  if(current.error||Number(current.data.draft_revision)!==expected)return{error:"This form changed in another session. Reload before saving."}
  const update=await client.from("platform_onboarding_forms").update({draft_definition:parsed.data,draft_revision:expected+1,updated_by:context.userId}).eq("id",id).eq("draft_revision",expected)
  if(update.error)return{error:"Form draft could not be saved."}
  await audit(context.userId,"ONBOARDING_FORM_DRAFT_SAVED","platform_onboarding_form",id,"No-code form editor update",current.data.draft_definition,parsed.data)
  revalidatePath("/website")
  return{success:"Form draft saved."}
}

export async function publishOnboardingFormAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const id=String(form.get("id")??"")
  const client=await createClient()
  const current=await client.from("platform_onboarding_forms").select("draft_definition,published_definition,published_version").eq("id",id).single()
  const parsed=formDefinitionSchema.safeParse(current.data?.draft_definition)
  if(current.error||!parsed.success)return{error:"The draft contains invalid fields and cannot be published."}
  const result=await client.from("platform_onboarding_forms").update({published_definition:parsed.data,published_version:Number(current.data.published_version)+1,published_at:new Date().toISOString(),published_by:context.userId}).eq("id",id)
  if(result.error)return{error:"Couldn't publish this form."}
  await audit(context.userId,"ONBOARDING_FORM_PUBLISHED","platform_onboarding_form",id,"Approved client form publish",current.data.published_definition,parsed.data)
  revalidatePath("/website");await refreshWebsite()
  return{success:"Client onboarding form published."}
}

export async function saveTeamMemberAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const submittedId=String(form.get("id")??"").trim()
  const id=submittedId||randomUUID()
  const name=String(form.get("name")??"").trim(),title=String(form.get("title")??"").trim(),shortBio=String(form.get("shortBio")??"").trim()
  if(name.length<2||title.length<2||shortBio.length>700)return{error:"Name, title or bio is invalid."}
  const email=String(form.get("email")??"").trim()||null,linkedin=String(form.get("linkedin")??"").trim()||null
  if(linkedin&&!/^https:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(linkedin))return{error:"Use a valid LinkedIn URL."}
  const client=await createClient()
  const existing=await client.from("platform_site_team_members").select("*").eq("id",id).maybeSingle()
  const row={id,name,title,short_bio:shortBio,full_bio:String(form.get("fullBio")??"").trim(),email,linkedin_url:linkedin,social_url:String(form.get("social")??"").trim()||null,display_order:Math.max(0,Number(form.get("displayOrder"))||0),featured:form.get("featured")==="on",active:form.get("active")==="on",created_by:existing.data?.created_by??context.userId,updated_by:context.userId}
  const result=await client.from("platform_site_team_members").upsert(row)
  if(result.error)return{error:"Team member could not be saved."}
  await audit(context.userId,existing.data?"WEBSITE_TEAM_UPDATED":"WEBSITE_TEAM_CREATED","platform_site_team_member",id,"Website team manager",existing.data,row)
  revalidatePath("/website")
  return{success:"Team member draft saved."}
}

export async function uploadTeamImageAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage")
  const id=String(form.get("id")??"")
  const file=form.get("image")
  if(!(file instanceof File)||!file.size)return{error:"Choose a profile image."}
  const admin=createPlatformAdminClient();if(!admin)return{error:"Image storage is unavailable."}
  try{
    const buffer=await normalizeBrandingImage(file),path=`team/${id}/${randomUUID()}.png`
    const upload=await admin.storage.from("platform-site-team").upload(path,buffer,{contentType:"image/png",upsert:false})
    if(upload.error)return{error:"Profile image could not be uploaded."}
    const client=await createClient();const current=await client.from("platform_site_team_members").select("image_path").eq("id",id).single()
    const update=await client.from("platform_site_team_members").update({image_path:path,updated_by:context.userId}).eq("id",id)
    if(update.error){await admin.storage.from("platform-site-team").remove([path]);return{error:"Profile image could not be attached."}}
    if(current.data?.image_path)await admin.storage.from("platform-site-team").remove([String(current.data.image_path)])
    await audit(context.userId,"WEBSITE_TEAM_IMAGE_UPDATED","platform_site_team_member",id,"Approved team profile image replacement")
    revalidatePath("/website");return{success:"Profile image saved."}
  }catch{return{error:"Use a PNG, JPEG or WebP image under 2 MB."}}
}

export async function publishTeamMemberAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const client=await createClient();const current=await client.from("platform_site_team_members").select("*").eq("id",id).single()
  if(current.error)return{error:"Team member is unavailable."}
  const snapshot={name:current.data.name,title:current.data.title,shortBio:current.data.short_bio,fullBio:current.data.full_bio,imagePath:current.data.image_path,email:current.data.email,linkedinUrl:current.data.linkedin_url,socialUrl:current.data.social_url,featured:current.data.featured,displayOrder:current.data.display_order}
  const result=await client.from("platform_site_team_members").update({published_snapshot:snapshot,published_version:Number(current.data.published_version)+1,published_at:new Date().toISOString(),updated_by:context.userId}).eq("id",id)
  if(result.error)return{error:"Team member could not be published."}
  await audit(context.userId,"WEBSITE_TEAM_PUBLISHED","platform_site_team_member",id,"Approved public team publish",current.data.published_snapshot,snapshot)
  revalidatePath("/website");await refreshWebsite();return{success:"Team member published."}
}

export async function unpublishTeamMemberAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const client=await createClient();const result=await client.from("platform_site_team_members").update({published_snapshot:null,published_at:null,updated_by:context.userId}).eq("id",id)
  if(result.error)return{error:"Team member could not be unpublished."}
  await audit(context.userId,"WEBSITE_TEAM_UNPUBLISHED","platform_site_team_member",id,"Removed from public team");revalidatePath("/website");await refreshWebsite();return{success:"Team member unpublished."}
}

export async function deleteTeamMemberAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const client=await createClient()
  const current=await client.from("platform_site_team_members").select("*").eq("id",id).single()
  if(current.error)return{error:"Team member is unavailable."}
  const result=await client.from("platform_site_team_members").delete().eq("id",id)
  if(result.error)return{error:"Team member could not be deleted."}
  const imagePath=current.data.image_path?String(current.data.image_path):null
  if(imagePath){const admin=createPlatformAdminClient();if(admin)await admin.storage.from("platform-site-team").remove([imagePath])}
  await audit(context.userId,"WEBSITE_TEAM_DELETED","platform_site_team_member",id,"Confirmed team draft deletion",current.data)
  revalidatePath("/website");await refreshWebsite();return{success:"Team member deleted."}
}

export async function updateSubmissionAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const status=String(form.get("status")??""),assigned=String(form.get("assigned")??"")||null,notes=String(form.get("notes")??"").slice(0,10000)
  if(!["NEW","REVIEWING","NEEDS_INFO","APPROVED","REJECTED","CONVERTED"].includes(status))return{error:"Invalid status."}
  const client=await createClient();const before=await client.from("platform_onboarding_submissions").select("status,assigned_staff_user_id,internal_notes").eq("id",id).single()
  const result=await client.from("platform_onboarding_submissions").update({status,assigned_staff_user_id:assigned,internal_notes:notes}).eq("id",id)
  if(result.error)return{error:"Submission could not be updated."}
  const activities:Array<Record<string,unknown>>=[]
  if(before.data?.status!==status)activities.push({submission_id:id,actor_user_id:context.userId,action:"STATUS_UPDATED",detail:`Application status changed to ${status.replaceAll("_"," ").toLowerCase()}.`,public_label:"Status updated",is_client_visible:true})
  if(before.data?.assigned_staff_user_id!==assigned)activities.push({submission_id:id,actor_user_id:context.userId,action:"POC_ASSIGNED",detail:assigned?"A QaziPro onboarding representative was assigned.":"The QaziPro representative assignment was updated.",public_label:"Representative updated",is_client_visible:true})
  if(before.data?.internal_notes!==notes)activities.push({submission_id:id,actor_user_id:context.userId,action:"INTERNAL_NOTE_UPDATED",detail:"Internal review notes updated.",is_client_visible:false})
  if(activities.length)await client.from("platform_onboarding_submission_activity").insert(activities)
  await audit(context.userId,"ONBOARDING_SUBMISSION_UPDATED","platform_onboarding_submission",id,"Status, assignment or internal note update",before.data,{status,assigned,notes})
  revalidatePath("/website");revalidatePath(`/website/submissions/${id}`);return{success:"Submission updated."}
}

export async function sendPortalMessageAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const body=String(form.get("message")??"").trim(),kind=String(form.get("kind")??"MESSAGE")
  if(!/^[0-9a-f-]{36}$/i.test(id)||body.length<2||body.length>4000||!["MESSAGE","REQUEST_INFO"].includes(kind))return{error:"Enter a client-visible message between 2 and 4,000 characters."}
  const client=await createClient()
  const submission=await client.from("platform_onboarding_submissions").select("status,reference").eq("id",id).single()
  if(submission.error)return{error:"Submission is unavailable."}
  const insert=await client.from("platform_onboarding_portal_messages").insert({submission_id:id,sender_kind:"PLATFORM",message_type:kind,body,actor_user_id:context.userId,is_client_visible:true})
  if(insert.error)return{error:"Client message could not be sent."}
  if(kind==="REQUEST_INFO"&&submission.data.status!=="NEEDS_INFO")await client.from("platform_onboarding_submissions").update({status:"NEEDS_INFO"}).eq("id",id)
  await client.from("platform_onboarding_submission_activity").insert({submission_id:id,actor_user_id:context.userId,action:kind==="REQUEST_INFO"?"INFORMATION_REQUESTED":"CLIENT_MESSAGE_SENT",detail:kind==="REQUEST_INFO"?"QaziPro requested additional information.":"QaziPro sent a client-visible message.",public_label:kind==="REQUEST_INFO"?"Information requested":"Message from QaziPro",is_client_visible:true})
  await audit(context.userId,"ONBOARDING_CLIENT_MESSAGE_SENT","platform_onboarding_submission",id,kind==="REQUEST_INFO"?"Requested additional client information":"Sent a client-visible portal message",undefined,{kind,bodyLength:body.length})
  revalidatePath(`/website/submissions/${id}`);return{success:kind==="REQUEST_INFO"?"Information request sent.":"Client message sent."}
}

export async function uploadPortalDocumentAction(form:FormData) {
  const context=await requirePlatformPermission("website.manage"),id=String(form.get("id")??"")
  const file=form.get("document")
  if(!(file instanceof File)||!file.size||file.size>900000||!["application/pdf","image/png","image/jpeg","image/webp"].includes(file.type))return{error:"Use a PDF, PNG, JPEG or WebP file under 900 KB."}
  const admin=createPlatformAdminClient();if(!admin)return{error:"Document storage is unavailable."}
  const exists=await admin.from("platform_onboarding_submissions").select("id").eq("id",id).maybeSingle()
  if(!exists.data)return{error:"Submission is unavailable."}
  const bytes=Buffer.from(await file.arrayBuffer()),name=file.name.replace(/[^a-zA-Z0-9._() -]/g,"_").slice(0,180)||"QaziPro-document"
  const result=await admin.rpc("append_platform_onboarding_document",{p_submission_id:id,p_document_type:"PLATFORM_SHARED",p_content:`\\x${bytes.toString("hex")}`,p_content_sha256:createHash("sha256").update(bytes).digest("hex"),p_file_name:name,p_content_type:file.type,p_client_user_id:null,p_created_by:context.userId,p_is_client_visible:true})
  if(result.error)return{error:"Client document could not be stored."}
  const client=await createClient();await client.from("platform_onboarding_submission_activity").insert({submission_id:id,actor_user_id:context.userId,action:"PLATFORM_DOCUMENT_SHARED",detail:"QaziPro shared a document in the Client Portal.",public_label:"Document shared",is_client_visible:true})
  await audit(context.userId,"ONBOARDING_DOCUMENT_SHARED","platform_onboarding_submission",id,"Shared a client-visible portal document",undefined,{name,contentType:file.type,size:file.size})
  revalidatePath(`/website/submissions/${id}`);return{success:"Document shared in the Client Portal."}
}
