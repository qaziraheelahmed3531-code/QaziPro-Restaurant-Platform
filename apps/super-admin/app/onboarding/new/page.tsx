import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PlatformShell } from "@/components/platform-shell"
import { DataNotice, PageHeader } from "@/components/ui"
import { OnboardingWizard, type OnboardingPackage } from "@/components/onboarding-wizard"
import { requirePlatformStaff } from "@/lib/auth"
import { getOnboardingPackages } from "@/lib/data"

export default async function NewRestaurantPage() {
  const context = await requirePlatformStaff(), packages = await getOnboardingPackages()
  return <PlatformShell context={context}><PageHeader eyebrow="GUIDED PROVISIONING" title="Add a new restaurant" description="Configure, review and provision a tenant through one retry-safe audited workflow." actions={<Link className="button button-secondary" href="/onboarding"><ArrowLeft/>Onboarding queue</Link>}/>{packages.error?<DataNotice message={packages.error}/>:null}<OnboardingWizard packages={packages.data as OnboardingPackage[]}/></PlatformShell>
}
