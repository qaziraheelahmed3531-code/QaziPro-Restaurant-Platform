import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const url = process.env.STAGING_SUPABASE_URL?.trim()
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
const publicKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim()

if (!url || !serviceKey || !publicKey || !/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "")) {
  throw new Error("Explicit staging Supabase credentials and STAGING_ENVIRONMENT=staging are required.")
}

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}${result.error.details ? ` | ${result.error.details}` : ""}`)
  return result.data
}

const email = `qa-step3-pos-${randomUUID()}@example.test`
const password = `Qa!${randomUUID()}a9`
const deviceId = randomUUID()
const offlineOrderId = randomUUID()
const offlineShiftId = randomUUID()
const qaBusinessA = "a0000000-0000-4000-8000-000000000001"
const qaBranchA1 = "a0000000-0000-4000-8000-000000000101"
let userId, membershipId, snapshotId, shiftId, onlineShiftId
const orderIds = []

try {
  const deal = checked(await service.from("deals").select("id,business_id,name,deal_price").eq("business_id", qaBusinessA).eq("slug", "qa-pos-deal-a").eq("is_active", true).single(), "Resolve QA deal")
  const branch = checked(await service.from("branches").select("id,business_id").eq("id", qaBranchA1).eq("business_id", deal.business_id).eq("is_active", true).single(), "Resolve QA branch")
  const created = checked(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Step 3 staging POS QA" } }), "Create cashier")
  userId = created.user.id
  membershipId = checked(await service.from("staff_memberships").insert({ business_id: branch.business_id, branch_id: branch.id, user_id: userId, role: "CASHIER", is_active: true, permissions_customized: true }).select("id").single(), "Create membership").id
  checked(await service.from("staff_membership_branches").insert({ membership_id: membershipId, business_id: branch.business_id, branch_id: branch.id }), "Assign branch")
  checked(await service.from("staff_membership_permissions").insert(["desktop_pos.use", "pos.use", "orders.read", "orders.manage", "receipts.print", "reports.read", "register.manage"].map(permission_code => ({ membership_id: membershipId, permission_code }))), "Grant POS permissions")

  const cashier = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } })
  checked(await cashier.auth.signInWithPassword({ email, password }), "Sign in cashier")
  snapshotId = checked(await cashier.rpc("register_desktop_pos_catalog", { p_branch_id: branch.id, p_device_id: deviceId, p_device_name: "Step 3 staging QA", p_app_version: "0.1.0" }), "Register offline catalog")

  const price = Number(deal.deal_price)
  const now = new Date().toISOString()
  const base = {
    deviceId, catalogVersionId: snapshotId, offlineOrderId, offlineShiftId, soldAt: now, branchId: branch.id,
    openingCash: 5000, shiftOpenedAt: now, shiftClosedAt: null, countedCash: null,
    customerName: "STAGING QA Offline", customerPhone: "Counter", notes: "Step 3 disposable offline verification",
    orderType: "TAKEAWAY", tableReference: "", cashReceived: price,
    items: [{ itemKind: "deal", productId: deal.id, name: deal.name, quantity: 1, unitBasePrice: price, unitModifierPrice: 0, unitPrice: price, modifiers: [] }],
    replacement: null,
  }
  const first = checked(await cashier.rpc("sync_offline_pos_order", { p_payload: base }), "Sync offline order")
  orderIds.push(first.id)
  assert.equal(first.idempotent, false)
  const retry = checked(await cashier.rpc("sync_offline_pos_order", { p_payload: base }), "Retry offline order")
  assert.equal(retry.id, first.id)
  assert.equal(retry.idempotent, true)

  const forged = { ...base, offlineOrderId: randomUUID(), cashReceived: price + 1, items: [{ ...base.items[0], unitBasePrice: price + 1, unitPrice: price + 1 }] }
  const forgedResult = await cashier.rpc("sync_offline_pos_order", { p_payload: forged })
  assert.ok(forgedResult.error)
  assert.match(forgedResult.error.message, /downloaded catalog/i)

  const replacement = { ...base, cashReceived: price * 2, items: [{ ...base.items[0], quantity: 2 }], replacement: { reason: "Step 3 quantity correction", oldItems: base.items, oldTotal: price, createdAt: new Date().toISOString() } }
  const replaced = checked(await cashier.rpc("sync_offline_pos_order", { p_payload: replacement }), "Replace offline order")
  assert.equal(replaced.replaced, true)
  assert.equal(replaced.total, price * 2)
  const payment = checked(await service.from("payment_transactions").select("shift_id,amount").eq("order_id", first.id).single(), "Verify reconciled payment")
  shiftId = payment.shift_id
  assert.equal(payment.amount, price * 2)

  const cancelled = checked(await cashier.rpc("cancel_pos_order", { p_order_id: first.id, p_reason: "Step 3 staging cancellation" }), "Cancel offline order")
  assert.equal(cancelled.status, "CANCELLED")
  const cancelRetry = checked(await cashier.rpc("cancel_pos_order", { p_order_id: first.id, p_reason: "Step 3 duplicate cancellation" }), "Retry cancellation")
  assert.equal(cancelRetry.idempotent, true)
  const refunds = checked(await service.from("refunds").select("amount,status").eq("order_id", first.id), "Verify refund")
  assert.equal(refunds.reduce((sum, row) => sum + Number(row.amount), 0), price * 2)
  assert.ok(refunds.every(row => row.status === "SUCCEEDED"))

  onlineShiftId = checked(await cashier.rpc("open_pos_shift", { p_branch_id: branch.id, p_opening_cash: 0 }), "Open online POS shift").id
  const staged = checked(await cashier.rpc("create_pos_order", { p_payload: {
    branchId: branch.id, shiftId: onlineShiftId, clientReference: randomUUID(), orderType: "TAKEAWAY",
    customerName: "STAGING Lifecycle", customerPhone: "Counter", notes: "Step 3 lifecycle verification",
    cashReceived: price * 2, items: [{ itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] }],
  } }), "Create lifecycle POS order")
  orderIds.push(staged.id)
  const skipped = await cashier.rpc("set_pos_order_stage", { p_order_id: staged.id, p_status: "READY" })
  assert.ok(skipped.error, "Skipping PREPARING must be rejected")
  for (const status of ["PREPARING", "READY", "DELIVERED"]) {
    const moved = checked(await cashier.rpc("set_pos_order_stage", { p_order_id: staged.id, p_status: status }), `Move to ${status}`)
    assert.equal(moved.status, status)
  }
  const finalOrder = checked(await service.from("orders").select("status,payment_status,order_items(pos_section_id,pos_section_name)").eq("id", staged.id).single(), "Verify delivered order")
  assert.equal(finalOrder.status, "DELIVERED")
  assert.equal(finalOrder.payment_status, "PAID")

  const report = checked(await cashier.rpc("restaurant_report", { p_business_id: branch.business_id, p_start: new Date(Date.now() - 3600000).toISOString(), p_end: new Date(Date.now() + 60000).toISOString(), p_branch_id: branch.id }), "Load branch report")
  assert.ok(Number(report.summary.orderCount) >= 1)
  assert.ok(Array.isArray(report.posSections))
  const print = checked(await service.from("print_settings").select("receipt_width_mm,copies,print_kitchen_ticket,show_prices_on_kitchen_ticket").eq("business_id", branch.business_id).maybeSingle(), "Load print settings")
  assert.ok(print && [58, 80].includes(print.receipt_width_mm))
  assert.ok(print.copies >= 1)

  console.log(JSON.stringify({ ok: true, checks: 17, coverage: ["offline-sync", "offline-idempotency", "price-tamper", "replacement", "refund", "cancel-idempotency", "legal-stage-sequence", "branch-report", "pos-sections", "print-settings"] }))
} finally {
  for (const orderId of orderIds) {
    await service.from("audit_logs").delete().eq("entity_id", orderId)
    await service.from("notifications").delete().eq("entity_id", orderId)
    await service.from("order_notifications").delete().eq("order_id", orderId)
    await service.from("pos_order_replacements").delete().eq("order_id", orderId)
    await service.from("refunds").delete().eq("order_id", orderId)
    await service.from("payment_transactions").delete().eq("order_id", orderId)
    await service.from("invoices").delete().eq("order_id", orderId)
    await service.from("orders").delete().eq("id", orderId)
  }
  await service.from("audit_logs").delete().eq("entity_id", deviceId)
  if (shiftId) await service.from("register_shifts").delete().eq("id", shiftId)
  if (onlineShiftId && onlineShiftId !== shiftId) await service.from("register_shifts").delete().eq("id", onlineShiftId)
  if (snapshotId) await service.from("pos_catalog_snapshots").delete().eq("id", snapshotId)
  await service.from("pos_offline_devices").delete().eq("id", deviceId)
  if (membershipId) await service.from("staff_membership_permissions").delete().eq("membership_id", membershipId)
  if (userId) {
    await service.from("staff_memberships").delete().eq("user_id", userId)
    await service.from("audit_logs").delete().eq("actor_id", userId)
    await service.auth.admin.deleteUser(userId)
  }
}
