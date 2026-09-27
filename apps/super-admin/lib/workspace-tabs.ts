export const workspaceTabs = [
  ["overview", "Overview"], ["access", "Owner & access"], ["branches", "Branches"],
  ["services", "Services & billing"], ["website", "Domains"], ["apps", "Apps & devices"],
  ["health", "Health & support"], ["audit", "Audit"],
] as const
export type WorkspaceTab = typeof workspaceTabs[number][0]
export function resolveWorkspaceTab(notice: Record<string, string | undefined>): WorkspaceTab {
  const selected = workspaceTabs.find(([key]) => key === notice.tab)
  if (selected) return selected[0]
  if (notice.invite || notice.membership) return "access"
  if (notice.branch || notice.branchStatus) return "branches"
  if (notice.entitlement) return "services"
  return "overview"
}
