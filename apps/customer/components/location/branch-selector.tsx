import Link from "next/link"
import { MapPin, Store } from "lucide-react"

import type { StorefrontSnapshot } from "@/types"

export function BranchSelector({ storefront }: { storefront: StorefrontSnapshot }) {
  if (storefront.resolutionError === "TABLE_UNAVAILABLE") return <main className="branch-gate"><section className="branch-gate__card"><h1>This table is unavailable</h1><p>Please ask your waiter to check the table QR, or leave dine-in mode to browse the restaurant.</p><form method="post" action="/api/table-context"><button className="button-link" type="submit">Leave dine-in mode</button></form></section></main>
  const missingTenant = storefront.resolutionError === "TENANT_NOT_FOUND" || storefront.resolutionError === "CONFIGURATION_MISSING"
  return <main className="branch-gate">
    <section className="branch-gate__card">
      <span className="branch-gate__icon"><Store aria-hidden="true" /></span>
      <h1>{missingTenant ? "Store unavailable" : `Choose your ${storefront.business.name} branch`}</h1>
      <p>{missingTenant ? "This domain is not connected to an active restaurant." : "Select the location that will prepare your order. Prices and availability may differ by branch."}</p>
      {!missingTenant && <div className="branch-gate__list">{storefront.availableBranches.map((branch) => <Link key={branch.id} href={`/api/v1/storefront/branch?branch=${encodeURIComponent(branch.id)}`}><MapPin aria-hidden="true" /><span><strong>{branch.name}</strong><small>{branch.formattedAddress ?? branch.city}</small></span></Link>)}</div>}
    </section>
  </main>
}
