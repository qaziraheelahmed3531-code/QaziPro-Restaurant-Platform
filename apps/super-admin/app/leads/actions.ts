"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requirePlatformPermission } from "@/lib/auth"
import { createPlatformAdminClient } from "@/lib/supabase/admin"

const statuses = new Set(["NEW","CONTACTED","QUALIFIED","DEMO_SCHEDULED","PROPOSAL","WON","LOST","CONVERTED","CLOSED"])

export async function updateLeadStatusAction(formData: FormData) {
  const context = await requirePlatformPermission("onboarding.manage")
  const id = String(formData.get("id") ?? "")
  const status = String(formData.get("status") ?? "")
  if (!/^[0-9a-f-]{36}$/i.test(id) || !statuses.has(status)) redirect("/leads?error=validation")
  const admin = createPlatformAdminClient()
  if (!admin) redirect("/leads?error=configuration")
  const previous = await admin.from("platform_demo_requests").select("status,business_name").eq("id", id).maybeSingle()
  if (previous.error || !previous.data) redirect("/leads?error=missing")
  const updated = await admin.from("platform_demo_requests").update({ status }).eq("id", id)
  if (updated.error) redirect("/leads?error=update")
  await admin.from("platform_audit_logs").insert({
    actor_user_id: context.userId,
    action: "PLATFORM_LEAD_STATUS_CHANGED",
    target_type: "platform_demo_requests",
    target_id: id,
    reason: `Lead moved from ${previous.data.status} to ${status}`,
    before_data: { status: previous.data.status },
    after_data: { status },
  })
  revalidatePath("/leads")
  redirect("/leads?updated=1")
}
