import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const i = line.indexOf("=");
      return [
        line.slice(0, i),
        line
          .slice(i + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);
const service = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const email = `qa-premium-pos-${randomUUID()}@example.test`,
  password = `Qa!${randomUUID()}a9`;
let userId, shiftId;
const orderIds = [];
try {
  const branch = checked(
    await service
      .from("branches")
      .select("id,business_id")
      .eq("is_active", true)
      .limit(1)
      .single(),
    "branch",
  );
  const sections = checked(
    await service
      .from("pos_sections")
      .select("id,name,color")
      .eq("business_id", branch.business_id)
      .order("sort_order"),
    "POS sections",
  );
  assert.ok(sections.length > 0, "at least one POS section must be configured");
  const assignedProduct = checked(
    await service
      .from("products")
      .select("id,pos_section_id")
      .eq("business_id", branch.business_id)
      .not("pos_section_id", "is", null)
      .limit(1)
      .maybeSingle(),
    "assigned POS product",
  );
  assert.ok(
    assignedProduct?.pos_section_id,
    "products must be assignable to independent POS sections",
  );
  const receiptSettings = checked(
    await service
      .from("invoice_settings")
      .select(
        "receipt_logo_size,receipt_logo_alignment,receipt_header_alignment,show_phone,show_order_number",
      )
      .eq("business_id", branch.business_id)
      .maybeSingle(),
    "receipt settings",
  );
  assert.ok(
    receiptSettings && Number(receiptSettings.receipt_logo_size) >= 24,
    "receipt design settings must be persisted",
  );
  const deal = checked(
    await service
      .from("deals")
      .select("id,name,deal_price")
      .eq("business_id", branch.business_id)
      .eq("is_active", true)
      .limit(1)
      .single(),
    "deal",
  );
  const methods = checked(
    await service
      .from("pos_payment_methods")
      .select("code,name,kind,requires_reference")
      .eq("business_id", branch.business_id)
      .eq("is_active", true),
    "payment methods",
  );
  for (const code of ["CASH", "EASYPAISA", "JAZZCASH"])
    assert.ok(
      methods.some((method) => method.code === code),
      `${code} must be configured`,
    );
  userId = checked(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "QA Premium POS" },
    }),
    "cashier",
  ).user.id;
  checked(
    await service
      .from("staff_memberships")
      .insert({
        business_id: branch.business_id,
        branch_id: branch.id,
        user_id: userId,
        role: "CASHIER",
        is_active: true,
      }),
    "membership",
  );
  const cashier = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  checked(
    await cashier.auth.signInWithPassword({ email, password }),
    "sign in",
  );
  const shift = checked(
    await cashier.rpc("open_pos_shift", {
      p_branch_id: branch.id,
      p_opening_cash: 1000,
    }),
    "shift",
  );
  shiftId = shift.id;
  const base = {
    branchId: branch.id,
    shiftId,
    clientReference: randomUUID(),
    orderType: "TAKEAWAY",
    customerName: "QA TEST DO NOT FULFILL",
    customerPhone: "Counter",
    notes: "Premium tender lifecycle QA",
    items: [
      { itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] },
    ],
  };
  const wallet = checked(
    await cashier.rpc("create_pos_order", {
      p_payload: {
        ...base,
        paymentMethodCode: "EASYPAISA",
        paymentReference: "QA-EASYPAISA-123",
        cashReceived: 0,
      },
    }),
    "wallet sale",
  );
  orderIds.push(wallet.id);
  assert.equal(wallet.paymentMethod, "EASYPAISA");
  assert.equal(wallet.change, 0);
  const payment = checked(
    await service
      .from("payment_transactions")
      .select("provider,payment_method,provider_transaction_id,status,amount")
      .eq("order_id", wallet.id)
      .single(),
    "wallet ledger",
  );
  assert.deepEqual(
    {
      provider: payment.provider,
      method: payment.payment_method,
      reference: payment.provider_transaction_id,
      status: payment.status,
    },
    {
      provider: "POS_EASYPAISA",
      method: "EASYPAISA",
      reference: "QA-EASYPAISA-123",
      status: "PAID",
    },
  );
  assert.equal(payment.amount, Number(deal.deal_price));
  const optionalReference = checked(
    await cashier.rpc("create_pos_order", {
      p_payload: {
        ...base,
        clientReference: randomUUID(),
        paymentMethodCode: "JAZZCASH",
        paymentReference: "",
        cashReceived: 0,
      },
    }),
    "optional-reference wallet sale",
  );
  orderIds.push(optionalReference.id);
  assert.equal(optionalReference.paymentMethod, "JAZZCASH");
  assert.equal(optionalReference.change, 0);
  const skipped = await cashier.rpc("set_pos_order_stage", {
    p_order_id: wallet.id,
    p_status: "READY",
  });
  assert.ok(skipped.error);
  assert.match(skipped.error.message, /must move/i);
  const preparing = checked(
    await cashier.rpc("set_pos_order_stage", {
      p_order_id: wallet.id,
      p_status: "PREPARING",
    }),
    "preparing stage",
  );
  assert.equal(preparing.status, "PREPARING");
  const ready = checked(
    await cashier.rpc("set_pos_order_stage", {
      p_order_id: wallet.id,
      p_status: "READY",
    }),
    "ready stage",
  );
  assert.equal(ready.status, "READY");
  const delivered = checked(
    await cashier.rpc("set_pos_order_stage", {
      p_order_id: wallet.id,
      p_status: "DELIVERED",
    }),
    "delivered stage",
  );
  assert.equal(delivered.status, "DELIVERED");
  const saved = checked(
    await service
      .from("orders")
      .select("channel,status,payment_status,payment_reference")
      .eq("id", wallet.id)
      .single(),
    "saved order",
  );
  assert.deepEqual(saved, {
    channel: "POS",
    status: "DELIVERED",
    payment_status: "PAID",
    payment_reference: "QA-EASYPAISA-123",
  });
  const website = checked(
    await service.rpc("create_order_authoritative", {
      p_payload: {
        branchId: branch.id,
        channel: "WEBSITE",
        serviceMode: "PICKUP",
        paymentMethod: "CASH_ON_DELIVERY",
        customerName: "QA WEBSITE DO NOT FULFILL",
        customerPhone: "03000000000",
        items: [
          { itemKind: "deal", productId: deal.id, quantity: 1, modifiers: [] },
        ],
      },
    }),
    "website order",
  );
  orderIds.push(website.id);
  const websiteStage = await cashier.rpc("set_pos_order_stage", {
    p_order_id: website.id,
    p_status: "DELIVERED",
  });
  assert.ok(websiteStage.error);
  assert.match(websiteStage.error.message, /access denied/i);
  const untouched = checked(
    await service
      .from("orders")
      .select("channel,status")
      .eq("id", website.id)
      .single(),
    "website untouched",
  );
  assert.equal(untouched.channel, "WEBSITE");
  assert.notEqual(untouched.status, "DELIVERED");
  const report = checked(
    await cashier.rpc("restaurant_report", {
      p_business_id: branch.business_id,
      p_start: new Date(Date.now() - 3600000).toISOString(),
      p_end: new Date(Date.now() + 3600000).toISOString(),
      p_branch_id: branch.id,
    }),
    "POS section report",
  );
  assert.ok(
    Array.isArray(report.posSections),
    "restaurant report must include POS section sales",
  );
  console.log(
    "PASS: POS sections, receipt controls, configurable tenders, sequential kitchen stages, section reporting and website-order isolation are live.",
  );
} finally {
  if (orderIds.length) {
    await service.from("audit_logs").delete().in("entity_id", orderIds);
    await service.from("notifications").delete().in("entity_id", orderIds);
    await service
      .from("payment_transactions")
      .delete()
      .in("order_id", orderIds);
    await service.from("invoices").delete().in("order_id", orderIds);
    await service.from("orders").delete().in("id", orderIds);
  }
  if (shiftId) await service.from("register_shifts").delete().eq("id", shiftId);
  if (userId) {
    await service.from("staff_memberships").delete().eq("user_id", userId);
    await service.from("audit_logs").delete().eq("actor_id", userId);
    await service.from("profiles").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
  }
  console.log("Disposable premium POS fixtures removed.");
}
