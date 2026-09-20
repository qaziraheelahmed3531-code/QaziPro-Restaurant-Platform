import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSelectedBranch(
  supabase: SupabaseClient,
  businessId: string,
  assignedBranchId?: string | null,
) {
  let effectiveAssignedBranchId = assignedBranchId ?? null;
  if (!effectiveAssignedBranchId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase
        .from("staff_memberships")
        .select("branch_id,role")
        .eq("business_id", businessId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (membership?.role !== "OWNER" && membership?.branch_id)
        effectiveAssignedBranchId = String(membership.branch_id);
    }
  }
  const requested = (await cookies()).get("ip-admin-branch")?.value;
  if (requested === "all" && !effectiveAssignedBranchId) return null;
  let query = supabase
    .from("branches")
    .select(
      "id,name,restaurant_name,city,location_revision,address,formatted_address,phone",
    )
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (effectiveAssignedBranchId)
    query = query.eq("id", effectiveAssignedBranchId);
  else if (requested) query = query.eq("id", requested);
  const { data } = await query.order("sort_order").limit(1).maybeSingle();
  if (data)
    return data as {
      id: string;
      name: string;
      restaurant_name?: string | null;
      city: string;
      location_revision?: number;
      address?: string | null;
      formatted_address?: string | null;
      phone?: string | null;
    };
  let fallbackQuery = supabase
    .from("branches")
    .select(
      "id,name,restaurant_name,city,location_revision,address,formatted_address,phone",
    )
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (effectiveAssignedBranchId)
    fallbackQuery = fallbackQuery.eq("id", effectiveAssignedBranchId);
  const { data: fallback } = await fallbackQuery
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  return fallback as {
    id: string;
    name: string;
    restaurant_name?: string | null;
    city: string;
    location_revision?: number;
    address?: string | null;
    formatted_address?: string | null;
    phone?: string | null;
  } | null;
}
