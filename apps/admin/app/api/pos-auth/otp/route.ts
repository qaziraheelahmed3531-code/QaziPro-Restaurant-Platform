import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendPosLoginOtp } from "@/lib/email/pos-login-otp";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: cors });
const normalizedEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Secure POS login service is not configured.");
  return {
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    key,
  };
}

const digest = (key: string, id: string, email: string, code: string) =>
  createHmac("sha256", key).update(`${id}:${email}:${code}`).digest("hex");

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const action = body?.action,
    email = normalizedEmail(body?.email);
  if (!validEmail(email) || !["request", "verify"].includes(action))
    return json({ error: "Enter a valid invited staff email." }, 400);
  try {
    const { client: admin, key } = serviceClient();
    if (action === "request") {
      let authUserId: string | null = null;
      for (let page = 1; page <= 5 && !authUserId; page++) {
        const users = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (users.error) throw users.error;
        authUserId =
          users.data.users.find((user) => user.email?.toLowerCase() === email)
            ?.id ?? null;
        if (users.data.users.length < 200) break;
      }
      const [membership, invitation] = await Promise.all([
        authUserId
          ? admin
              .from("staff_memberships")
              .select(
                "id,business_id,role,permissions_customized,staff_membership_permissions(permission_code)",
              )
              .eq("user_id", authUserId)
              .eq("is_active", true)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from("staff_invitations")
          .select("business_id,role,permissions")
          .eq("email", email)
          .eq("is_active", true)
          .in("status", ["PENDING", "ACTIVATED"]),
      ]);
      if (membership.error || invitation.error)
        throw membership.error ?? invitation.error;
      const memberships = membership.data ?? [];
      const defaultRoles = [
        ...new Set(
          memberships
            .filter(
              (row) => !row.permissions_customized && row.role !== "OWNER",
            )
            .map((row) => row.role),
        ),
      ];
      const defaults = defaultRoles.length
        ? await admin
            .from("admin_role_permissions")
            .select("role,permission_code")
            .in("role", defaultRoles)
        : { data: [], error: null };
      if (defaults.error) throw defaults.error;
      const activeMembership = memberships.find(
        (row) =>
          row.role === "OWNER" ||
          (row.permissions_customized
            ? row.staff_membership_permissions?.some(
                (permission) =>
                  permission.permission_code === "desktop_pos.use",
              )
            : defaults.data?.some(
                (permission) =>
                  permission.role === row.role &&
                  permission.permission_code === "desktop_pos.use",
              )),
      );
      const activeInvitation = (invitation.data ?? []).find(
        (row) =>
          row.role === "OWNER" ||
          (Array.isArray(row.permissions) &&
            row.permissions.includes("desktop_pos.use")),
      );
      const businessId =
        activeMembership?.business_id ?? activeInvitation?.business_id;
      if (!authUserId || !businessId)
        return json({
          ok: true,
          challengeId: randomUUID(),
          message: "If this email has POS access, a login code has been sent.",
        });
      const entitlement = await admin.rpc("resolve_runtime_entitlement", {
        p_business_id: businessId,
        p_branch_id: null,
        p_capability_key: "pos.desktop",
      });
      if (entitlement.error || !(entitlement.data as { enabled?: boolean } | null)?.enabled)
        return json({ error: "Desktop POS is not enabled for this restaurant." }, 403);
      const recent = await admin
        .from("desktop_pos_login_otps")
        .select("created_at")
        .eq("email", email)
        .gte("created_at", new Date(Date.now() - 45_000).toISOString())
        .limit(1);
      if (recent.error) throw recent.error;
      if (recent.data?.length)
        return json(
          { error: "Please wait 45 seconds before requesting another code." },
          429,
        );
      const id = randomUUID(),
        code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const [business, branding] = await Promise.all([
        admin.from("businesses").select("name").eq("id", businessId).single(),
        admin
          .from("business_branding")
          .select("display_name,logo_url,primary_color")
          .eq("business_id", businessId)
          .maybeSingle(),
      ]);
      if (business.error) throw business.error;
      const saved = await admin.from("desktop_pos_login_otps").insert({
        id,
        business_id: businessId,
        email,
        code_hash: digest(key, id, email, code),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (saved.error) throw saved.error;
      const delivery = await sendPosLoginOtp({
        recipient: email,
        code,
        restaurantName:
          branding.data?.display_name || business.data.name || "Restaurant",
        logoUrl: branding.data?.logo_url,
        primaryColor: branding.data?.primary_color,
      });
      if (delivery.status !== "SENT") {
        await admin.from("desktop_pos_login_otps").delete().eq("id", id);
        return json(
          {
            error:
              "Login code could not be emailed. Check the Admin SMTP configuration.",
          },
          503,
        );
      }
      return json({
        ok: true,
        challengeId: id,
        message: "A 6-digit login code was sent to the invited email.",
      });
    }

    const challengeId =
        typeof body?.challengeId === "string" ? body.challengeId : "",
      code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code))
      return json(
        { error: "Enter the valid 6-digit code from your email." },
        400,
      );
    const row = await admin
      .from("desktop_pos_login_otps")
      .select("id,code_hash,attempts,expires_at,consumed_at")
      .eq("id", challengeId)
      .eq("email", email)
      .maybeSingle();
    if (row.error) throw row.error;
    if (
      !row.data ||
      row.data.consumed_at ||
      row.data.attempts >= 5 ||
      new Date(row.data.expires_at).getTime() < Date.now()
    )
      return json(
        { error: "This login code is invalid or expired. Request a new code." },
        400,
      );
    const expected = Buffer.from(row.data.code_hash, "hex"),
      actual = Buffer.from(digest(key, challengeId, email, code), "hex");
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      await admin
        .from("desktop_pos_login_otps")
        .update({ attempts: row.data.attempts + 1 })
        .eq("id", challengeId)
        .is("consumed_at", null);
      return json({ error: "The login code is incorrect." }, 400);
    }
    const consumed = await admin
      .from("desktop_pos_login_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challengeId)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumed.error || !consumed.data)
      return json({ error: "This login code has already been used." }, 400);
    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash)
      throw (
        generated.error ??
        new Error("Secure login session could not be created.")
      );
    return json({ ok: true, tokenHash });
  } catch (error) {
    console.error("[desktop-pos-otp] request failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { error: "Secure POS email login is temporarily unavailable." },
      503,
    );
  }
}
