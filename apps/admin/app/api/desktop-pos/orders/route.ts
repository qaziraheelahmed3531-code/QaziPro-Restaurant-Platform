import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { nextOrderStatuses, type OrderStatus } from "@italian-pizza/shared";
import { deliverOrderConfirmation } from "@/lib/email/deliver-order-confirmation";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Private-Network": "true",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: cors });
const uuid = (value: string | null) =>
  Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function authorized(request: Request, branchId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = bearer(request);
  if (!url || !key || !token || !uuid(branchId)) return null;
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [
    { data: userData, error: userError },
    { data: branch, error: branchError },
  ] = await Promise.all([
    db.auth.getUser(token),
    db
      .from("branches")
      .select("id,business_id")
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  if (userError || !userData.user || branchError || !branch) return null;
  const [membership, permissions] = await Promise.all([
    db
      .from("staff_memberships")
      .select("id,branch_id,role,staff_membership_branches(branch_id)")
      .eq("user_id", userData.user.id)
      .eq("business_id", branch.business_id)
      .eq("is_active", true),
    db.rpc("effective_permissions", { p_business_id: branch.business_id }),
  ]);
  const assigned = membership.data?.some((row) =>
    row.role === "OWNER" ||
    row.branch_id === branchId ||
    (row.staff_membership_branches ?? []).some(
      (assignment: { branch_id: string }) => assignment.branch_id === branchId,
    ),
  );
  const grants = new Set((permissions.data ?? []) as string[]);
  const entitlement = await db.rpc("resolve_runtime_entitlement", {
    p_business_id: branch.business_id,
    p_branch_id: branchId,
    p_capability_key: "pos.desktop",
  });
  if (
    membership.error ||
    permissions.error ||
    !assigned ||
    !grants.has("desktop_pos.use") ||
    !grants.has("pos.use") ||
    !grants.has("orders.read") ||
    !grants.has("orders.manage") ||
    entitlement.error ||
    !(entitlement.data as { enabled?: boolean } | null)?.enabled
  )
    return null;
  return { db, businessId: branch.business_id };
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function GET(request: Request) {
  const branchId = new URL(request.url).searchParams.get("branch") ?? "";
  const access = await authorized(request, branchId);
  if (!access) return json({ error: "Desktop POS order access denied." }, 403);
  const { data, error } = await access.db
    .from("orders")
    .select(
      "id,order_number,token_number,service_mode,operational_order_type,status,payment_method,payment_status,payment_reference,customer_name,customer_phone,customer_email,delivery_area_name,delivery_address,delivery_instructions,subtotal,discount,tax,delivery_fee,total,created_at,updated_at,order_notes,table_reference,order_items(id,product_name,variant_id,variant_name,quantity,unit_base_price,unit_modifier_price,unit_price,line_total,order_item_modifiers(group_name,option_name,price_adjustment))",
    )
    .eq("business_id", access.businessId)
    .eq("branch_id", branchId)
    .eq("channel", "WEBSITE")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return json({ error: "Website orders could not be loaded." }, 502);
  return json({ orders: data ?? [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    branchId?: string;
    orderId?: string;
    status?: OrderStatus;
  } | null;
  const branchId = body?.branchId ?? "";
  if (
    !uuid(branchId) ||
    !uuid(body?.orderId ?? "") ||
    !body?.status ||
    !(body.status in nextOrderStatuses)
  )
    return json({ error: "Choose a valid website order and status." }, 400);
  const access = await authorized(request, branchId);
  if (!access) return json({ error: "Desktop POS order access denied." }, 403);
  const select =
    "id,business_id,branch_id,customer_id,status,order_number,token_number,customer_email,customer_name,service_mode,delivery_address,total,order_items(product_name,quantity,line_total),branches(restaurant_name,name,formatted_address,address,phone)";
  const { data: current, error: readError } = await access.db
    .from("orders")
    .select(select)
    .eq("id", body.orderId!)
    .eq("business_id", access.businessId)
    .eq("branch_id", branchId)
    .eq("channel", "WEBSITE")
    .maybeSingle();
  if (readError || !current)
    return json({ error: "Website order could not be found." }, 404);
  if (
    current.status !== body.status &&
    !nextOrderStatuses[current.status as OrderStatus]?.includes(body.status)
  )
    return json(
      { error: "That status change is not allowed. Refresh the order." },
      409,
    );
  if (
    current.service_mode === "DELIVERY" &&
    ((current.status === "READY" && body.status === "OUT_FOR_DELIVERY") ||
      (current.status === "OUT_FOR_DELIVERY" && body.status === "DELIVERED"))
  ) {
    const { data: setting } = await access.db
      .from("business_operating_settings")
      .select("rider_portal_enabled")
      .eq("business_id", access.businessId)
      .maybeSingle();
    if (setting?.rider_portal_enabled)
      return json(
        {
          error:
            "Rider Portal is enabled. The assigned rider controls this delivery step.",
        },
        409,
      );
  }
  let order = current;
  if (current.status !== body.status) {
    const updated = await access.db
      .from("orders")
      .update({ status: body.status })
      .eq("id", current.id)
      .eq("status", current.status)
      .select(select)
      .maybeSingle();
    if (updated.error || !updated.data)
      return json(
        { error: "Order changed elsewhere. Refresh and try again." },
        409,
      );
    order = updated.data;
  }
  let emailStatus: "NOT_REQUIRED" | "PENDING" | "SENT" | "FAILED" | "SKIPPED" =
    "NOT_REQUIRED";
  if (body.status === "CONFIRMED")
    emailStatus = await deliverOrderConfirmation(access.db, order);
  return json({ ok: true, status: body.status, emailStatus });
}
