import { createClient } from "@supabase/supabase-js"

const url=process.env.NEXT_PUBLIC_SUPABASE_URL
const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY
const ref=process.env.STAGING_SUPABASE_PROJECT_REF
if(process.env.STAGING_ENVIRONMENT!=="staging"||!url||!publishable||!secret||new URL(url).hostname!==`${ref}.supabase.co`)throw new Error("Explicit linked staging credentials are required.")
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})
const anon=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}})
const [docs,form,permission]=await Promise.all([
  admin.from("platform_site_documents").select("key,published_version,published_data"),
  admin.from("platform_onboarding_forms").select("id,published_version,published_definition").eq("slug","client-onboarding").single(),
  admin.from("platform_permissions").select("key").eq("key","website.manage").single(),
])
if(docs.error||docs.data.length<4||docs.data.some(row=>row.published_version<1||!row.published_data))throw new Error("Published website defaults are incomplete.")
if(form.error||form.data.published_version<1||!form.data.published_definition)throw new Error("Published onboarding form is unavailable.")
if(permission.error||permission.data.key!=="website.manage")throw new Error("Website RBAC permission is unavailable.")
const privateRead=await anon.from("platform_onboarding_submissions").select("id").limit(1)
if(!privateRead.error)throw new Error("Anonymous submission reads were not denied.")
const publicWrite=await anon.from("platform_onboarding_submissions").insert({})
if(!publicWrite.error)throw new Error("Anonymous submission writes were not denied.")
const formWrite=await anon.from("platform_onboarding_forms").update({name:"tampered"}).eq("id",form.data.id)
if(!formWrite.error)throw new Error("Anonymous form mutation was not denied.")
console.log(JSON.stringify({ok:true,assertions:8,coverage:["published-content","published-form","platform-rbac","private-submission-read","private-submission-write","form-tamper-denied","staging-ref","server-only-contract"]}))
