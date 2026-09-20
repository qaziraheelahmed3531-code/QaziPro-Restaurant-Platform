import { NextResponse } from "next/server"
import { adminHome, getAdminContext } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  await (await createClient()).rpc("claim_staff_invitations")
  const context = await getAdminContext()
  const response = NextResponse.redirect(new URL(context ? adminHome(context) : "/login?error=unauthorized", request.url))
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
