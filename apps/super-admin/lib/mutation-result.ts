const messages: Record<string, string> = {
  stale: "Another operator changed this record. Your entries are preserved. Refresh and review the current values before retrying.",
  configuration: "This action is not configured. Ask the platform owner to review the integration.",
  "invite-configuration": "Invitation delivery is not configured. Your changes have not been submitted.",
  validation: "Review the entered values and try again.",
  "branch-validation": "Check the branch name, code, address, country and location coordinates.",
  "membership-validation": "Select a valid membership, role and branch scope.",
  "membership-safety": "This access change would remove required owner access or use an invalid scope.",
  "in-use": "This package has current subscribers. Move those restaurants before deactivating it.",
  "last-active": "Keep at least one active branch. Activate another branch before deactivating this one.",
  conflict: "That hostname or application identifier is already in use. Choose a unique value.",
  "branch-conflict": "That branch code is already in use. Choose a unique code.",
  scope: "The selected record is no longer available in your permitted scope. Refresh before retrying.",
  missing: "This record is no longer available. Refresh the list before retrying.",
  self: "You cannot revoke your own platform access.",
  "owner-only": "Only the platform owner can make this change.",
  role: "Choose a supported staff role. Platform owner access cannot be invited here.",
  "invite-state": "The invitation state changed. Refresh the record before retrying.",
  "invite-in-progress": "This invitation is already being processed. Refresh its delivery status; do not send it again.",
  "invite-delivery": "The invitation was saved, but email delivery failed. Review its delivery status before retrying.",
  transition: "This lifecycle change is not currently allowed. Review the restaurant readiness and current status.",
}

/** Only curated messages reach the browser; never echo database errors or URLs. */
export function mutationErrorMessage(destination: string): string {
  let code: string | null = null
  try { code = new URL(destination, "https://platform.invalid").searchParams.get("error") } catch { /* safe fallback */ }
  return messages[code ?? ""] ?? "The change could not be completed. Your entries are preserved. Check the current record before retrying."
}
