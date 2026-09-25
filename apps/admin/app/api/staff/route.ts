import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminError } from "@/lib/admin-errors";
import { sendStaffInvitationEmail } from "@/lib/email/staff-invitation";

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const context = await getAdminContext();
  if (
    !context ||
    (context.role !== "OWNER" && !context.permissions.includes("staff.manage"))
  )
    return NextResponse.json(
      { error: "Staff access denied." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  if (!body || !validUuid(body.staffId))
    return NextResponse.json(
      { error: "Select a valid staff member to remove." },
      { status: 400 },
    );
  const db = await createClient();
  const { data, error } = await db.rpc("revoke_staff_access", {
    p_business_id: context.businessId,
    p_staff_id: body.staffId,
  });
  if (error)
    return NextResponse.json(
      {
        error: adminError(
          error,
          "Staff access could not be removed. Refresh and try again.",
        ),
      },
      { status: 400 },
    );
  const kind = (data as { kind?: string } | null)?.kind;
  return NextResponse.json({
    ok: true,
    message:
      kind === "INVITATION"
        ? "Pending invitation cancelled and access removed."
        : "Staff access removed. Their account can no longer open this restaurant.",
  });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const context = await getAdminContext();
  if (
    !context ||
    (context.role !== "OWNER" && !context.permissions.includes("staff.manage"))
  )
    return NextResponse.json(
      { error: "Staff access denied." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.email !== "string" ||
    !Array.isArray(body.branchIds) ||
    body.branchIds.length > 100 ||
    body.branchIds.some((value: unknown) => !validUuid(value)) ||
    ![
      "OWNER",
      "MANAGER",
      "CASHIER",
      "KITCHEN",
      "WAITER",
      "RIDER",
      "STAFF",
    ].includes(body.role) ||
    typeof body.active !== "boolean" ||
    typeof body.sendInvite !== "boolean" ||
    !Array.isArray(body.permissions) ||
    body.permissions.length > 100 ||
    body.permissions.some((v: unknown) => typeof v !== "string")
  )
    return NextResponse.json(
      { error: "Check the employee email, restaurant, role and permissions." },
      { status: 400 },
    );
  const desktopCore = [
    "desktop_pos.use",
    "pos.use",
    "orders.read",
    "orders.manage",
    "receipts.print",
  ];
  if (
    body.role === "CASHIER" &&
    !desktopCore.every((permission) => body.permissions.includes(permission))
  )
    return NextResponse.json(
      {
        error:
          "Desktop POS cashier access must keep POS sales, website order control and receipt printing enabled.",
      },
      { status: 400 },
    );
  if (
    body.permissions.includes("desktop_pos.use") &&
    body.role !== "CASHIER" &&
    body.role !== "OWNER"
  )
    return NextResponse.json(
      { error: "QaziPRO POS Desktop access uses the dedicated CASHIER role." },
      { status: 400 },
    );
  const db = await createClient();
  const branchIds = Array.from(new Set(body.branchIds as string[]));
  if (body.role !== "OWNER" && branchIds.length === 0)
    return NextResponse.json(
      { error: "Select at least one active branch." },
      { status: 400 },
    );
  if (
    context.role !== "OWNER" &&
    branchIds.some((id) => !context.allowedBranchIds.includes(id))
  )
    return NextResponse.json(
      { error: "You can invite staff only to your assigned restaurant." },
      { status: 403 },
    );
  let branchQuery = db
    .from("branches")
    .select("id,name,restaurant_name,city,formatted_address,address")
    .eq("business_id", context.businessId)
    .eq("is_active", true);
  if (branchIds.length) branchQuery = branchQuery.in("id", branchIds);
  const branchResult = await branchQuery.order("sort_order");
  if (
    body.role !== "OWNER" &&
    (branchResult.data?.length ?? 0) !== branchIds.length
  )
    return NextResponse.json(
      { error: "Select an active restaurant before inviting staff." },
      { status: 400 },
    );
  const { data, error } = await db.rpc("save_staff_by_email_v2", {
    p_business_id: context.businessId,
    p_branch_ids: branchIds,
    p_email: body.email,
    p_role: body.role,
    p_active: body.active,
    p_permissions: body.permissions,
  });
  if (error)
    return NextResponse.json({ error: adminError(error) }, { status: 400 });
  const isPendingInvitation = data.status === "PENDING";
  if (!isPendingInvitation && !body.sendInvite)
    return NextResponse.json({
      ok: true,
      message:
        "Staff permissions updated. They apply on the next protected request.",
    });
  if (!body.active)
    return NextResponse.json({
      ok: true,
      message: "Invitation saved as inactive. No email was sent.",
    });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl =
    process.env.ADMIN_APP_URL?.trim() || new URL(request.url).origin;
  if (!url || !serviceKey)
    return NextResponse.json(
      {
        ok: false,
        pending: true,
        error:
          "Staff invitation was saved, but secure server invitation access is not configured. Add the Supabase service key and resend.",
      },
      { status: 503 },
    );
  const admin = createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const brandingResult = await db
      .from("business_branding")
      .select("logo_url,primary_color")
      .eq("business_id", context.businessId)
      .maybeSingle();
    const branch = branchResult.data?.[0];
    const invitationReturnUrl = new URL("/auth/invite", appUrl);
    invitationReturnUrl.searchParams.set("business", context.businessId);
    if (branch) invitationReturnUrl.searchParams.set("branch", branch.id);
    const linkOptions = {
      redirectTo: invitationReturnUrl.toString(),
      data: {
        staff_business_id: context.businessId,
        staff_branch_id: branch?.id ?? null,
        staff_branch_ids: branchIds,
      },
    };
    let linkType: "invite" | "magiclink" = "invite";
    let generated = await admin.auth.admin.generateLink({
      type: linkType,
      email: data.email,
      options: linkOptions,
    });
    if (generated.error) {
      linkType = "magiclink";
      generated = await admin.auth.admin.generateLink({
        type: linkType,
        email: data.email,
        options: linkOptions,
      });
    }
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash)
      throw (
        generated.error ??
        new Error("The secure invitation link could not be generated.")
      );
    const acceptUrl = new URL("/auth/confirm", appUrl);
    acceptUrl.searchParams.set("token_hash", tokenHash);
    acceptUrl.searchParams.set("type", linkType);
    acceptUrl.searchParams.set("business", context.businessId);
    if (branch) acceptUrl.searchParams.set("branch", branch.id);
    const restaurantName =
      branch?.restaurant_name || branch?.name || context.businessName;
    const branchLabel = body.role === "OWNER" ? "All branches" : `${restaurantName}${branch?.city ? ` — ${branch.city}` : ""}`;
    const delivery = await sendStaffInvitationEmail({
      recipient: data.email,
      restaurantName,
      branchLabel,
      branchAddress: branch?.formatted_address || branch?.address,
      role: body.role,
      permissionCount: body.role === "OWNER" ? 0 : body.permissions.length,
      acceptUrl: acceptUrl.toString(),
      logoUrl: brandingResult.data?.logo_url,
      primaryColor: brandingResult.data?.primary_color,
    });
    if (isPendingInvitation)
      await admin.rpc("set_staff_invitation_delivery", {
        p_id: data.id,
        p_status: delivery.status,
      });
    if (delivery.status !== "SENT" && delivery.status !== "SUPPRESSED")
      return NextResponse.json(
        {
          ok: false,
          pending: true,
          error:
            "Staff access was saved, but the invitation email could not be sent. Check SMTP settings and use Resend invite.",
        },
        { status: 502 },
      );
    return NextResponse.json({
      ok: true,
      pending: isPendingInvitation,
      message: delivery.status === "SUPPRESSED"
        ? "Synthetic QA invitation saved without external email delivery."
        : `Secure restaurant access email sent to ${data.email}.${isPendingInvitation ? " Access will activate after they use the link." : " Their assigned access is already active."}`,
    });
  } catch (error) {
    if (isPendingInvitation)
      await admin.rpc("set_staff_invitation_delivery", {
        p_id: data.id,
        p_status: "FAILED",
      });
    return NextResponse.json(
      {
        ok: false,
        pending: true,
        error:
          error instanceof Error && error.message.includes("active restaurant")
            ? error.message
            : "Staff access was saved, but its secure email link could not be delivered. Check SMTP and resend.",
      },
      { status: 502 },
    );
  }
}
