import "server-only"

import { requirePlatformPermission } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { modules, type PlatformModule } from "@/lib/platform"

export type DataResult<T> = { data: T; error: string | null }
type Row = Record<string, unknown>

function safeMessage(code?: string) {
  return code === "42P01" || code === "PGRST205"
    ? "Super Admin foundation migration is not applied to this environment."
    : "Platform data is temporarily unavailable."
}

export async function getOverview() {
  await requirePlatformPermission("restaurants.view")
  const supabase = await createClient()
  const [restaurants, active, onboarding, branches, incidents, incidentCount, deployments, failedDeployments, subscriptions, websites, androidApps, iosApps, posDevices, orderMetrics] = await Promise.all([
    supabase.from("businesses").select("id", { count: "exact", head: true }),
    supabase.from("businesses").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("restaurant_onboarding").select("id", { count: "exact", head: true }).not("lifecycle", "in", "(ACTIVE,ARCHIVED)"),
    supabase.from("branches").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("platform_incidents").select("id,title,severity,status,business_id,last_seen_at").not("status", "in", "(RESOLVED,CLOSED)").order("last_seen_at", { ascending: false }).limit(6),
    supabase.from("platform_incidents").select("id", { count: "exact", head: true }).not("status", "in", "(RESOLVED,CLOSED)"),
    supabase.from("deployment_records").select("id,component,status,environment,business_id,created_at,error_summary").order("created_at", { ascending: false }).limit(6),
    supabase.from("deployment_records").select("id", { count: "exact", head: true }).eq("status", "FAILED"),
    supabase.from("restaurant_subscriptions").select("id", { count: "exact", head: true }).in("status", ["PAST_DUE", "GRACE_PERIOD"]),
    supabase.from("platform_domain_records").select("id", { count: "exact", head: true }).eq("purpose", "CUSTOMER").eq("verification_status", "VERIFIED").eq("dns_status", "HEALTHY").eq("ssl_status", "HEALTHY"),
    supabase.from("mobile_app_records").select("id", { count: "exact", head: true }).eq("platform", "ANDROID").eq("enabled", true),
    supabase.from("mobile_app_records").select("id", { count: "exact", head: true }).eq("platform", "IOS").eq("enabled", true),
    supabase.from("pos_offline_devices").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.rpc("platform_today_order_metrics"),
  ])
  const errors = [restaurants.error, active.error, onboarding.error, branches.error, incidents.error, incidentCount.error, deployments.error, failedDeployments.error, subscriptions.error, websites.error, androidApps.error, iosApps.error, posDevices.error, orderMetrics.error].filter(Boolean)
  const totals = orderMetrics.data as { ordersToday?: number; gmvToday?: number } | null
  return {
    data: {
      metrics: {
        restaurants: restaurants.count ?? null,
        active: active.count ?? null,
        onboarding: onboarding.count ?? null,
        branches: branches.count ?? null,
        openIncidents: incidentCount.error ? null : incidentCount.count,
        failedDeployments: failedDeployments.error ? null : failedDeployments.count,
        overdueSubscriptions: subscriptions.count ?? null,
        websitesReady: websites.error ? null : websites.count,
        androidEnabled: androidApps.error ? null : androidApps.count,
        iosEnabled: iosApps.error ? null : iosApps.count,
        activePosDevices: posDevices.error ? null : posDevices.count,
        ordersToday: totals?.ordersToday ?? null,
        gmvToday: totals?.gmvToday ?? null,
      },
      incidents: (incidents.data ?? []) as Row[],
      deployments: (deployments.data ?? []) as Row[],
    },
    error: errors.length ? safeMessage(errors[0]?.code) : null,
  }
}

export async function getRestaurants(query = "", page = 1, status = "all") {
  await requirePlatformPermission("restaurants.view")
  const supabase = await createClient()
  const pageSize = 25
  const safePage = Number.isFinite(page) ? Math.min(10000, Math.max(1, Math.floor(page))) : 1
  const safeQuery = query.trim().replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 80)
  let request = supabase.from("businesses").select(
    "id,slug,name,city,currency,timezone,is_active,created_at,branches:branches!branches_business_id_fkey(id,is_active),restaurant_onboarding(lifecycle,owner_name,owner_email,updated_at),restaurant_subscriptions(status,service_packages(name)),mobile_app_records(platform,enabled,release_status),platform_domain_records(hostname,purpose,verification_status,dns_status,ssl_status)",
    { count: "exact" },
  ).order("created_at", { ascending: false }).range((safePage - 1) * pageSize, safePage * pageSize - 1)
  if (safeQuery) request = request.or(`name.ilike.%${safeQuery}%,slug.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`)
  if (status === "active") request = request.eq("is_active", true)
  if (status === "inactive") request = request.eq("is_active", false)
  const result = await request
  return { data: (result.data ?? []) as Row[], count: result.count ?? 0, page: safePage, pageSize, error: result.error ? safeMessage(result.error.code) : null }
}

