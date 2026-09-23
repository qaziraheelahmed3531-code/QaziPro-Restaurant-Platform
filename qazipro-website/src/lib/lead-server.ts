import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { LeadInput } from "@/lib/lead-schema";

function stagingClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ref = process.env.SUPABASE_PROJECT_REF
    || (process.env.APP_ENVIRONMENT === "staging" ? process.env.STAGING_SUPABASE_PROJECT_REF : undefined);
  if (process.env.PUBLIC_LEADS_ENABLED !== "1" || !url || !key || !ref) return null;
  try {
    if (new URL(url).hostname !== `${ref}.supabase.co`) return null;
  } catch { return null; }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function saveLead(input: LeadInput, clientAddress: string) {
  const client = stagingClient();
  if (!client) {
    console.error(JSON.stringify({ level: "error", event: "public_lead_configuration_unavailable", environment: process.env.APP_ENVIRONMENT ?? "unknown" }));
    return { ok: false as const, status: 503, message: "Requests are temporarily unavailable. Please contact us by email or WhatsApp." };
  }
  const rateKey = createHash("sha256").update(`qazipro-public-lead:${process.env.SUPABASE_SERVICE_ROLE_KEY}:${clientAddress}`).digest("hex");
  const { data: allowed, error: limitError } = await client.rpc("consume_api_rate_limit", { p_key_hash: rateKey, p_limit: 5, p_window_seconds: 900 });
  if (limitError) {
    console.error(JSON.stringify({ level: "error", event: "public_lead_rate_limit_failed", code: limitError.code || "unknown", message: String(limitError.message || "request failed").slice(0, 160) }));
    return { ok: false as const, status: 503, message: "Requests are temporarily unavailable. Please try again later." };
  }
  if (!allowed) return { ok: false as const, status: 429, message: "Too many requests. Please try again in a few minutes." };

  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const existing = await client.from("platform_demo_requests").select("id").eq("email", input.email).eq("lead_kind", input.kind).gte("created_at", since).limit(1);
  if (existing.error) {
    console.error(JSON.stringify({ level: "error", event: "public_lead_duplicate_check_failed", code: existing.error.code ?? "unknown" }));
    return { ok: false as const, status: 503, message: "Your request could not be saved. Please try again." };
  }
  if (existing.data?.length) return { ok: true as const, duplicate: true };

  const { error } = await client.from("platform_demo_requests").insert({
    full_name: input.fullName,
    business_name: input.businessName,
    email: input.email,
    phone: input.phone,
    branch_band: input.branchBand,
    source: "QAZIPRO_WEBSITE",
    lead_kind: input.kind,
    services: input.services,
    message: input.message,
    preferred_contact_time: input.preferredContactTime,
    preferred_contact_method: input.preferredContactMethod,
    budget_range: input.budgetRange,
    source_page: input.sourcePage,
    utm_source: input.utmSource,
    utm_medium: input.utmMedium,
    utm_campaign: input.utmCampaign,
  });
  if (error) {
    console.error(JSON.stringify({ level: "error", event: "public_lead_insert_failed", code: error.code ?? "unknown" }));
    return { ok: false as const, status: 503, message: "Your request could not be saved. Please try again." };
  }
  return { ok: true as const, duplicate: false };
}

export async function notifyLead(input: LeadInput) {
  const endpoint = process.env.LEAD_NOTIFICATION_WEBHOOK_URL;
  const secret = process.env.LEAD_NOTIFICATION_WEBHOOK_SECRET;
  if (!endpoint || !secret) return;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify({ recipient: "qazipro3531@gmail.com", kind: input.kind, businessName: input.businessName, sourcePage: input.sourcePage }), signal: AbortSignal.timeout(3000) });
  } catch { /* Database save is authoritative; notification is optional. */ }
}
