export type SearchResult = { id: string; group: string; label: string; detail: string; href: string }
export const normalizeSearchQuery = (value: string) => value.trim().replace(/[^\p{L}\p{N} @.+-]/gu, "").slice(0, 80)
export const searchSources = [
  { permission: "restaurants.view", table: "businesses", fields: "id,name,slug", filter: "name", group: "Restaurants", label: "name", detail: "slug", section: "" },
  { permission: "restaurants.view", table: "restaurant_onboarding", fields: "id,business_id,owner_name,owner_email", filter: "owner_email", group: "Owners", label: "owner_name", detail: "owner_email", section: "access" },
  { permission: "branches.manage", table: "branches", fields: "id,business_id,name,city", filter: "name", group: "Branches", label: "name", detail: "city", section: "branches" },
  { permission: "domains.manage", table: "platform_domain_records", fields: "id,business_id,hostname,purpose", filter: "hostname", group: "Domains", label: "hostname", detail: "purpose", section: "website" },
  { permission: "apps.manage", table: "mobile_app_records", fields: "id,business_id,app_name,platform", filter: "app_name", group: "Apps", label: "app_name", detail: "platform", section: "apps" },
  { permission: "support.access", table: "support_tickets", fields: "id,business_id,subject,status", filter: "subject", group: "Support", label: "subject", detail: "status", section: "support" },
  { permission: "tasks.manage", table: "platform_tasks", fields: "id,business_id,title,status", filter: "title", group: "Tasks", label: "title", detail: "status", section: "tasks" },
] as const
