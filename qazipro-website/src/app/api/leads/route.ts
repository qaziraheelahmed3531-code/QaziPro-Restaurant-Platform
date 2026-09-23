import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { leadSchema } from "@/lib/lead-schema";
import { notifyLead, saveLead } from "@/lib/lead-server";

export const runtime = "nodejs";
const reply = (status: number, message: string, requestId: string) => NextResponse.json({ ok: status < 400, message, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(403, "This request could not be accepted.", requestId);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply(415, "Please submit the form again.", requestId);
  try {
    const raw = await request.text();
    if (raw.length > 8192) return reply(413, "The request is too large.", requestId);
    const result = leadSchema.safeParse(JSON.parse(raw));
    if (!result.success) return reply(400, "Please check the form fields and try again.", requestId);
    if (result.data.website) return reply(201, "Request received.", requestId);
    if (result.data.startedAt && Date.now() - result.data.startedAt < 800) return reply(400, "Please review the form and try again.", requestId);
    const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
    const saved = await saveLead(result.data, clientAddress);
    if (!saved.ok) return reply(saved.status, saved.message, requestId);
    if (!saved.duplicate) void notifyLead(result.data);
    return reply(201, "Request received. The QaziPro team will be in touch.", requestId);
  } catch { return reply(400, "Please check the form fields and try again.", requestId); }
}
