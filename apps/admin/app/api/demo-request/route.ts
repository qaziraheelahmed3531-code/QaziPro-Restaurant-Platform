import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const accepted = new Set(["ONE", "TWO_TO_FIVE", "SIX_PLUS"]);
const reply = (status: number, code: string, message: string, requestId: string) => NextResponse.json(
  { ok: status < 400, code, message, requestId },
  { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
);

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403, "FORBIDDEN_ORIGIN", "This request could not be accepted.", requestId);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, "INVALID_CONTENT_TYPE", "Please submit the form again.", requestId);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stagingRef = process.env.STAGING_SUPABASE_PROJECT_REF;
  let configuredHost = "";
  try { configuredHost = url ? new URL(url).hostname : ""; } catch { /* invalid configuration stays disabled */ }
  if (process.env.DEMO_LEADS_ENABLED !== "1" || !url || !key || !configuredHost ||
    (process.env.APP_ENVIRONMENT !== "production" && (!stagingRef || configuredHost !== `${stagingRef}.supabase.co`))) {
    return reply(503, "SERVICE_UNAVAILABLE", "Demo requests are temporarily unavailable.", requestId);
  }
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply(413, "REQUEST_TOO_LARGE", "The request is too large.", requestId);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const value = (field: string) => typeof body[field] === "string" ? String(body[field]).trim() : "";
    if (value("website")) return reply(201, "REQUEST_RECEIVED", "Thanks. We will be in touch.", requestId);
    const fullName = value("fullName");
    const businessName = value("businessName");
    const email = value("email").toLowerCase();
    const phone = value("phone");
    const branchBand = value("branchBand");
    if (fullName.length < 2 || fullName.length > 100 || businessName.length < 2 || businessName.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      !/^[+\d][\d\s()+.-]{6,34}$/.test(phone) || !accepted.has(branchBand)) {
      return reply(400, "INVALID_REQUEST", "Please check the form fields.", requestId);
    }
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const keyHash = createHash("sha256").update(`restaurant-demo:${ip}`).digest("hex");
    const { data: allowed, error: limitError } = await db.rpc("consume_api_rate_limit", { p_key_hash: keyHash, p_limit: 3, p_window_seconds: 600 });
    if (limitError) return reply(503, "RATE_LIMIT_UNAVAILABLE", "Please try again later.", requestId);
    if (!allowed) return reply(429, "RATE_LIMITED", "Too many requests. Please try again later.", requestId);
    const { error } = await db.from("platform_demo_requests").insert({ full_name: fullName, business_name: businessName, email, phone, branch_band: branchBand });
    if (error) return reply(503, "SAVE_FAILED", "Your request could not be saved. Please try again.", requestId);
    return reply(201, "REQUEST_RECEIVED", "Thanks. We will be in touch.", requestId);
  } catch {
    return reply(400, "INVALID_REQUEST", "Please check the form fields.", requestId);
  }
}
