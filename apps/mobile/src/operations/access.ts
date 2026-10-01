import { Platform } from "react-native";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type {
  OperationsAccess,
  OperationsBranch,
  OperationsRole,
} from "./types";

const roles: OperationsRole[] = [
  "OWNER",
  "MANAGER",
  "CASHIER",
  "KITCHEN",
  "WAITER",
  "RIDER",
  "STAFF",
];
const capabilityKeys = [
  "admin.restaurant",
  "waiter",
  "rider",
  "mobile.android",
  "mobile.ios",
];

export function roleSurface(role: OperationsRole) {
  if (role === "WAITER") return "waiter" as const;
  if (role === "RIDER") return "rider" as const;
  if (role === "OWNER" || role === "MANAGER") return "admin" as const;
  return "unsupported" as const;
}

export function can(access: OperationsAccess, permission: string) {
  return (
    access.role === "OWNER" ||
    access.permissions.includes("*") ||
    access.permissions.includes(permission)
  );
}

export async function resolveOperationsAccess(
  db: SupabaseClient,
  session: Session,
): Promise<OperationsAccess> {
  const accessResult = await db.rpc("resolve_restaurant_admin_access", {
    p_business_id: null,
  });
  const raw = accessResult.data as Record<string, unknown> | null;
  if (accessResult.error || !raw || raw.allowed !== true)
    throw new Error("Your restaurant staff access is unavailable.");
  const businessId = String(raw.businessId ?? ""),
    membershipId = String(raw.membershipId ?? "");
  const role = String(raw.role ?? "") as OperationsRole;
  if (!businessId || !membershipId || !roles.includes(role))
    throw new Error("Your staff membership is incomplete.");
  const [membership, branches, permissions, branding, entitlements] =
    await Promise.all([
      db
        .from("staff_memberships")
        .select(
          "id,business_id,branch_id,role,is_active,staff_membership_branches(branch_id)",
        )
        .eq("id", membershipId)
        .eq("user_id", session.user.id)
        .eq("business_id", businessId)
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("branches")
        .select(
          "id,name,restaurant_name,city,formatted_address,phone,delivery_enabled,pickup_enabled",
        )
        .eq("business_id", businessId)
        .eq("is_active", true)
        .order("sort_order"),
      role === "OWNER"
        ? Promise.resolve({ data: ["*"], error: null })
        : db.rpc("effective_permissions", { p_business_id: businessId }),
      db
        .from("business_branding")
        .select("display_name,logo_url,primary_color")
        .eq("business_id", businessId)
        .maybeSingle(),
      db.rpc("resolve_runtime_entitlements", {
        p_business_id: businessId,
        p_branch_id: null,
        p_capability_keys: capabilityKeys,
      }),
    ]);
  if (
    membership.error ||
    !membership.data ||
    branches.error ||
    permissions.error ||
    entitlements.error
  )
    throw new Error("Restaurant authorization could not be verified.");
  const allBranches = (branches.data ?? []) as OperationsBranch[];
  const mapped = (membership.data.staff_membership_branches ?? []).map(
    (row: { branch_id: string }) => String(row.branch_id),
  );
  const legacy = membership.data.branch_id
    ? [String(membership.data.branch_id)]
    : [];
  const allowed =
    role === "OWNER"
      ? allBranches
      : allBranches.filter((branch) =>
          new Set([...mapped, ...legacy]).has(branch.id),
        );
  if (!allowed.length)
    throw new Error("No active restaurant is assigned to this account.");
  const capabilities = Object.fromEntries(
    Object.entries(
      (entitlements.data ?? {}) as Record<string, { enabled?: boolean }>,
    ).map(([key, value]) => [key, Boolean(value?.enabled)]),
  );
  const platformCapability =
    Platform.OS === "ios" ? "mobile.ios" : "mobile.android";
  if (!capabilities[platformCapability])
    throw new Error("Mobile operations are not enabled for this restaurant.");
  const surface = roleSurface(role);
  if (surface === "waiter" && !capabilities.waiter)
    throw new Error("Waiter access is not enabled for this restaurant.");
  if (surface === "rider" && !capabilities.rider)
    throw new Error("Rider access is not enabled for this restaurant.");
  if (surface === "admin" && !capabilities["admin.restaurant"])
    throw new Error("Restaurant Admin access is not enabled.");
  return {
    userId: session.user.id,
    email: session.user.email ?? "Staff account",
    businessId,
    businessName: String(
      branding.data?.display_name ?? raw.businessName ?? "Restaurant",
    ),
    role,
    permissions: (permissions.data ?? []).map(String),
    capabilities,
    branches: allowed,
    primaryColor: /^#[0-9a-f]{6}$/i.test(branding.data?.primary_color ?? "")
      ? branding.data!.primary_color
      : "#b42318",
    logoUrl: branding.data?.logo_url ?? null,
  };
}
