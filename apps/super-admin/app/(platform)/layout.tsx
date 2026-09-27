import { Suspense, type ReactNode } from "react"
import { PlatformShell } from "@/components/platform-shell"
import { PageSkeleton } from "@/components/page-skeleton"
import { requirePlatformStaff } from "@/lib/auth"

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const context = await requirePlatformStaff()
  // Stable, unkeyed boundary: first load may stream a skeleton, subsequent
  // transitions retain valid content. Each page/action still authorizes itself.
  return <PlatformShell context={context}><Suspense fallback={<PageSkeleton/>}>{children}</Suspense></PlatformShell>
}
