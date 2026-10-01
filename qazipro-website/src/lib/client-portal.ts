import "server-only"

import { cache } from "react"
import { createPortalAuthClient } from "@/lib/supabase/server"
import { platformServerClient } from "@/lib/platform-cms"

export const portalStatuses = ["NEW", "REVIEWING", "NEEDS_INFO", "APPROVED", "REJECTED", "CONVERTED"] as const
export type PortalStatus = (typeof portalStatuses)[number]

export const portalStatusCopy: Record<PortalStatus, { label: string; detail: string; step: number }> = {
  NEW: { label: "Submitted", detail: "Your signed application is safely recorded.", step: 1 },
  REVIEWING: { label: "Under review", detail: "The QaziPro team is reviewing your scope.", step: 2 },
  NEEDS_INFO: { label: "Information required", detail: "Please review the latest request and respond.", step: 2 },
  APPROVED: { label: "Approved", detail: "Your application has been approved for the next setup step.", step: 3 },
  REJECTED: { label: "Not proceeding", detail: "The application is not moving forward at this time.", step: 3 },
  CONVERTED: { label: "Setup started", detail: "Your restaurant workspace has entered onboarding.", step: 4 },
}

type JsonObject = Record<string, unknown>

export type PortalApplicationSummary = {
  id: string
  reference: string
  restaurantName: string
  status: PortalStatus
  createdAt: string
  serviceCount: number
}

export type PortalDocument = {
  id: string
  type: string
  name: string
  contentType: string
  version: number
  createdAt: string
}

export type PortalActivity = {
  id: string
  label: string
  detail: string
  createdAt: string
}

export type PortalMessage = {
  id: string
  sender: "CLIENT" | "PLATFORM" | "SYSTEM"
  type: "MESSAGE" | "REQUEST_INFO" | "CLIENT_RESPONSE"
  body: string
  createdAt: string
}

export type PortalApplication = PortalApplicationSummary & {
  clientData: JsonObject
  services: JsonObject[]
  selectedPackage: JsonObject | null
  pricing: JsonObject
  terms: JsonObject[]
  formVersion: number
  consentedAt: string
  assignedPoc: { name: string; role: string } | null
  activities: PortalActivity[]
  messages: PortalMessage[]
  documents: PortalDocument[]
}

export const getPortalSession = cache(async () => {
  try {
    const client = await createPortalAuthClient()
    const { data, error } = await client.auth.getUser()
    const email = data.user?.email?.trim().toLowerCase()
    if (error || !data.user || !email) return null
    return { userId: data.user.id, email }
  } catch {
    return null
  }
})

function safeStatus(value: unknown): PortalStatus {
  return portalStatuses.includes(value as PortalStatus) ? (value as PortalStatus) : "NEW"
}

function safeArray(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []
}

export async function getPortalApplications(): Promise<PortalApplicationSummary[] | null> {
  const session = await getPortalSession()
  const admin = platformServerClient()
  if (!session || !admin) return null
  const result = await admin
    .from("platform_onboarding_submissions")
    .select("id,reference,status,client_data,selected_services,created_at")
    .eq("portal_enabled", true)
    .eq("portal_email", session.email)
    .order("created_at", { ascending: false })
  if (result.error) return null
  return result.data.map((row) => ({
    id: String(row.id),
    reference: String(row.reference),
    restaurantName: String((row.client_data as JsonObject | null)?.restaurantName || "Restaurant application"),
    status: safeStatus(row.status),
    createdAt: String(row.created_at),
    serviceCount: safeArray(row.selected_services).length,
  }))
}

export async function getPortalApplication(reference: string): Promise<PortalApplication | null> {
  const session = await getPortalSession()
  const admin = platformServerClient()
  if (!session || !admin || !/^QP-[0-9]{8}-[A-Z0-9]{6}$/.test(reference)) return null
  const submission = await admin
    .from("platform_onboarding_submissions")
    .select("id,reference,status,client_data,selected_services,selected_package,pricing_snapshot,terms_snapshot,form_version,consented_at,assigned_staff_user_id,created_at")
    .eq("reference", reference)
    .eq("portal_enabled", true)
    .eq("portal_email", session.email)
    .maybeSingle()
  if (submission.error || !submission.data) return null
  const row = submission.data
  const [activity, messages, documents, staff] = await Promise.all([
    admin.from("platform_onboarding_submission_activity").select("id,action,detail,public_label,created_at").eq("submission_id", row.id).eq("is_client_visible", true).order("created_at"),
    admin.from("platform_onboarding_portal_messages").select("id,sender_kind,message_type,body,created_at").eq("submission_id", row.id).eq("is_client_visible", true).order("created_at"),
    admin.from("platform_onboarding_submission_documents").select("id,document_type,file_name,content_type,version,created_at").eq("submission_id", row.id).eq("is_client_visible", true).order("created_at"),
    row.assigned_staff_user_id
      ? admin.from("platform_staff").select("display_name,user_id").eq("user_id", row.assigned_staff_user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (activity.error || messages.error || documents.error) return null
  const values = (row.client_data || {}) as JsonObject
  return {
    id: String(row.id),
    reference: String(row.reference),
    restaurantName: String(values.restaurantName || "Restaurant application"),
    status: safeStatus(row.status),
    createdAt: String(row.created_at),
    serviceCount: safeArray(row.selected_services).length,
    clientData: values,
    services: safeArray(row.selected_services),
    selectedPackage: row.selected_package && typeof row.selected_package === "object" ? row.selected_package as JsonObject : null,
    pricing: (row.pricing_snapshot || {}) as JsonObject,
    terms: safeArray(row.terms_snapshot),
    formVersion: Number(row.form_version),
    consentedAt: String(row.consented_at),
    assignedPoc: staff.data ? { name: String(staff.data.display_name), role: "QaziPro onboarding" } : null,
    activities: (activity.data || []).map((item) => ({
      id: String(item.id),
      label: String(item.public_label || item.action).replaceAll("_", " "),
      detail: String(item.detail || ""),
      createdAt: String(item.created_at),
    })),
    messages: (messages.data || []).map((item) => ({
      id: String(item.id),
      sender: item.sender_kind as PortalMessage["sender"],
      type: item.message_type as PortalMessage["type"],
      body: String(item.body),
      createdAt: String(item.created_at),
    })),
    documents: (documents.data || []).map((item) => ({
      id: String(item.id),
      type: String(item.document_type),
      name: String(item.file_name || `QaziPro document v${item.version}`),
      contentType: String(item.content_type || "application/pdf"),
      version: Number(item.version),
      createdAt: String(item.created_at),
    })),
  }
}

export async function ownsPortalApplication(reference: string) {
  const application = await getPortalApplication(reference)
  return application ? { application, session: await getPortalSession() } : null
}
