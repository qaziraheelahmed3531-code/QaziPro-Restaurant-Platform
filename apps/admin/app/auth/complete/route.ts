import { NextResponse } from "next/server"
import { accessReasonQuery, adminHome, getAdminAccessResolution, getAdminContext } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  await (await createClient()).rpc("claim_staff_invitations")
  const [context,access] = await Promise.all([getAdminContext(),getAdminAccessResolution()])
  const response = NextResponse.redirect(new URL(context ? adminHome(context) : `/login?error=${accessReasonQuery(access.reason)}`, request.url))
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
