import Link from "next/link"
import { requirePermission } from "@/lib/auth"
import { getSelectedBranch } from "@/lib/branch"
import { createClient } from "@/lib/supabase/server"
import { OrderFeedbackManager } from "@/components/order-feedback-manager"

export default async function Page() {
  const context = await requirePermission("reviews.manage")
  const db = await createClient()
  const branch = await getSelectedBranch(db, context.businessId, context.assignedBranchId)
  if (!branch) return <div className="state-box">Select an active branch to see order feedback.</div>
  const { data, error } = await db.from("customer_order_feedback").select("id,rating,comment,status,created_at,orders(order_number)")
    .eq("business_id", context.businessId).eq("branch_id", branch.id).order("created_at", { ascending: false }).limit(100)
  return <div className="page-stack"><div className="page-heading"><div><span className="eyebrow">VERIFIED ORDER FEEDBACK</span><h1>Hear from your guests</h1><p>Private feedback from completed orders at this branch. It is never published automatically.</p></div><Link href="/integrations" className="button button--outline">Public review integrations</Link></div>
    {error ? <div className="state-box" role="alert"><h2>Feedback could not be loaded</h2><p>Refresh the page to try again. No feedback has been changed.</p></div> : <OrderFeedbackManager key={`${context.businessId}:${branch.id}`} businessId={context.businessId} branchId={branch.id} initialRows={(data ?? []).map(row => ({ ...row, orderNumber: (Array.isArray(row.orders) ? row.orders[0] : row.orders)?.order_number ?? null }))} />}
  </div>
}
