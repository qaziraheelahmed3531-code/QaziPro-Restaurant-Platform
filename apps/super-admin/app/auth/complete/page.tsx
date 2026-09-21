import { redirect } from "next/navigation"
import { activateInvitedPlatformStaff, bootstrapPlatformOwner, getPlatformContext } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function CompleteSignIn() {
  const activated = await activateInvitedPlatformStaff()
  if (!activated) await bootstrapPlatformOwner()
  const context = await getPlatformContext()
  redirect(context ? "/" : "/login?error=unauthorized")
}
