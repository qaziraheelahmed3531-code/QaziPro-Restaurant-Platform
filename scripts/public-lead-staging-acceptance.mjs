import { createClient } from "@supabase/supabase-js"

const baseUrl = (process.env.PUBLIC_SITE_BASE_URL ?? "http://127.0.0.1:3003").replace(/\/$/, "")
const supabaseUrl = process.env.STAGING_SUPABASE_URL?.trim()
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!supabaseUrl || !serviceKey || !/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "")) {
  throw new Error("Explicit staging credentials and STAGING_ENVIRONMENT=staging are required.")
}

const marker = `final-gate-${Date.now()}`
const client = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const payload = (index = 0) => ({
  kind: "DEMO",
  fullName: "QaziPro Staging QA",
  businessName: `Final gate ${index}`,
  email: `${marker}-${index}@staging.qazipro.invalid`,
  phone: "+92 300 0000000",
  branchBand: "ONE",
  services: ["RESTAURANT_POS", "ONLINE_ORDERING"],
  message: "Disposable staging acceptance request",
  preferredContactTime: "Afternoon",
  preferredContactMethod: "WHATSAPP",
  budgetRange: "",
  sourcePage: "/book-a-demo",
  website: "",
  startedAt: Date.now() - 2_000,
  utmSource: "staging-qa",
  utmMedium: "acceptance",
  utmCampaign: "final-gate",
})

async function post(body, ip, origin = baseUrl) {
  return fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

try {
  const invalid = await post({ ...payload(), email: "invalid" }, "198.51.100.201")
  if (invalid.status !== 400) throw new Error(`Invalid lead was not rejected (${invalid.status}).`)

  const wrongOrigin = await post(payload(), "198.51.100.202", "https://untrusted.example")
  if (wrongOrigin.status !== 403) throw new Error(`Cross-origin lead was not rejected (${wrongOrigin.status}).`)

  const first = await post(payload(), "198.51.100.203")
  const duplicate = await post(payload(), "198.51.100.203")
  if (first.status !== 201 || duplicate.status !== 201) throw new Error("Valid/duplicate lead acceptance failed.")

  const honeypot = await post({ ...payload(1), website: "https://bot.example" }, "198.51.100.204")
  if (honeypot.status !== 201) throw new Error("Honeypot response did not remain opaque.")

  const { data: saved, error: savedError } = await client.from("platform_demo_requests").select("id,email").like("email", `${marker}-%`)
  if (savedError) throw savedError
  if (saved.length !== 1 || saved[0].email !== payload().email) throw new Error("Lead persistence, duplicate or honeypot behavior is incorrect.")

  const rateStatuses = []
  for (let index = 10; index < 16; index += 1) {
    rateStatuses.push((await post(payload(index), "198.51.100.205")).status)
  }
  if (!rateStatuses.slice(0, 5).every((status) => status === 201) || rateStatuses[5] !== 429) {
    throw new Error(`Lead rate limit failed: ${rateStatuses.join(",")}`)
  }

  console.log(JSON.stringify({ ok: true, assertions: 7, coverage: ["validation", "origin", "persistence", "duplicate", "honeypot", "rate-limit", "super-admin-source-table"] }))
} finally {
  const cleanup = await client.from("platform_demo_requests").delete().like("email", `${marker}-%`)
  if (cleanup.error) throw cleanup.error
}
