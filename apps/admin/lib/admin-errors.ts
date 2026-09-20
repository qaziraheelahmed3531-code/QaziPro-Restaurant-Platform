export function adminError(error: { code?: string; message?: string } | null | undefined, fallback = "Could not save changes. Please retry.") {
  if (error?.code === "42501") return "You do not have access to this action. Ask an owner to review your permissions."
  if (error?.code === "23505") return "This record already exists. Open it to make changes."
  if (error?.code === "23503") return "This record is still used by another item or historical order. Remove or reassign those linked items first; no data was changed."
  if (error?.code === "22023" && error.message && error.message.length < 220) return error.message
  return fallback
}
