import type { NextRequest } from "next/server"
import { updatePortalSession } from "@/lib/supabase/proxy"

export function proxy(request: NextRequest) {
  return updatePortalSession(request)
}

export const config = {
  matcher: ["/client-portal/:path*", "/api/client-portal/:path*"],
}
