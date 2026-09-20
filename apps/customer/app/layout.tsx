import "./sticky-category.css"
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppOverlays } from "@/components/providers/app-overlays";
import { AppProvider } from "@/components/providers/app-provider";
import { StorefrontBootSkeleton } from "@/components/loading/storefront-boot-skeleton";
import { StorefrontRefresh } from "@/components/providers/storefront-refresh";
import { DesktopPosAuthBridge } from "@/components/providers/desktop-pos-auth-bridge";
import { GoogleReviewsSection } from "@/components/reviews/google-reviews-section";
import { SiteFooter } from "@/components/layout/site-footer";
import { BlockedAccount } from "@/components/account/blocked-account";
import { getStorefrontSnapshot } from "@/lib/storefront/server";
import { getCurrentCustomerRestriction } from "@/lib/restrictions/server";
import { BranchSelector } from "@/components/location/branch-selector";
import "./globals.css";
import "./location-v5.css";
import "./storefront-finish.css";
import "./interaction-polish.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function readableTextOn(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((value) => Number.parseInt(value, 16) / 255)
  const luminance = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] > 0.43 ? "#15110d" : "#ffffff"
}

export async function generateMetadata(): Promise<Metadata> {
  const storefront = await getStorefrontSnapshot();
  const restaurantName=storefront.branch.restaurantName??storefront.business.name;
  return {
    title: `${restaurantName} | Order Online`,
    description: storefront.business.description || `Order fresh pizza, deals and more from ${restaurantName}.`,
    icons: storefront.business.faviconUrl ? { icon: storefront.business.faviconUrl } : undefined,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const storefront = await getStorefrontSnapshot();
  const restriction = storefront.business.id ? await getCurrentCustomerRestriction(storefront.business.id) : null;
  const contactValue = storefront.business.phone || "";
  const contactHref = contactValue.startsWith("http") ? contactValue : "tel:" + contactValue.replace(/[^+0-9]/g, "");
  const restaurantName=storefront.branch.restaurantName??storefront.business.name;
  const theme = {
    "--ip-brand-primary":storefront.business.primaryColor,
    "--ip-brand-primary-hover":`color-mix(in srgb, ${storefront.business.primaryColor} 82%, black)`,
    "--ip-brand-primary-pressed":`color-mix(in srgb, ${storefront.business.primaryColor} 70%, black)`,
    "--ip-brand-secondary":storefront.business.secondaryColor,
    "--ip-brand-secondary-subtle":`color-mix(in srgb, ${storefront.business.secondaryColor} 18%, white)`,
    "--ip-brand-secondary-hover":`color-mix(in srgb, ${storefront.business.secondaryColor} 82%, black)`,
    "--ip-text-inverse":readableTextOn(storefront.business.primaryColor),
    "--ip-text-on-secondary":readableTextOn(storefront.business.secondaryColor),
    "--ip-background-default":storefront.business.websiteBackgroundColor,
    "--ip-header-background":storefront.business.headerBackgroundColor,
    "--ip-footer-background":storefront.business.footerBackgroundColor,
    "--ip-product-card-background":storefront.business.productCardBackgroundColor,
    "--ip-text-primary":storefront.business.textColor,
    "--ip-footer-text":storefront.business.footerTextColor,
    "--ip-font-family":`"${storefront.business.fontFamily}", var(--font-geist-sans)`,
    "--ip-surface-brand-subtle":`color-mix(in srgb, ${storefront.business.primaryColor} 8%, white)`,
    "--ip-header-logo-size":`${storefront.business.headerLogoSizePx}px`,
    "--ip-footer-logo-size":`${storefront.business.footerLogoSizePx}px`,
  } as CSSProperties;
  return (
    <html
      lang="en-PK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>{storefront.business.fontStylesheetUrl && <link rel="stylesheet" href={storefront.business.fontStylesheetUrl} />}</head>
      <body suppressHydrationWarning className="min-h-full flex flex-col" style={theme}>
        <DesktopPosAuthBridge />
        {!storefront.branch.id ? <BranchSelector storefront={storefront}/> : restriction?.prevent_storefront_access ? <BlockedAccount restaurantName={restaurantName} contactHref={contactHref}/> : <AppProvider storefront={storefront}>
          <StorefrontBootSkeleton />
          <StorefrontRefresh businessId={storefront.business.id ?? ""} branchId={storefront.branch.id ?? ""}/>
          {children}
          <GoogleReviewsSection />
          <SiteFooter />
          <AppOverlays />
        </AppProvider>}
      </body>
    </html>
  );
}
