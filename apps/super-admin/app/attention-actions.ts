"use server"
import { getPlatformContext } from "@/lib/auth"
import { getAttention } from "@/lib/attention"
import { createClient } from "@/lib/supabase/server"
export async function markAttentionRead(key:string):Promise<{error?:string}> {
  const context=await getPlatformContext()
  if(!context) return {error:"Your session has expired. Sign in again."}
  if(typeof key!=="string" || key.length>200) return {error:"Invalid notification."}
  try {
    const current=await getAttention()
    if(!current?.items.some(item=>item.key===key)) return {error:"This notification changed. Refresh the list."}
    const client=await createClient()
    const result=await client.from("platform_attention_receipts").insert({user_id:context.userId,event_key:key})
    if(result.error && result.error.code!=="23505") return {error:"Could not mark this notification as read. Try again."}
    return {}
  } catch { return {error:"Could not confirm the change. Refresh the list before retrying."} }
}
