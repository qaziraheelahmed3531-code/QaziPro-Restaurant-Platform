import { normalizeRestaurantSlug } from "@italian-pizza/shared/domains"

export const platformPermissions = [
  "restaurants.view",
  "restaurants.create",
  "restaurants.edit",
  "restaurants.suspend",
  "branches.manage",
  "subscriptions.manage",
  "billing.view",
  "billing.edit",
  "deployments.manage",
  "apps.manage",
  "domains.manage",
  "support.access",
  "support.elevated",
  "integrations.manage",
  "team.manage",
  "incidents.manage",
  "tasks.manage",
  "onboarding.manage",
  "audit.view",
] as const

export type PlatformPermission = (typeof platformPermissions)[number]
export type RestaurantLifecycle =
  | "LEAD"
  | "AGREEMENT_PENDING"
  | "ONBOARDING"
  | "CONFIGURATION"
  | "STAGING"
  | "CLIENT_REVIEW"
  | "READY"
  | "ACTIVE"
  | "SUSPENDED"
  | "OFFBOARDING"
  | "ARCHIVED"

const transitions: Record<RestaurantLifecycle, RestaurantLifecycle[]> = {
  LEAD: ["AGREEMENT_PENDING", "ONBOARDING", "ARCHIVED"],
  AGREEMENT_PENDING: ["ONBOARDING", "LEAD", "ARCHIVED"],
  ONBOARDING: ["CONFIGURATION", "AGREEMENT_PENDING", "OFFBOARDING"],
  CONFIGURATION: ["STAGING", "ONBOARDING", "OFFBOARDING"],
  STAGING: ["CLIENT_REVIEW", "CONFIGURATION", "OFFBOARDING"],
  CLIENT_REVIEW: ["READY", "STAGING", "OFFBOARDING"],
  READY: ["ACTIVE", "CLIENT_REVIEW", "OFFBOARDING"],
  ACTIVE: ["SUSPENDED", "OFFBOARDING"],
  SUSPENDED: ["ACTIVE", "OFFBOARDING"],
  OFFBOARDING: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: [],
}

export function canTransitionRestaurant(from: RestaurantLifecycle, to: RestaurantLifecycle) {
  return transitions[from].includes(to)
}

export function effectivePermissions(
  rolePermissions: readonly string[],
  direct: Readonly<Record<string, boolean>>,
) {
  const result = new Set(rolePermissions)
  for (const [permission, allowed] of Object.entries(direct)) {
    if (allowed) result.add(permission)
    else result.delete(permission)
  }
  return [...result].sort()
}

export function healthFromSignals(signals: Array<"HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN">) {
  if (signals.includes("CRITICAL")) return "CRITICAL" as const
  if (signals.includes("WARNING")) return "WARNING" as const
  if (!signals.length || signals.includes("UNKNOWN")) return "UNKNOWN" as const
  return "HEALTHY" as const
}

export function slugifyRestaurant(value: string) {
  return normalizeRestaurantSlug(value)
}

export const modules = {
  overview: { title: "Overview", detail: "Platform activity and attention queue", permission: "restaurants.view" },
  restaurants: { title: "Restaurants", detail: "Master restaurant directory", permission: "restaurants.view" },
  onboarding: { title: "Onboarding", detail: "Guided client provisioning", permission: "onboarding.manage" },
  leads: { title: "Website Leads", detail: "Public website and demo inquiries", permission: "onboarding.manage" },
  branches: { title: "Branches", detail: "Cross-restaurant branch operations", permission: "branches.manage" },
  apps: { title: "Apps", detail: "Android and iOS release registry", permission: "apps.manage" },
  domains: { title: "Domains", detail: "DNS, SSL and tenant resolution", permission: "domains.manage" },
  deployments: { title: "Deployments", detail: "Platform and restaurant release history", permission: "deployments.manage" },
  health: { title: "System Health", detail: "Incidents and service signals", permission: "incidents.manage" },
  support: { title: "Support", detail: "Restaurant support workspace", permission: "support.access" },
  tasks: { title: "Tasks", detail: "Cross-team ownership and deadlines", permission: "tasks.manage" },
  billing: { title: "Billing", detail: "Subscriptions and commercial records", permission: "billing.view" },
  packages: { title: "Packages", detail: "Packages, add-ons and entitlements", permission: "subscriptions.manage" },
  team: { title: "Team", detail: "QaziPro staff access and roles", permission: "team.manage" },
  integrations: { title: "Integrations", detail: "Connection readiness without secret exposure", permission: "integrations.manage" },
  audit: { title: "Audit Logs", detail: "Immutable sensitive-action history", permission: "audit.view" },
  settings: { title: "Settings", detail: "Platform environment controls", permission: "team.manage" },
} as const satisfies Record<string, { title: string; detail: string; permission: PlatformPermission }>

export type PlatformModule = keyof typeof modules

export function isPlatformModule(value: string): value is PlatformModule {
  return value in modules
}
