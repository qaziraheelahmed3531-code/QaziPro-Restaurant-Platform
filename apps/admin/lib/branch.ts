import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getSelectedBranch(
  supabase: SupabaseClient,
  businessId: string,
  assignedBranchId?: string | null,
) {
  let allowedBranchIds = assignedBranchId ? [assignedBranchId] : [];
  let isOwner = false;
  if (!assignedBranchId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: membership } = await supabase
        .from("staff_memberships")
        .select("id,branch_id,role,staff_membership_branches(branch_id)")
        .eq("business_id", businessId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      isOwner = membership?.role === "OWNER";
      if (membership && !isOwner) {
        const mapped=(membership.staff_membership_branches??[]).map((row:{branch_id:string})=>String(row.branch_id));
        allowedBranchIds=Array.from(new Set([...mapped,...(membership.branch_id?[String(membership.branch_id)]:[])]));
      }
    }
  }
  const requested = (await cookies()).get("ip-admin-branch")?.value;
  if (requested === "all" && isOwner) return null;
  let query = supabase
    .from("branches")
    .select(
      "id,name,restaurant_name,city,location_revision,address,formatted_address,phone",
    )
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (!isOwner && allowedBranchIds.length) query = query.in("id",allowedBranchIds);
  else if (!isOwner) return null;
  if (requested && requested!=="all") query = query.eq("id", requested);
  else if (!isOwner && allowedBranchIds.length===1) query=query.eq("id",allowedBranchIds[0]);
  else return null;
  const { data } = await query.limit(1).maybeSingle();
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
  return null;
}
