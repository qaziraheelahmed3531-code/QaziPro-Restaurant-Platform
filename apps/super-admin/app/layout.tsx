import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const sans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

// Platform authorization must be evaluated per request, including when build
// and runtime environments have different Supabase configuration.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { default: "QaziPro Platform Control Center", template: "%s · QaziPro" },
  description: "Internal QaziPro restaurant platform operations",
  icons: { icon: "/qazipro-logo.png", apple: "/qazipro-logo.png" },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body suppressHydrationWarning>{children}</body></html>
}
