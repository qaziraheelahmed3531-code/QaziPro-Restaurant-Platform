import { resourcePermissions } from "@/lib/permissions"
import { ResourceManager } from "@/components/resource-manager"
import { requirePermission, type AdminContext } from "@/lib/auth"
import { resources } from "@/lib/resources"

export async function ResourceScreen({ resource, context: suppliedContext }: { resource: keyof typeof resources; context?: AdminContext }) {
  const permission = resourcePermissions[String(resource)] ?? "dashboard.view"
  const context = suppliedContext ?? await requirePermission(resource==="stockMovements"?"inventory.read":permission)
  return <ResourceManager key={`${resource}-${context.activeBranchId}`} config={resources[resource]} assetOrigin={process.env.CUSTOMER_APP_URL} businessId={context.businessId} role={context.role} selectedBranchId={context.activeBranchId ?? undefined}/>
}
