import { emailOtpError } from "@italian-pizza/shared"

type AuthErrorLike = {
  code?: string
  message?: string
  name?: string
  status?: number
}

export type AuthOperation = "general" | "email-send" | "otp-verify"

export function authErrorMessage(error: unknown, operation: AuthOperation = "general") {
  if (operation !== "general") return emailOtpError(error, operation)
  const detail = (error && typeof error === "object" ? error : {}) as AuthErrorLike
  const message = detail.message?.toLowerCase() ?? ""
  const code = detail.code?.toLowerCase() ?? ""
  const name = detail.name?.toLowerCase() ?? ""

  if (code === "email_address_invalid" || message.includes("invalid email") || message.includes("email address is invalid")) {
    return "Please enter a valid email address."
  }
  if (detail.status === 429) return "Too many requests. Please wait and try again."
  if (message.includes("fetch") || message.includes("network") || message.includes("failed to connect") || name.includes("fetcherror")) {
    return "Unable to reach the authentication service. Check your connection and try again."
  }

  return "Sign-in could not be completed. Please try again."
}

export function logAuthDiagnostic(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "development") return

  const detail = (error && typeof error === "object" ? error : {}) as AuthErrorLike
  console.warn(`[auth:${context}]`, JSON.stringify({
    name: detail.name,
    code: detail.code,
    status: detail.status,
  }))
}
