import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf("=")
      return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")]
    }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const [permission, role, orders, payments, shifts, invites, users] = await Promise.all([
  db.from("admin_permissions").select("code").eq("code", "waiter.use"),
  db.from("admin_role_permissions").select("role,permission_code").eq("role", "WAITER"),
  db.from("orders").select("id", { count: "exact", head: true }).like("table_reference", "QA%"),
  db.from("payment_transactions").select("id", { count: "exact", head: true }).like("idempotency_key", "waiter-pos-%"),
  db.from("register_shifts").select("id", { count: "exact", head: true }).ilike("notes", "QA waiter%"),
  db.from("staff_invitations").select("id", { count: "exact", head: true }).ilike("email", "qa-%"),
  db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
])
for (const result of [permission, role, orders, payments, shifts, invites]) {
  if (result.error) throw result.error
}
if (users.error) throw users.error
const qaUsers = users.data.users.filter((user) => user.email?.startsWith("qa-")).length
assert.equal(permission.data.length, 1)
assert.deepEqual(role.data.map((row) => row.permission_code), ["waiter.use"])
assert.equal(orders.count, 0)
assert.equal(payments.count, 0)
assert.equal(shifts.count, 0)
assert.equal(invites.count, 0)
assert.equal(qaUsers, 0)
console.log("PASS: live WAITER permission is unique and all disposable waiter orders, payments, shifts, invitations and users are removed")
