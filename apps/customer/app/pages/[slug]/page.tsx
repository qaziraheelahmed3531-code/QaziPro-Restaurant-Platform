import { notFound } from "next/navigation"

import { SiteHeader } from "@/components/layout/site-header"
import { getStorefrontSnapshot } from "@/lib/storefront/server"

const defaultPages: Record<string, { title: string; body: string }> = {
  contact: { title: "Contact Italian Pizza", body: "For questions about an order, delivery or pickup, please contact the restaurant through the details provided at checkout." },
  faqs: { title: "Frequently Asked Questions", body: "Choose delivery or pickup, select your location, then add your favourites to the cart. Delivery availability and fees are confirmed before you place an order." },
  privacy: { title: "Privacy", body: "We use the information needed to prepare, deliver and support your order. Customer account data is only used for the account and business operations it belongs to." },
  terms: { title: "Terms of Ordering", body: "Orders are confirmed subject to restaurant availability, opening hours and the details provided at checkout. Please review your order before placing it." },
}

export default async function ContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const storefront = await getStorefrontSnapshot()
  const page = storefront.business.contentPages.find((item) => item.slug === slug) ?? (defaultPages[slug] ? { slug, ...defaultPages[slug] } : null)
  if (!page) notFound()

  return <div className="app-shell inner-page">
    <SiteHeader />
    <main className="content-page">
      <p className="content-page__eyebrow">{storefront.business.displayName}</p>
      <h1>{page.title}</h1>
      <div className="content-page__body">{page.body}</div>
    </main>
  </div>
}
