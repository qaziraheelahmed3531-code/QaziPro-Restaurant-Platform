import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { fallbackOnboardingDefinition, onboardingDefinitionSchema, type OnboardingDefinition } from "@/lib/onboarding"

let cachedClient: SupabaseClient | null | undefined

export function platformServerClient() {
  if (cachedClient !== undefined) return cachedClient
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const projectRef = process.env.SUPABASE_PROJECT_REF || (process.env.APP_ENVIRONMENT === "staging" ? process.env.STAGING_SUPABASE_PROJECT_REF : undefined)
  if (!url || !key || !projectRef) return cachedClient = null
  try {
    if (new URL(url).hostname !== `${projectRef}.supabase.co`) return cachedClient = null
  } catch { return cachedClient = null }
  return cachedClient = createClient(url,key,{ auth:{ persistSession:false,autoRefreshToken:false,detectSessionInUrl:false } })
}

export async function getPublishedDocument<T extends Record<string,unknown>>(key: string, fallback: T): Promise<T> {
  const client = platformServerClient()
  if (!client) return fallback
  const result = await client.from("platform_site_documents").select("published_data").eq("key",key).maybeSingle()
  if (result.error || !result.data?.published_data || typeof result.data.published_data !== "object") return fallback
  return { ...fallback, ...(result.data.published_data as T) }
}

export async function getPublishedTeam(): Promise<Array<Record<string,unknown> & { id:string }>> {
  const client = platformServerClient()
  if (!client) return []
  const result = await client.from("platform_site_team_members").select("id,published_snapshot,display_order").eq("active",true).not("published_snapshot","is",null).order("display_order")
  if (result.error) return []
  return (result.data ?? []).flatMap((row) => row.published_snapshot && typeof row.published_snapshot === "object" ? [{ id: String(row.id), ...(row.published_snapshot as Record<string,unknown>) }] : [])
}

export async function getPublishedOnboardingForm(): Promise<{ id: string | null; version: number; definition: OnboardingDefinition; signatureRequired: boolean }> {
  const client = platformServerClient()
  if (!client) return { id:null,version:0,definition:fallbackOnboardingDefinition,signatureRequired:true }
  const result = await client.from("platform_onboarding_forms").select("id,published_version,published_definition,signature_required").eq("slug","client-onboarding").eq("is_active",true).maybeSingle()
  const parsed = onboardingDefinitionSchema.safeParse(result.data?.published_definition)
  if (result.error || !result.data || !parsed.success) return { id:null,version:0,definition:fallbackOnboardingDefinition,signatureRequired:true }
  return { id:String(result.data.id),version:Number(result.data.published_version),definition:parsed.data,signatureRequired:Boolean(result.data.signature_required) }
}
