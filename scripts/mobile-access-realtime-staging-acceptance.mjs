import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGING_SUPABASE_URL?.trim();
const publicKey = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY?.trim();
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY?.trim();
const password = process.env.STAGING_QA_PASSWORD?.trim();
if (
  !url ||
  !publicKey ||
  !serviceKey ||
  !password ||
  !/staging/i.test(process.env.STAGING_ENVIRONMENT ?? "") ||
  !url.includes("jzisqjvroxodvmqxzsob")
)
  throw new Error("Explicit QaziPro staging-only environment is required.");

const businessA = "a0000000-0000-4000-8000-000000000001";
const businessB = "b0000000-0000-4000-8000-000000000001";
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const staff = createClient(url, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const check = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

let channel;
try {
  check(
    await staff.auth.signInWithPassword({
      email: "a-owner@staging.qazipro.invalid",
      password,
    }),
    "Sign in restaurant owner",
  );

  const visible = check(
    await staff
      .from("service_entitlements")
      .select("business_id,capability_key,enabled")
      .in("business_id", [businessA, businessB]),
    "Read staff entitlements",
  );
  assert.ok(visible.length > 0, "Own entitlement rows should be visible");
  assert.ok(
    visible.every((row) => row.business_id === businessA),
    "Another restaurant's entitlements leaked through RLS",
  );

  const eventPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime entitlement event timed out")),
      15_000,
    );
    channel = staff
      .channel(`mobile-access-acceptance-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "service_entitlements",
          filter: `business_id=eq.${businessA}`,
        },
        (payload) => {
          const row = payload.new;
          if (
            row.capability_key === "mobile.android" &&
            row.enabled === false
          ) {
            clearTimeout(timer);
            resolve(row);
          }
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(error ?? new Error(`Realtime channel ${status}`));
        }
      });
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Realtime subscription did not become ready")),
      10_000,
    );
    const poll = setInterval(() => {
      if (channel?.state === "joined") {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    }, 50);
  });

  check(
    await admin
      .from("service_entitlements")
      .update({ enabled: false, notes: "Mobile realtime staging acceptance" })
      .eq("business_id", businessA)
      .eq("capability_key", "mobile.android"),
    "Revoke mobile entitlement",
  );
  await eventPromise;

  console.log(
    JSON.stringify({
      ok: true,
      rlsOwnBusiness: "PASS",
      crossTenantDenied: "PASS",
      entitlementRealtime: "PASS",
    }),
  );
} finally {
  if (channel) await staff.removeChannel(channel).catch(() => undefined);
  try {
    await admin
      .from("service_entitlements")
      .update({ enabled: true, notes: "Restored after mobile realtime acceptance" })
      .eq("business_id", businessA)
      .eq("capability_key", "mobile.android");
  } catch {
    // The outer fixture cleanup remains authoritative for disposable data.
  }
  await staff.auth.signOut().catch(() => undefined);
}
