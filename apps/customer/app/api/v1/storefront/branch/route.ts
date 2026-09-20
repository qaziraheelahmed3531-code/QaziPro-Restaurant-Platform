import { NextRequest, NextResponse } from "next/server"

import { getStorefrontSnapshot } from "@/lib/storefront/server"

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function GET(request: NextRequest) {
  const branchId = request.nextUrl.searchParams.get("branch") ?? ""
  if (!uuid(branchId)) return NextResponse.json({ ok:false,error:{code:"INVALID_BRANCH",message:"Choose a valid branch."} },{status:400})
  const storefront = await getStorefrontSnapshot({ branchId })
  if (!storefront.business.id || storefront.branch.id !== branchId) return NextResponse.json({ ok:false,error:{code:"BRANCH_NOT_AVAILABLE",message:"That branch is not available for this restaurant."} },{status:404})
  const response = NextResponse.redirect(new URL("/", request.url), 303)
  response.cookies.set(`qp-branch-${storefront.business.id}`, branchId, { httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*180 })
  return response
}
