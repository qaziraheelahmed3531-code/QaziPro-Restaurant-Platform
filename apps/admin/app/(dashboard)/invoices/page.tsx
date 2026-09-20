import { InvoiceManager } from "@/components/invoice-manager"
import { requirePermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getSelectedBranch } from "@/lib/branch"

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const context = await requirePermission("invoices.read")
  const db = await createClient()
  const activeBranch=await getSelectedBranch(db,context.businessId,context.assignedBranchId)
  const [branches, template] = await Promise.all([db.from("branches").select("id,name").eq("business_id",context.businessId).order("sort_order"),db.from("invoice_settings").select("*").eq("business_id",context.businessId).maybeSingle()])
  const {data:identity}=activeBranch?await db.from("branches").select("restaurant_name,name,formatted_address,address,phone").eq("id",activeBranch.id).single():{data:null}
  const params = await searchParams
  const allowed = (permission: string) => context.role === "OWNER" || context.permissions.includes(permission)
  return <InvoiceManager assetOrigin={process.env.CUSTOMER_APP_URL} businessId={context.businessId} branches={branches.data ?? []} template={{...(template.data??{}),business_name:identity?.restaurant_name||identity?.name||context.businessName,address:identity?.formatted_address||identity?.address||template.data?.address,phone:identity?.phone||template.data?.phone}} canCreate={allowed("invoices.create")} canEdit={allowed("invoices.edit")} initialOrder={params.order}/>
}
