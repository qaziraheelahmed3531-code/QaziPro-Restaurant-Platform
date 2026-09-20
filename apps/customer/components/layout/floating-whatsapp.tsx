"use client"

import { socialIcons } from "@italian-pizza/shared/social-icons"
import type { CSSProperties } from "react"

import type { StorefrontBusiness } from "@/types"

type WidgetStyle = CSSProperties & {
  "--whatsapp-size": string
  "--whatsapp-bottom": string
  "--whatsapp-side-offset": string
}

export function FloatingWhatsApp({ business }: { business: StorefrontBusiness }) {
  const number = business.whatsappNumber.replace(/\D/g, "")
  if (!business.whatsappFloatingEnabled || number.length < 8) return null
  const href = `https://wa.me/${number}?text=${encodeURIComponent(business.whatsappMessage)}`
  const style: WidgetStyle = {
    "--whatsapp-size": `${business.whatsappSizePx}px`,
    "--whatsapp-bottom": `${business.whatsappBottomPx}px`,
    "--whatsapp-side-offset": `${business.whatsappSideOffsetPx}px`,
  }
  return (
    <a
      className="floating-whatsapp"
      data-side={business.whatsappSide.toLowerCase()}
      href={href}
      style={style}
      target="_blank"
      rel="noreferrer"
      aria-label={`Chat with ${business.displayName} on WhatsApp`}
    >
      {business.whatsappLogoUrl ? (
        // The administrator controls this public CMS image URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={business.whatsappLogoUrl} alt="" />
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={socialIcons.WhatsApp.path} /></svg>
      )}
    </a>
  )
}
