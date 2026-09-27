import { getAttention } from "@/lib/attention"
export async function GET() {
  const headers = { "Cache-Control":"private, no-store" }
  try {
    const result = await getAttention()
    return Response.json(result ?? {error:"Sign in with an authorized platform account."},{status:result?200:401,headers})
  } catch { return Response.json({error:"Notifications are temporarily unavailable."},{status:503,headers}) }
}
