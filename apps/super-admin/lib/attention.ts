import "server-only"
import { getPlatformContext } from "./auth"
import { createClient } from "./supabase/server"

export type AttentionItem = { key: string; title: string; detail: string; href: string; read: boolean }
export async function getAttention() {
  const context = await getPlatformContext()
  if (!context) return null
  const client = await createClient()
  const [incidents, deployments] = await Promise.all([
    context.permissions.includes("incidents.manage") ? client.from("platform_incidents").select("id,title,status,last_seen_at").not("status","in","(RESOLVED,CLOSED)").order("last_seen_at",{ascending:false}).limit(21) : null,
    context.permissions.includes("deployments.manage") ? client.from("deployment_records").select("id,component,environment,created_at").eq("status","FAILED").order("created_at",{ascending:false}).limit(21) : null,
  ])
  if (incidents?.error || deployments?.error) throw Error("Attention unavailable")
  const items: AttentionItem[] = [
    ...(incidents?.data ?? []).slice(0,20).map(row => ({key:`incident:${row.id}:${row.last_seen_at}`,title:String(row.title),detail:`Health · ${row.status}`,href:"/health",read:false})),
    ...(deployments?.data ?? []).slice(0,20).map(row => ({key:`deployment:${row.id}:${row.created_at}`,title:`${String(row.component).replaceAll('_',' ')} deployment failed`,detail:String(row.environment),href:"/deployments",read:false})),
  ]
  if (items.length) {
    const receipts = await client.from("platform_attention_receipts").select("event_key").eq("user_id",context.userId).in("event_key",items.map(item=>item.key))
    if (receipts.error) throw Error("Read status unavailable")
    const read = new Set((receipts.data ?? []).map(row=>row.event_key))
    items.forEach(item=>{ item.read=read.has(item.key) })
  }
  return {items,hasMore:(incidents?.data?.length ?? 0)>20 || (deployments?.data?.length ?? 0)>20}
}
