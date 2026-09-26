"use client"
import { createContext, useContext, type ReactNode } from "react"
import Image from "next/image"
import { defaultBranding, type PlatformBranding } from "@/lib/branding-contract"
const Branding = createContext(defaultBranding)
export function PlatformBrandingProvider({ value, children }: { value: PlatformBranding; children: ReactNode }) { return <Branding.Provider value={value}>{children}</Branding.Provider> }
export function PlatformLogo({ compact = false, size = 44 }: { compact?: boolean; size?: number }) {
  const branding = useContext(Branding)
  return <Image src={compact ? branding.icon : branding.logo} alt="QaziPro" width={size} height={size} unoptimized/>
}
