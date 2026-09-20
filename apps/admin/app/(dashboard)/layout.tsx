import type { Metadata } from "next"
import { cache } from "react"

import { AdminShell } from "@/components/admin-shell"
import { requireAdmin } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const getDashboardChrome = cache(async () => {
  const context = await requireAdmin()
  const { data: branding } = await (await createClient())
    .from("business_branding")
    .select("favicon_url,primary_color,secondary_color,text_color")
    .eq("business_id", context.businessId)
    .maybeSingle()
  return { context, branding }
})

export async function generateMetadata(): Promise<Metadata> {
  const { context, branding } = await getDashboardChrome()
  const favicon = branding?.favicon_url?.trim()
  return {
    title: `${context.businessName} | QaziPRO Admin`,
    icons: favicon
      ? { icon: favicon, shortcut: favicon, apple: favicon }
      : { icon: "/icon.svg" },
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { context, branding } = await getDashboardChrome()
  return (
    <AdminShell
      context={context}
      branding={{
        faviconUrl: branding?.favicon_url ?? null,
        primaryColor: branding?.primary_color ?? "#a92114",
        secondaryColor: branding?.secondary_color ?? "#e7a81a",
        textColor: branding?.text_color ?? "#1e2024",
      }}
    >
      {children}
    </AdminShell>
  )
}
