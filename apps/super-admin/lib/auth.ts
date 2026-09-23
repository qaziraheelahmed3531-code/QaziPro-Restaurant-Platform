import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server"
import { createPlatformAdminClient } from "@/lib/supabase/admin"
import type { PlatformPermission } from "@/lib/platform"
import { canBootstrapPlatformOwner } from "@/lib/owner-bootstrap"

export type PlatformContext = {
  userId: string
  email: string
  displayName: string
  roleNames: string[]
  permissions: string[]
  mfaRequired: boolean
}

export const getPlatformContext = cache(async (): Promise<PlatformContext | null> => {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : ""
  if (!userId) return null
  const [staffResult, permissionResult, roleResult] = await Promise.all([
    supabase.from("platform_staff").select("display_name,email,status,mfa_required,access_revoked_at").eq("user_id", userId).maybeSingle(),
    supabase.rpc("platform_effective_permissions"),
    supabase.from("platform_staff_roles").select("platform_roles(name)").eq("staff_user_id", userId),
  ])
  const staff = staffResult.data
  if (!staff || staff.status !== "ACTIVE" || (staff.access_revoked_at && Date.parse(staff.access_revoked_at) <= Date.now())) return null
  const roles = (roleResult.data ?? []).flatMap((row) => {
    const value = row.platform_roles as { name?: string } | { name?: string }[] | null
    return Array.isArray(value) ? value.map((item) => item.name ?? "") : value?.name ? [value.name] : []
  }).filter(Boolean)
  return {
    userId,
    email: String(staff.email),
    displayName: String(staff.display_name),
    roleNames: roles,
    permissions: (permissionResult.data ?? []).map(String),
    mfaRequired: Boolean(staff.mfa_required),
  }
})

export async function requirePlatformStaff() {
  if (!isSupabaseConfigured()) redirect("/login?error=configuration")
  const context = await getPlatformContext()
  if (!context) redirect("/login?error=unauthorized")
  return context
}

export async function requirePlatformPermission(permission: PlatformPermission) {
  const context = await requirePlatformStaff()
  if (!context.permissions.includes(permission)) redirect("/access-denied")
  return context
}

export async function bootstrapPlatformOwner() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user?.email || !canBootstrapPlatformOwner(user, process.env.QAZIPRO_PLATFORM_OWNER_EMAILS ?? "")) return false
  const admin = createPlatformAdminClient()
  if (!admin) return false
  // Bootstrap is one-time only. An allowlisted but revoked/suspended owner must
  // never be silently reactivated by signing in again.
  const existing = await admin.from("platform_staff").select("status").eq("user_id", user.id).maybeSingle()
  if (existing.error || existing.data) return false
  const { data: role, error: roleError } = await admin.from("platform_roles").select("id").eq("key", "PLATFORM_OWNER").single()
  if (roleError || !role) return false
  const displayName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email.split("@")[0]).slice(0, 120)
  const { error: staffError } = await admin.from("platform_staff").insert({
    user_id: user.id,
    display_name: displayName,
    email: user.email.toLowerCase(),
    status: "ACTIVE",
    last_login_at: new Date().toISOString(),
  })
  if (staffError) return false
  const assigned = await admin.from("platform_staff_roles").insert({ staff_user_id: user.id, role_id: role.id })
  if (assigned.error) {
    await admin.from("platform_staff").delete().eq("user_id", user.id)
    return false
  }
  const audit = await admin.from("platform_audit_logs").insert({
    actor_user_id: user.id,
    action: "PLATFORM_OWNER_SESSION_ESTABLISHED",
    target_type: "platform_staff",
    target_id: user.id,
    reason: "Environment allowlisted platform owner authentication",
  })
  if (audit.error) {
    await admin.from("platform_staff").delete().eq("user_id", user.id)
    return false
  }
  return true
}

export async function activateInvitedPlatformStaff() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user?.email) return false
  const admin = createPlatformAdminClient()
  if (!admin) return false
  const { data: invited } = await admin.from("platform_staff")
    .select("user_id,email,status")
    .eq("user_id", user.id)
    .eq("email", user.email.toLowerCase())
    .maybeSingle()
  if (!invited || !["INVITED", "ACTIVE"].includes(String(invited.status))) return false
  const now = new Date().toISOString()
  const { error } = await admin.from("platform_staff").update({ status: "ACTIVE", last_login_at: now, updated_at: now }).eq("user_id", user.id)
  if (error) return false
  await admin.from("platform_audit_logs").insert({
    actor_user_id: user.id,
    action: invited.status === "INVITED" ? "PLATFORM_STAFF_INVITATION_ACCEPTED" : "PLATFORM_STAFF_SIGNED_IN",
    target_type: "platform_staff",
    target_id: user.id,
    reason: "Authorized platform staff authentication",
  })
  return true
}
