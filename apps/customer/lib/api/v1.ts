import "server-only"

import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import type { StorefrontSnapshot } from "@/types"

export type ApiIdentity = { id: string; email: string | null }

function responseHeaders(requestId?: string) {
  return { "Cache-Control":"private, no-store", ...(requestId ? { "x-request-id":requestId } : {}) }
}

export function apiRequestId(request: NextRequest) {
  const supplied=request.headers.get("x-request-id")?.trim()
  return supplied&&/^[a-zA-Z0-9._:-]{8,100}$/.test(supplied)?supplied:crypto.randomUUID()
}

export function apiSuccess<T>(data: T, status = 200, requestId?: string) {
  return NextResponse.json({ ok:true,data,meta:{ version:"v1",...(requestId?{requestId}:{}) } },{status,headers:responseHeaders(requestId)})
}

export function apiError(code: string, message: string, status = 400, details?: unknown, requestId?: string) {
  return NextResponse.json({ ok:false,error:{code,message,...(details===undefined?{}:{details})},meta:{version:"v1",...(requestId?{requestId}:{})} },{status,headers:responseHeaders(requestId)})
}

export function reportApiError(error: unknown, context: { requestId:string; route:string; businessId?:string|null; branchId?:string|null }) {
  const known=error as {name?:string;message?:string;code?:string;status?:number}
  const record={
    level:"error",
    event:"api_request_failed",
    timestamp:new Date().toISOString(),
    service:"customer-api",
    environment:process.env.APP_ENVIRONMENT??process.env.NODE_ENV??"unknown",
    requestId:context.requestId,
    route:context.route,
    businessId:context.businessId??null,
    branchId:context.branchId??null,
    error:{name:known.name??"Error",code:known.code??"UNEXPECTED",status:known.status??500,message:(known.message??"Unexpected error").slice(0,500)},
  }
  console.error(JSON.stringify(record))
}

export async function parseJson(request: NextRequest, maximumBytes = 100_000): Promise<unknown> {
  const raw = await request.text()
  if (raw.length > maximumBytes) throw Object.assign(new Error("Request is too large."),{status:413,code:"PAYLOAD_TOO_LARGE"})
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error("Request body must be valid JSON."),{status:400,code:"INVALID_JSON"}) }
}

export async function bearerIdentity(request: NextRequest): Promise<ApiIdentity | null> {
  const authorization = request.headers.get("authorization")
  if (!authorization) return null
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("Use a Bearer access token."),{status:401,code:"INVALID_AUTHORIZATION"})
  const token = authorization.slice(7).trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw Object.assign(new Error("Authentication is temporarily unavailable."),{status:503,code:"AUTH_UNAVAILABLE"})
  if (token.length < 20) throw Object.assign(new Error("The access token is invalid."),{status:401,code:"INVALID_ACCESS_TOKEN"})
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw Object.assign(new Error("The access token is invalid or expired."),{status:401,code:"INVALID_ACCESS_TOKEN"})
  return {id:data.user.id,email:data.user.email?.trim().toLowerCase()??null}
}

export async function consumeRateLimit(request: NextRequest, scope: string, limit: number, windowSeconds: number, context = "global") {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
  const hash = createHash("sha256").update(`${scope}:${context}:${ip}`).digest("hex")
  const { data, error } = await createAdminClient().rpc("consume_api_rate_limit",{p_key_hash:hash,p_limit:limit,p_window_seconds:windowSeconds})
  if (error) throw Object.assign(new Error("Request protection is temporarily unavailable."),{status:503,code:"RATE_LIMIT_UNAVAILABLE"})
  return Boolean(data)
}

export function publicStorefront(snapshot: StorefrontSnapshot) {
  return {business:snapshot.business,branch:snapshot.branch,availableBranches:snapshot.availableBranches,resolutionError:snapshot.resolutionError,source:snapshot.source,orderPersistence:snapshot.orderPersistence}
}
