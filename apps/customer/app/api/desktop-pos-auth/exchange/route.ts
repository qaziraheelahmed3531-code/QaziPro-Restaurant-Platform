import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!accessToken)
    return NextResponse.json(
      { error: "Google session is missing." },
      { status: 401 },
    );

  try {
    const admin = createAdminClient();
    const userResult = await admin.auth.getUser(accessToken);
    const email = userResult.data.user?.email?.trim().toLowerCase();
    if (userResult.error || !email)
      return NextResponse.json(
        { error: "Google session is invalid or expired." },
        { status: 401 },
      );

    const memberships=await admin.from("staff_memberships").select("business_id,role,permissions_customized,staff_membership_permissions(permission_code)").eq("user_id",userResult.data.user!.id).eq("is_active",true)
    if(memberships.error)throw memberships.error
    let allowed=false
    for(const membership of memberships.data??[]){
      const rolePermission=membership.role==="OWNER"?true:membership.permissions_customized
        ? (membership.staff_membership_permissions??[]).some(item=>item.permission_code==="desktop_pos.use")
        : Boolean((await admin.from("admin_role_permissions").select("permission_code").eq("role",membership.role).eq("permission_code","desktop_pos.use").maybeSingle()).data)
      if(!rolePermission)continue
      const entitlement=await admin.rpc("resolve_runtime_entitlement",{p_business_id:membership.business_id,p_branch_id:null,p_capability_key:"pos.desktop"})
      if(!entitlement.error&&(entitlement.data as {enabled?:boolean}|null)?.enabled){allowed=true;break}
    }
    if(!allowed)return NextResponse.json({error:"This account does not have an enabled Desktop POS service."},{status:403})

    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash)
      throw (
        generated.error ??
        new Error("One-time Desktop POS session could not be created.")
      );

    return NextResponse.json(
      { tokenHash },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error(
      "[desktop-pos-auth-exchange] failed",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Secure Desktop POS sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }
}
