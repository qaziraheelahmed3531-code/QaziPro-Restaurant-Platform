import type { Metadata, Viewport } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsappLink } from "@/components/whatsapp-link";
import { Analytics } from "@/components/analytics";
import { MotionSystem } from "@/components/motion-system";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "QaziPro — Restaurant Technology & Custom Software", template: "%s | QaziPro" },
  description: "QaziPro builds connected restaurant systems, branded ordering experiences, Shopify stores and custom software for ambitious businesses.",
  applicationName: "QaziPro",
  category: "technology",
  creator: "QaziPro",
  publisher: "QaziPro",
  openGraph: { type: "website", siteName: "QaziPro", title: "QaziPro — Business technology, connected.", description: "Connected restaurant systems and custom software, built with care." },
  twitter: { card: "summary_large_image", title: "QaziPro — Business technology, connected.", description: "Connected restaurant systems and custom software, built with care." },
  robots: process.env.APP_ENVIRONMENT === "production" ? { index: true, follow: true } : { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f7f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organization = { "@context": "https://schema.org", "@type": "Organization", name: "QaziPro", url: site.url, founder: { "@type": "Person", name: "Qazi Raheel Ahmad" }, email: site.email, telephone: site.phone, contactPoint: { "@type": "ContactPoint", telephone: site.phone, contactType: "sales and support", availableLanguage: ["English", "Urdu"] } };
  return <html lang="en" data-scroll-behavior="smooth"><body><a className="skip-link" href="#main">Skip to content</a><MotionSystem/><SiteHeader/><main id="main">{children}</main><SiteFooter/><WhatsappLink/><Analytics/><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g,"\\u003c") }}/>{process.env.NODE_ENV === "development" ? <script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async/> : null}</body></html>;
}
