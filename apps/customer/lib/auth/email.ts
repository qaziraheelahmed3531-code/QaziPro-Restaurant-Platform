export function normalizeEmail(value: string) {
  return value.trim()
}

export function isValidEmail(value: string) {
  if (!value || value.length > 254 || /\s/.test(value)) return false
  const at = value.lastIndexOf("@")
  if (at <= 0 || at === value.length - 1) return false

  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false
  return /^[^@]+@[^@]+$/.test(value)
}
