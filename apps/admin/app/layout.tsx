import "./targeted-upgrades.css"
import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import "./storefront-finish.css"
import "./email-otp.css"
import "./interaction-polish.css"
import "./client-portal.css"
import "./portal-skeleton.css"

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" })

export const metadata: Metadata = {
  title: "QaziPRO Restaurant Admin",
  description: "QaziPRO POS and online ordering management",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Browser extensions can inject body attributes before React hydrates.
  return <html lang="en-PK" className={geist.variable}><body suppressHydrationWarning>{children}</body></html>
}
