// Live Auth/database callback test using a disposable account. Generates a link but sends no email.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const origin = process.argv[2] ?? "http://localhost:3001"
const invitedRole = process.argv[3] === "WAITER" ? "WAITER" : "KITCHEN"
const invitedPermission = invitedRole === "WAITER" ? "waiter.use" : "kds.use"
const invitedPath = invitedRole === "WAITER" ? "/waiter" : "/kitchen"
assert.equal(new URL(origin).hostname, "localhost", "Staff invitation QA target must be loopback")
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")] }))
const provider = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const email = `qa-staff-invite-${randomUUID()}@example.com`
let invitationId
let userId
let failed = false

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.code ?? result.error.status ?? "provider error"}`)
  return result.data
}

try {
  const business = checked(await provider.from("businesses").select("id").eq("slug", "italian-pizza").single(), "Resolve business")
  const branch = checked(await provider.from("branches").select("id,restaurant_name,name,city").eq("business_id", business.id).eq("is_active", true).order("sort_order").limit(1).single(), "Resolve active restaurant")
  const owner = checked(await provider.from("staff_memberships").select("user_id").eq("business_id", business.id).eq("role", "OWNER").eq("is_active", true).limit(1).single(), "Resolve inviting owner")
  const invitation = checked(await provider.from("staff_invitations").insert({ business_id: business.id, branch_id: branch.id, email, role: invitedRole, permissions: [invitedPermission], invited_by: owner.user_id, delivery_status: "SENT" }).select("id").single(), "Create disposable pending invitation")
  invitationId = invitation.id
  const generated = checked(await provider.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${origin}/auth/invite?business=${business.id}&branch=${branch.id}`, data: { staff_business_id: business.id, staff_branch_id: branch.id } } }), "Generate secure invite link")
  userId = generated.user.id
  assert.ok(generated.properties.hashed_token, "Invite must contain a server-verifiable token hash")

  const confirm = new URL("/auth/confirm", origin)
  confirm.searchParams.set("token_hash", generated.properties.hashed_token)
  confirm.searchParams.set("type", "invite")
  confirm.searchParams.set("business", business.id)
  confirm.searchParams.set("branch", branch.id)
  const response = await fetch(confirm, { redirect: "manual", signal: AbortSignal.timeout(45000) })
  assert.ok(response.status >= 300 && response.status < 400, `Confirmation callback should redirect, received HTTP ${response.status}`)
  assert.equal(new URL(response.headers.get("location"), origin).pathname, invitedPath, `${invitedRole} invite must land on the first authorized area`)
  const setCookies = response.headers.getSetCookie()
  assert.ok(setCookies.some(value => value.startsWith("ip-admin-business=")), "Callback must persist the invited business")
  assert.ok(setCookies.some(value => value.startsWith("ip-admin-branch=")), "Callback must persist the invited restaurant branch")
  const cookie = setCookies.map(value => value.split(";", 1)[0]).join("; ")
  const permittedPage = await fetch(new URL(invitedPath, origin), { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(45000) })
  assert.equal(permittedPage.status, 200, "Invited employee must reach the permitted restaurant area")
  const payments = await fetch(new URL("/payments", origin), { headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(45000) })
  const paymentsBody = await payments.text()
  assert.ok(!paymentsBody.includes("Payment center") && (payments.status >= 300 || paymentsBody.includes("NEXT_REDIRECT")), `Invited employee must be denied an unassigned area (HTTP ${payments.status})`)

  const membership = checked(await provider.from("staff_memberships").select("id,business_id,branch_id,role,is_active,staff_membership_permissions(permission_code)").eq("business_id", business.id).eq("user_id", userId).single(), "Verify claimed membership")
  assert.equal(membership.role, invitedRole)
  assert.equal(membership.is_active, true)
  assert.equal(membership.branch_id, branch.id, "Membership must retain the invited restaurant branch")
  assert.deepEqual(membership.staff_membership_permissions.map(row => row.permission_code), [invitedPermission])
  const claimed = checked(await provider.from("staff_invitations").select("status,activated_user_id").eq("id", invitationId).single(), "Verify invitation status")
  assert.equal(claimed.status, "ACTIVATED")
  assert.equal(claimed.activated_user_id, userId)
  console.log(`PASS: secure invite activated exact ${invitedRole} access, selected ${branch.restaurant_name || branch.name} — ${branch.city}, landed on ${invitedPath}, and denied Payments`)
} catch (error) {
  failed = true
  console.error(`FAIL: ${error instanceof Error ? error.message : "staff invitation verification failed"}`)
} finally {
  if (userId) {
    await provider.from("audit_logs").delete().eq("actor_id", userId)
    await provider.from("staff_memberships").delete().eq("user_id", userId)
  }
  if (invitationId) await provider.from("staff_invitations").delete().eq("id", invitationId)
  if (userId) await provider.auth.admin.deleteUser(userId)
  console.log("Disposable invitation, membership and Auth account cleanup completed; no email was sent.")
}

if (failed) process.exitCode = 1
