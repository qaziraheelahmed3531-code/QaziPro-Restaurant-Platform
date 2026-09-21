import "server-only"

import { createHash } from "node:crypto"
import { createPlatformAdminClient } from "@/lib/supabase/admin"

type Row = Record<string, unknown>

export async function getPublicAgreement(token: string) {
  if (token.length < 32) return null
  const admin = createPlatformAdminClient()
  if (!admin) return null
  const hash = createHash("sha256").update(token).digest("hex")
  const { data } = await admin.from("onboarding_documents")
    .select("id,version,status,legal_text,document_data,share_expires_at,onboarding_id,restaurant_onboarding(owner_name,owner_email,businesses(name))")
    .eq("share_token_hash", hash).maybeSingle()
  if (!data || !["SENT", "CLIENT_REVIEW", "CORRECTION_REQUESTED"].includes(String(data.status)) || !data.share_expires_at || Date.parse(data.share_expires_at) <= Date.now()) return null
  const onboarding = data.restaurant_onboarding as unknown as Row | null
  const business = onboarding?.businesses as Row | null
  return {
    id: String(data.id), version: String(data.version), legalText: String(data.legal_text), details: data.document_data as Row,
    ownerName: String(onboarding?.owner_name ?? "Client"), ownerEmail: String(onboarding?.owner_email ?? ""), businessName: String(business?.name ?? "Restaurant"), expiresAt: String(data.share_expires_at),
  }
}
