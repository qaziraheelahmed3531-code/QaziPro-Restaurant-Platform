import "server-only"

import { createHash } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { mobileApiVersion } from "@italian-pizza/shared/mobile-api"

import { createAdminClient } from "@/lib/supabase/admin"
import type { StorefrontSnapshot } from "@/types"

export type ApiIdentity = { id: string; email: string | null }
export type ApiSession = { identity: ApiIdentity; token: string; client: SupabaseClient }
export type ListCursor = { createdAt: string; id: string }

export class ApiProblem extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message)
    this.name = "ApiProblem"
  }
}

function responseHeaders(requestId?: string) {
  return { "Cache-Control":"private, no-store", ...(requestId ? { "x-request-id":requestId } : {}) }
}

export function apiRequestId(request: NextRequest) {
  const supplied=request.headers.get("x-request-id")?.trim()
  return supplied&&/^[a-zA-Z0-9._:-]{8,100}$/.test(supplied)?supplied:crypto.randomUUID()
}

export function apiSuccess<T>(data: T, status = 200, requestId?: string) {
  return NextResponse.json({ ok:true,data,meta:{ version:mobileApiVersion,...(requestId?{requestId}:{}) } },{status,headers:responseHeaders(requestId)})
}

export function apiSuccessWithMeta<T>(data: T, meta: Record<string,unknown>, status = 200, requestId?: string) {
  return NextResponse.json({ ok:true,data,meta:{ version:mobileApiVersion,...(requestId?{requestId}:{}),...meta } },{status,headers:responseHeaders(requestId)})
}

export function apiError(code: string, message: string, status = 400, details?: unknown, requestId?: string) {
  return NextResponse.json({ ok:false,error:{code,message,...(details===undefined?{}:{details})},meta:{version:mobileApiVersion,...(requestId?{requestId}:{})} },{status,headers:responseHeaders(requestId)})
}

export function apiFailure(error: unknown, requestId: string, context: {route:string;businessId?:string|null;branchId?:string|null}) {
  const known=error as {message?:string;status?:number;code?:string;details?:unknown}
  const status=Number.isInteger(known.status)?Number(known.status):500
  const message=status>=500?"The service is temporarily unavailable.":known.message??"The request could not be completed."
  reportApiError(error,{requestId,...context})
  return apiError(known.code??(status>=500?"SERVICE_UNAVAILABLE":"INVALID_REQUEST"),message,status,known.details,requestId)
}

export function reportApiError(error: unknown, context: { requestId:string; route:string; businessId?:string|null; branchId?:string|null }) {
  const known=error as {name?:string;message?:string;code?:string;status?:number}
  const status=known.status??500
  const record={
    level:status>=500?"error":"warning",
    event:"api_request_failed",
    timestamp:new Date().toISOString(),
    service:"customer-api",
    environment:process.env.APP_ENVIRONMENT??process.env.NODE_ENV??"unknown",
    requestId:context.requestId,
    route:context.route,
    businessId:context.businessId??null,
    branchId:context.branchId??null,
    error:{name:known.name??"Error",code:known.code??"UNEXPECTED",status,message:(known.message??"Unexpected error").slice(0,500)},
  }
  if(status>=500)console.error(JSON.stringify(record));else console.warn(JSON.stringify(record))
}

export async function parseJson(request: NextRequest, maximumBytes = 100_000): Promise<unknown> {
  const raw = await request.text()
  if (raw.length > maximumBytes) throw Object.assign(new Error("Request is too large."),{status:413,code:"PAYLOAD_TOO_LARGE"})
  try { return JSON.parse(raw) } catch { throw Object.assign(new Error("Request body must be valid JSON."),{status:400,code:"INVALID_JSON"}) }
}

export async function bearerIdentity(request: NextRequest): Promise<ApiIdentity | null> {
  return (await bearerSession(request))?.identity??null
}

export async function bearerSession(request: NextRequest): Promise<ApiSession | null> {
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
  const authenticatedClient=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}})
  return {identity:{id:data.user.id,email:data.user.email?.trim().toLowerCase()??null},token,client:authenticatedClient}
}

export async function requireBearerSession(request: NextRequest) {
  const session=await bearerSession(request)
  if(!session)throw new ApiProblem("AUTH_REQUIRED","Use a valid Supabase access token.",401)
  return session
}

export function listLimit(request: NextRequest, fallback=25, maximum=100) {
  const raw=request.nextUrl.searchParams.get("limit")
  if(raw===null)return fallback
  const value=Number(raw)
  if(!Number.isInteger(value)||value<1||value>maximum)throw new ApiProblem("INVALID_PAGINATION",`limit must be between 1 and ${maximum}.`,400)
  return value
}

export function encodeCursor(cursor: ListCursor) {
  return Buffer.from(JSON.stringify(cursor),"utf8").toString("base64url")
}

export function decodeCursor(value: string | null): ListCursor | null {
  if(!value)return null
  try {
    const parsed=JSON.parse(Buffer.from(value,"base64url").toString("utf8")) as Partial<ListCursor>
    if(typeof parsed.createdAt!=="string"||!Number.isFinite(Date.parse(parsed.createdAt))||typeof parsed.id!=="string"||!/^[0-9a-f-]{36}$/i.test(parsed.id))throw new Error("invalid")
    return {createdAt:parsed.createdAt,id:parsed.id}
  } catch { throw new ApiProblem("INVALID_CURSOR","The pagination cursor is invalid.",400) }
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
