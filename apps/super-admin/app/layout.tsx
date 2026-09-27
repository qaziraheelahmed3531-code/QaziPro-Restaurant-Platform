import type { Metadata } from "next"
import { Suspense, type ReactNode } from "react"
import { PageSkeleton } from "@/components/page-skeleton"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { getPlatformBranding } from "@/lib/branding"
import { PlatformBrandingProvider } from "@/components/platform-branding"

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

// Platform authorization must be evaluated per request, including when build
// and runtime environments have different Supabase configuration.
export const dynamic = "force-dynamic"

const baseMetadata: Metadata = {
  title: { default: "QaziPro Platform Control Center", template: "%s · QaziPro" },
  description: "Internal QaziPro restaurant platform operations",
  icons: { icon: "/qazipro-logo.png", apple: "/qazipro-logo.png" },
  robots: { index: false, follow: false },
}

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPlatformBranding()
  return { ...baseMetadata, icons: { icon: branding.icon, apple: branding.icon } }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const branding = await getPlatformBranding()
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body suppressHydrationWarning><PlatformBrandingProvider value={branding}><Suspense fallback={<PageSkeleton/>}>{children}</Suspense></PlatformBrandingProvider></body></html>
}
