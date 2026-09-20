import { createClient } from "@supabase/supabase-js"

const url = process.env.STAGING_SUPABASE_URL?.trim()
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key || !/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "")) throw new Error("Explicit staging credentials and STAGING_ENVIRONMENT=staging are required.")
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const emails = new Set(["a-owner@staging.qazipro.invalid", "a1-staff@staging.qazipro.invalid", "a-multi@staging.qazipro.invalid", "b-owner@staging.qazipro.invalid", "b1-staff@staging.qazipro.invalid"])
const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listed.error) throw listed.error
for (const user of listed.data.users) if (user.email && emails.has(user.email.toLowerCase())) await supabase.auth.admin.deleteUser(user.id)
for (const id of ["a0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000001"]) {
  const result = await supabase.from("businesses").delete().eq("id", id)
  if (result.error) throw result.error
}
console.log(JSON.stringify({ ok: true, removed: "STAGING QA fixtures" }))
