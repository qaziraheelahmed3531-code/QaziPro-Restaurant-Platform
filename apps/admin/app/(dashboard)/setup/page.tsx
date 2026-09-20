import Link from "next/link"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export default async function Page(){
  const context=await requirePermission("settings.manage");const db=await createClient()
  const [business,branding,branches,hours,areas,categories,products,ingredients,reviews,printing,staff,payments,rules]=await Promise.all([
    db.from("businesses").select("name,phone,address").eq("id",context.businessId).maybeSingle(),
    db.from("business_branding").select("logo_url").eq("business_id",context.businessId).maybeSingle(),
    db.from("branches").select("id,latitude,longitude").eq("business_id",context.businessId).eq("is_active",true),
    db.from("business_hours").select("branch_id,day_of_week,branches!inner(business_id)").eq("branches.business_id",context.businessId),
    db.from("delivery_areas").select("id,branches!inner(business_id)",{count:"exact",head:true}).eq("branches.business_id",context.businessId).eq("is_active",true),
    db.from("categories").select("id",{count:"exact",head:true}).eq("business_id",context.businessId).eq("is_active",true),
    db.from("products").select("id",{count:"exact",head:true}).eq("business_id",context.businessId).eq("is_active",true),
    db.from("ingredients").select("id",{count:"exact",head:true}).eq("business_id",context.businessId),
    db.from("site_settings").select("reviews_enabled,reviews_widget_id").eq("business_id",context.businessId).maybeSingle(),
    db.from("print_settings").select("receipt_width_mm,receipt_footer").eq("business_id",context.businessId).maybeSingle(),
    db.from("staff_memberships").select("id",{count:"exact",head:true}).eq("business_id",context.businessId).eq("is_active",true),
    db.from("payment_provider_settings").select("provider,is_enabled").eq("business_id",context.businessId).eq("provider","CASH").maybeSingle(),
    db.from("delivery_rules").select("branch_id,branches!inner(business_id)").eq("branches.business_id",context.businessId),
  ])
  const activeBranches=branches.data??[]
  const steps=[
    {label:"Business details",done:Boolean(business.data?.name&&business.data.phone&&business.data.address),href:"/business"},
    {label:"Branding & logo",done:Boolean(branding.data?.logo_url),href:"/appearance"},
    {label:"Branch & map origin",done:activeBranches.length>0&&activeBranches.every(row=>row.latitude!==null&&row.longitude!==null),href:"/branches"},
    {label:"Opening hours",done:activeBranches.length>0&&activeBranches.every(branch=>new Set(hours.data?.filter(row=>row.branch_id===branch.id).map(row=>row.day_of_week)).size===7),href:"/hours"},
    {label:"Delivery areas & pricing",done:(areas.count??0)>0&&activeBranches.every(branch=>rules.data?.some(row=>row.branch_id===branch.id)),href:"/delivery"},
    {label:"Categories",done:(categories.count??0)>0,href:"/categories"},
    {label:"Products & modifiers",done:(products.count??0)>0,href:"/menu"},
    {label:"Inventory",done:(ingredients.count??0)>0,href:"/inventory",optional:true},
    {label:"Reviews",done:Boolean(reviews.data&&(!reviews.data.reviews_enabled||reviews.data.reviews_widget_id)),href:"/integrations",optional:true},
    {label:"Cash payments",done:Boolean(payments.data?.is_enabled),href:"/payments"},
    {label:"Printing settings",done:Boolean(printing.data?.receipt_width_mm&&printing.data.receipt_footer),href:"/printing"},
    {label:"Staff access",done:(staff.count??0)>0,href:"/users"},
  ]
  const required=steps.filter(step=>!step.optional);const percent=Math.round(required.filter(step=>step.done).length/required.length*100)
  return <><div className="page-heading"><div><span className="eyebrow">CLIENT HANDOVER</span><h1>Setup wizard</h1><p>Complete the required settings, then verify a real order and printer before opening service.</p></div><div className="setup-score"><strong>{percent}%</strong><span>required configuration complete</span></div></div><div className="setup-progress"><i style={{width:`${percent}%`}}/></div><div className="setup-list">{steps.map((step,index)=><Link className="setup-item" href={step.href} key={step.label}><i>{step.done?"✓":index+1}</i><span><strong>{step.label}{step.optional?" (optional)":""}</strong><small>{step.done?"Configured":"Action required"}</small></span><b>Open →</b></Link>)}<Link className="setup-item" href="/system-health"><i>13</i><span><strong>Go-live verification</strong><small>Check system health and complete a live service test.</small></span><b>Open →</b></Link></div></>
}
