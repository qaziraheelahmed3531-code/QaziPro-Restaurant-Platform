import Image from "next/image"

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
  return (
    <div className={`brand-logo brand-logo--${size} brand-logo--${placement}`}>
      {logoUrl ? (
        <span className="brand-logo__image">
          <Image
            src={logoUrl}
            alt={`${brandName} logo`}
            fill
            sizes={placement === "footer" ? "(max-width: 767px) 70vw, 432px" : placement === "location" ? "154px" : "288px"}
            unoptimized
            draggable={false}
          />
        </span>
      ) : (
        <span className={`brand__mark${showName ? "" : " brand__mark--empty"}`} aria-hidden="true">{showName ? "IP" : ""}</span>
      )}
      {showName && <strong>{brandName}</strong>}
    </div>
  )
}
