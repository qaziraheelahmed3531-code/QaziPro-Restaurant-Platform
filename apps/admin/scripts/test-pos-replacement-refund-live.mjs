import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

process.loadEnvFile(new URL("../../backend/.env.local", import.meta.url))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const publicDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const check = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.code} ${result.error.message}`); return result.data }

let ownerId
let shiftId
const orderIds = []
const invoiceIds = []

try {
  const branch = check(await db.from("branches").select("id,business_id").eq("is_active", true).order("sort_order").limit(1).single(), "branch")
  const deal = check(await db.from("deals").select("id,name,deal_price").eq("business_id", branch.business_id).eq("is_active", true).order("deal_price", { ascending: false }).limit(1).single(), "deal")
  const products = check(await db.from("products").select("id,name,base_price,sale_price,product_modifier_groups(modifier_groups(min_selections,is_active))").eq("business_id", branch.business_id).eq("is_active", true).eq("is_available", true).order("base_price"), "products")
  const product = products.find(row => Number(row.sale_price ?? row.base_price) < Number(deal.deal_price) && !(row.product_modifier_groups ?? []).some(link => {
    const group = Array.isArray(link.modifier_groups) ? link.modifier_groups[0] : link.modifier_groups
    return group?.is_active && Number(group.min_selections) > 0
  }))
  assert.ok(product, "A cheaper product without required options is needed")

  const email = `qa-pos-refund-${randomUUID()}@example.test`
  const password = `Qa!${randomUUID()}a9`
  ownerId = check(await db.auth.admin.createUser({ email, password, email_confirm: true }), "owner").user.id
  check(await db.from("staff_memberships").insert({ business_id: branch.business_id, user_id: ownerId, role: "OWNER", is_active: true }), "membership")
  check(await publicDb.auth.signInWithPassword({ email, password }), "sign in")
  const shift = check(await publicDb.rpc("open_pos_shift", { p_branch_id: branch.id, p_opening_cash: 0 }), "shift")
  shiftId = shift.id

  const createQaOrder = async () => {
    const result = check(await publicDb.rpc("create_pos_order", { p_payload: {
      branchId: branch.id, shiftId, clientReference: randomUUID(), orderType: "TAKEAWAY",
      customerName: "QA TEST DO NOT FULFILL", customerPhone: "Counter", notes: "Automated replacement verification",
      cashReceived: 100000, items: [{ itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] }],
    } }), "POS order")
    orderIds.push(result.id)
    return result.id
  }

  const replacementOrderId = await createQaOrder()
  const replaced = check(await publicDb.rpc("replace_pos_order", { p_order_id: replacementOrderId, p_payload: {
    branchId: branch.id, shiftId, reason: "Customer requested a cheaper item", cashReceived: 0,
    items: [{ itemKind: "product", productId: product.id, quantity: 1, modifiers: [] }],
  } }), "deal-to-product replacement")
  const productPrice = Number(product.sale_price ?? product.base_price)
  assert.equal(replaced.total, productPrice)
  assert.equal(replaced.refund, Number(deal.deal_price) - productPrice)
  const refund = check(await db.from("refunds").select("amount,status,cash_shift_id").eq("order_id", replacementOrderId).single(), "refund")
  assert.equal(refund.amount, replaced.refund)
  assert.equal(refund.status, "SUCCEEDED")
  assert.equal(refund.cash_shift_id, shiftId)

  // Validate the narrowly-scoped finalized invoice predecessor link.
  const prefix = randomUUID().slice(0, 8).toUpperCase()
  const predecessor = check(await db.from("invoices").insert({
    business_id: branch.business_id, branch_id: branch.id, order_id: replacementOrderId,
    invoice_number: `QA-OLD-${prefix}`, customer_name: "QA TEST DO NOT FULFILL", status: "VOID",
    subtotal: Number(deal.deal_price), total: Number(deal.deal_price), created_by: ownerId,
    void_reason: "Automated predecessor validation", voided_at: new Date().toISOString(),
  }).select("id").single(), "predecessor invoice")
  invoiceIds.push(predecessor.id)
  const reissued = check(await db.from("invoices").insert({
    business_id: branch.business_id, branch_id: branch.id, order_id: replacementOrderId,
    invoice_number: `QA-NEW-${prefix}`, customer_name: "QA TEST DO NOT FULFILL", status: "FINALIZED",
    subtotal: productPrice, total: productPrice, created_by: ownerId, finalized_at: new Date().toISOString(),
  }).select("id").single(), "reissued invoice")
  invoiceIds.push(reissued.id)
  const linked = check(await db.from("invoices").update({ reissued_from: predecessor.id }).eq("id", reissued.id).select("reissued_from").single(), "invoice link")
  assert.equal(linked.reissued_from, predecessor.id)

  // Validate that an in-progress replacement shell suppresses the per-line
  // invoice trigger until the authoritative rebuild is complete.
  const triggerOrderId = await createQaOrder()
  check(await db.from("orders").update({ customer_name: "Replacement trigger verification" }).eq("id", triggerOrderId), "trigger order identity")
  check(await db.from("order_items").delete().eq("order_id", triggerOrderId), "old trigger items")
  check(await db.from("pos_order_replacements").insert({
    business_id: branch.business_id, branch_id: branch.id, order_id: triggerOrderId, replaced_by: ownerId,
    reason: "Automated in-progress rebuild", old_items: [], new_items: [],
    old_total: Number(deal.deal_price), new_total: 0, cash_adjustment: 0,
  }), "replacement shell")
  check(await db.from("order_items").insert({
    order_id: triggerOrderId, product_id: product.id, product_name: product.name,
    quantity: 1, unit_base_price: productPrice, unit_price: productPrice, line_total: productPrice,
  }), "rebuilt item")
  const prematureInvoices = check(await db.from("invoices").select("id").eq("order_id", triggerOrderId), "premature invoices")
  assert.equal(prematureInvoices.length, 0)

  console.log("PASS: live deal-to-product refund, cash ledger, invoice predecessor link and replacement invoice suppression")
} finally {
  if (invoiceIds.length) await db.from("invoices").delete().in("id", invoiceIds)
  if (orderIds.length) {
    await db.from("refunds").delete().in("order_id", orderIds)
    await db.from("payment_transactions").delete().in("order_id", orderIds)
    await db.from("pos_order_replacements").delete().in("order_id", orderIds)
    await db.from("orders").delete().in("id", orderIds)
  }
  if (shiftId) await db.from("register_shifts").delete().eq("id", shiftId)
  if (ownerId) {
    await db.from("audit_logs").delete().eq("actor_id", ownerId)
    await db.from("staff_memberships").delete().eq("user_id", ownerId)
    await db.from("profiles").delete().eq("id", ownerId)
    await db.auth.admin.deleteUser(ownerId)
  }
}
