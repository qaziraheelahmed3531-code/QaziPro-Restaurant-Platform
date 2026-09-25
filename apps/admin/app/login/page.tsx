import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { LoginStories } from "@/components/login-stories"
import { accessReasonQuery, adminHome, getAdminAccessResolution, getAdminContext } from "@/lib/auth"

const messages: Record<string,string> = {
  configuration:"Supabase is not configured for this deployment.",
  unauthorized:"This account does not have Restaurant Admin access.",
  callback:"The sign-in link is invalid or has expired. Request a new link or sign in again.",
  "no-membership":"No restaurant access is assigned to this account.",
  "membership-inactive":"Your restaurant access is inactive. Ask an owner or QaziPro administrator to reactivate it.",
  "membership-link":"Your invitation was accepted, but membership linking is incomplete. Contact QaziPro support.",
  "invitation-incomplete":"Finish accepting your invitation before signing in.",
  "invitation-expired":"This invitation has expired. Ask QaziPro to resend it.",
  "invitation-revoked":"This invitation has been revoked.",
  "restaurant-inactive":"Your account is ready, but this restaurant has not been activated yet.",
  "restaurant-suspended":"This restaurant is currently suspended or archived.",
  "restaurant-missing":"The assigned restaurant is no longer available.",
  "branch-access":"No active branch is assigned to this staff account.",
  "entitlement-missing":"Restaurant Admin is not included in the active service configuration.",
  "entitlement-disabled":"Restaurant Admin access is disabled for this restaurant.",
  "subscription-suspended":"Restaurant Admin is unavailable while the subscription is suspended.",
  "subscription-cancelled":"Restaurant Admin is unavailable because the subscription is cancelled.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const context = await getAdminContext()
  if (context) redirect(adminHome(context))
  const access = await getAdminAccessResolution()
  const errorKey = params.error ?? (access.reason !== "AUTHENTICATION_REQUIRED" ? accessReasonQuery(access.reason) : "")
  return <main className="login-page"><div className="login-layout"><LoginStories/><LoginForm initialError={messages[errorKey]}/></div></main>
}
