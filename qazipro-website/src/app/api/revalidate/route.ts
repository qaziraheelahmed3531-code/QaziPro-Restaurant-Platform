import { timingSafeEqual } from "node:crypto"
import { revalidatePath } from "next/cache"
import { NextRequest,NextResponse } from "next/server"

export async function POST(request:NextRequest) {
  const expected=process.env.CMS_REVALIDATE_SECRET ?? ""
  const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"") ?? ""
  if (!expected || expected.length!==supplied.length || !timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))) return NextResponse.json({ok:false},{status:401})
  revalidatePath("/","layout")
  revalidatePath("/about")
  revalidatePath("/client-onboarding")
  return NextResponse.json({ok:true,revalidatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}})
}