export async function getRestaurant(id: string) {
  await requirePlatformPermission("restaurants.view")
  const supabase = await createClient()
  const [business, onboarding, subscription, entitlements, apps, domains, deployments, incidents, tickets, devices, audit] = await Promise.all([
    supabase.from("businesses").select("id,slug,name,short_description,phone,email,address,city,currency,timezone,is_active,created_at,business_branding(*),branches:branches!branches_business_id_fkey(*)").eq("id", id).maybeSingle(),
    supabase.from("restaurant_onboarding").select("*").eq("business_id", id).maybeSingle(),
    supabase.from("restaurant_subscriptions").select("*,service_packages(name,code)").eq("business_id", id).maybeSingle(),
    supabase.from("service_entitlements").select("capability_key,enabled,source,effective_from,effective_until,limit_value").eq("business_id", id).order("capability_key"),
    supabase.from("mobile_app_records").select("*").eq("business_id", id).order("platform"),
    supabase.from("platform_domain_records").select("*").eq("business_id", id).order("purpose"),
    supabase.from("deployment_records").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("platform_incidents").select("*").eq("business_id", id).order("last_seen_at", { ascending: false }).limit(10),
    supabase.from("support_tickets").select("*").eq("business_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("pos_offline_devices").select("id,branch_id,name:device_name,app_version,is_active,last_sync_at,updated_at").eq("business_id", id).order("updated_at", { ascending: false }),
    supabase.from("platform_audit_logs").select("id,actor_user_id,action,target_type,reason,created_at").eq("business_id", id).order("created_at", { ascending: false }).limit(20),
  ])
  const firstError = [business.error,onboarding.error,subscription.error,entitlements.error,apps.error,domains.error,deployments.error,incidents.error,tickets.error,devices.error,audit.error].find(Boolean)
  return {
    data: business.data ? {
      business: business.data as Row,
      onboarding: onboarding.data as Row | null,
      subscription: subscription.data as Row | null,
      entitlements: (entitlements.data ?? []) as Row[],
      apps: (apps.data ?? []) as Row[], domains: (domains.data ?? []) as Row[], deployments: (deployments.data ?? []) as Row[],
      incidents: (incidents.data ?? []) as Row[], tickets: (tickets.data ?? []) as Row[], devices: (devices.data ?? []) as Row[], audit: (audit.data ?? []) as Row[],
    } : null,
    error: firstError ? safeMessage(firstError.code) : null,
  }
}

const moduleTables: Partial<Record<PlatformModule, { table: string; select: string; order: string }>> = {
  onboarding: { table: "restaurant_onboarding", select: "id,business_id,lifecycle,owner_name,owner_email,blockers,assigned_staff_user_id,updated_at,businesses(name,slug)", order: "updated_at" },
  branches: { table: "branches", select: "id,business_id,name,restaurant_name,city,is_active,online_ordering_enabled,temporarily_closed,updated_at,businesses:businesses!branches_business_id_fkey(name)", order: "updated_at" },
  apps: { table: "mobile_app_records", select: "id,business_id,platform,enabled,app_name,application_identifier,version_name,build_number,credential_status,push_status,release_status,last_release_at,businesses(name)", order: "updated_at" },
  domains: { table: "platform_domain_records", select: "id,business_id,hostname,purpose,verification_status,dns_status,ssl_status,auth_redirect_ready,last_checked_at,failure_summary,businesses(name)", order: "updated_at" },
  deployments: { table: "deployment_records", select: "id,business_id,component,environment,version,commit_sha,provider,status,started_at,finished_at,error_summary,businesses(name)", order: "created_at" },
  health: { table: "platform_incidents", select: "id,business_id,branch_id,severity,health_state,environment,component,title,status,occurrences,last_seen_at,assigned_staff_user_id,businesses(name)", order: "last_seen_at" },
  support: { table: "support_tickets", select: "id,ticket_number,business_id,branch_id,category,severity,subject,status,assigned_staff_user_id,due_at,created_at,businesses(name)", order: "created_at" },
  tasks: { table: "platform_tasks", select: "id,business_id,title,team,status,priority,assigned_staff_user_id,due_at,completed_at,created_at,businesses(name)", order: "created_at" },
  billing: { table: "restaurant_subscriptions", select: "id,business_id,status,currency,base_fee,setup_fee,branch_fee,terminal_fee,android_fee,ios_fee,discount,tax,billing_frequency,next_invoice_date,service_packages(name),businesses(name)", order: "updated_at" },
  packages: { table: "service_packages", select: "id,code,name,currency,base_fee,setup_fee,included_branches,additional_branch_fee,terminal_fee,billing_frequency,is_active,updated_at", order: "updated_at" },
  team: { table: "platform_staff", select: "user_id,display_name,email,status,mfa_required,last_login_at,access_revoked_at,created_at", order: "created_at" },
  integrations: { table: "platform_integration_status", select: "id,business_id,provider,status,last_checked_at,expires_at,message,businesses(name)", order: "updated_at" },
  audit: { table: "platform_audit_logs", select: "id,actor_user_id,action,target_type,target_id,business_id,reason,request_id,created_at", order: "created_at" },
}

export async function getModuleRows(module: PlatformModule, requestedPage = 1) {
  const definition = modules[module]
  await requirePlatformPermission(definition.permission)
  const source = moduleTables[module]
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1
  const pageSize = 50
  if (!source) return { data: [] as Row[], count: 0, page, pageSize, error: null }
  const supabase = await createClient()
  const result = await supabase.from(source.table).select(source.select, { count: "exact" }).order(source.order, { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  return { data: (result.data ?? []) as unknown as Row[], count: result.count ?? 0, page, pageSize, error: result.error ? safeMessage(result.error.code) : null }
}

export async function getOnboardingPackages() {
  await requirePlatformPermission("onboarding.manage")
  const supabase = await createClient()
  const result = await supabase.from("service_packages").select("id,code,name,currency,base_fee,setup_fee,included_branches,billing_frequency").eq("is_active", true).order("base_fee")
  return { data: (result.data ?? []) as Row[], error: result.error ? safeMessage(result.error.code) : null }
}

export async function getOnboardingQueue() {
  await requirePlatformPermission("onboarding.manage")
  const supabase = await createClient()
  const result = await supabase.from("restaurant_onboarding")
    .select("id,business_id,lifecycle,owner_name,owner_email,expected_locations,blockers,updated_at,businesses(name,slug),onboarding_documents(id,status,version,signed_at,approved_at,created_at)")
    .order("updated_at", { ascending: false }).limit(100)
  return { data: (result.data ?? []) as unknown as Row[], error: result.error ? safeMessage(result.error.code) : null }
}

export async function getOnboardingAgreement(id: string) {
  await requirePlatformPermission("onboarding.manage")
  const supabase = await createClient()
  const onboarding = await supabase.from("restaurant_onboarding").select("*,businesses(id,name,slug,currency)").eq("id", id).maybeSingle()
  const businessId = (onboarding.data as Row | null)?.business_id
  const agreementSubscription = businessId
    ? await supabase.from("restaurant_subscriptions").select("*,service_packages(name,code)").eq("business_id", businessId).maybeSingle()
    : { data: null, error: null }
  const documents = await supabase.from("onboarding_documents").select("id,version,status,document_data,share_expires_at,signer_name,signer_email,signed_at,approved_at,created_at").eq("onboarding_id", id).order("created_at", { ascending: false })
  const error = onboarding.error ?? agreementSubscription.error ?? documents.error
  return { data: onboarding.data ? { onboarding: onboarding.data as unknown as Row, subscription: agreementSubscription.data as unknown as Row | null, documents: (documents.data ?? []) as unknown as Row[] } : null, error: error ? safeMessage(error.code) : null }
}

export async function getPlatformTeam() {
  await requirePlatformPermission("team.manage")
  const supabase = await createClient()
  const [staff, roles, permissions] = await Promise.all([
    supabase.from("platform_staff").select("user_id,display_name,email,status,mfa_required,last_login_at,access_revoked_at,created_at,platform_staff_roles:platform_staff_roles!platform_staff_roles_staff_user_id_fkey(platform_roles(key,name)),platform_staff_permissions:platform_staff_permissions!platform_staff_permissions_staff_user_id_fkey(permission_key,allowed)").order("created_at", { ascending: false }).limit(200),
    supabase.from("platform_roles").select("id,key,name,description").neq("key", "PLATFORM_OWNER").order("name"),
    supabase.from("platform_permissions").select("key,label").order("key"),
  ])
  const error = staff.error ?? roles.error ?? permissions.error
  return { data: { staff: (staff.data ?? []) as unknown as Row[], roles: (roles.data ?? []) as unknown as Row[], permissions: (permissions.data ?? []) as unknown as Row[] }, error: error ? safeMessage(error.code) : null }
}

export async function getPlatformBusinessOptions() {
  await requirePlatformPermission("restaurants.view")
  const supabase = await createClient()
  const result = await supabase.from("businesses").select("id,name,slug,branches:branches!branches_business_id_fkey(id,name,code)").order("name").limit(500)
  return { data: (result.data ?? []) as unknown as Row[], error: result.error ? safeMessage(result.error.code) : null }
}

export async function getBillingOptions() {
  await requirePlatformPermission("billing.view")
  const supabase = await createClient()
  const [businesses, packages] = await Promise.all([
    supabase.from("businesses").select("id,name,slug").order("name").limit(500),
    supabase.from("service_packages").select("id,name,code,currency").eq("is_active", true).order("name").limit(200),
  ])
  const error = businesses.error ?? packages.error
  return {
    data: { businesses: (businesses.data ?? []) as Row[], packages: (packages.data ?? []) as Row[] },
    error: error ? safeMessage(error.code) : null,
  }
}

export async function getTaskOptions() {
  await requirePlatformPermission("tasks.manage")
  const supabase = await createClient()
  const [businesses, staff] = await Promise.all([
    supabase.from("businesses").select("id,name,slug").order("name").limit(500),
    supabase.from("platform_staff").select("user_id,display_name,email").eq("status", "ACTIVE").order("display_name").limit(200),
  ])
  const error = businesses.error ?? staff.error
  return {
    data: { businesses: (businesses.data ?? []) as Row[], staff: (staff.data ?? []) as Row[] },
    error: error ? safeMessage(error.code) : null,
  }
}
