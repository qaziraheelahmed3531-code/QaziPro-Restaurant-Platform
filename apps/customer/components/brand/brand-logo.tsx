"use client"

import Image from "next/image"
import { useState } from "react"

type BrandLogoSize = "sm" | "md" | "lg"
type BrandLogoPlacement = "default" | "header" | "footer" | "location"

export function BrandLogo({
  logoUrl,
  brandName,
  size = "md",
  showName = true,
  placement = "default",
}: {
  logoUrl?: string
  brandName: string
  size?: BrandLogoSize
  showName?: boolean
  placement?: BrandLogoPlacement
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initials = brandName.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase() || "R"
  return (
    <div className={`brand-logo brand-logo--${size} brand-logo--${placement}`}>
      {logoUrl && failedUrl !== logoUrl ? (
        <span className="brand-logo__image">
          <Image
            src={logoUrl}
            alt={`${brandName} logo`}
            fill
            sizes={placement === "footer" ? "(max-width: 767px) 70vw, 432px" : placement === "location" ? "154px" : "288px"}
            unoptimized
            draggable={false}
            onError={() => setFailedUrl(logoUrl)}
          />
        </span>
      ) : (
        <span className="brand__mark" aria-label={`${brandName} logo`}>{initials}</span>
      )}
      {showName && <strong>{brandName}</strong>}
    </div>
  )
}
