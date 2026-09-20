/** Must match the configured Supabase email token length. Never coerce codes to numbers. */
export const EMAIL_OTP_LENGTH = 8
export const EMAIL_OTP_RESEND_SECONDS = 60
export const emptyOtpDigits = () => Array<string>(EMAIL_OTP_LENGTH).fill("")
export const isCompleteEmailOtp = (token: string) => token.length === EMAIL_OTP_LENGTH && /^[0-9]+$/.test(token)

export function editOtpDigits(current: string[], index: number, raw: string, paste = false) {
  const clean = raw.replace(/[\s-]/g, "")
  if (/[^0-9]/.test(clean) || clean.length > EMAIL_OTP_LENGTH) return null
  const start = paste || clean.length === EMAIL_OTP_LENGTH ? 0 : index
  const digits = paste || clean.length === EMAIL_OTP_LENGTH ? emptyOtpDigits() : [...current]
  if (!clean) digits[start] = ""
  else clean.slice(0, EMAIL_OTP_LENGTH - start).split("").forEach((digit, offset) => { digits[start + offset] = digit })
  return { digits, focus: Math.min(start + clean.length, EMAIL_OTP_LENGTH - 1) }
}

export function otpKeyAction(digits: string[], index: number, key: string) {
  if (key === "ArrowLeft") return { digits, focus: Math.max(0, index - 1) }
  if (key === "ArrowRight") return { digits, focus: Math.min(EMAIL_OTP_LENGTH - 1, index + 1) }
  if (key !== "Backspace") return null
  const focus = digits[index] ? index : Math.max(0, index - 1)
  return { digits: digits.map((digit, i) => i === focus ? "" : digit), focus }
}

export function emailOtpError(error: unknown, operation: "email-send" | "otp-verify") {
  const detail = (error && typeof error === "object" ? error : {}) as { code?: string; status?: number; name?: string; message?: string }
  const code = detail.code ?? "", message = (detail.message ?? "").toLowerCase()
  if (detail.status === 429 || code.includes("rate_limit") || /rate limit|too many requests/.test(message)) return "Too many requests. Please wait and try again."
  if (/fetch|network|failed to connect/.test(message) || detail.name === "AuthRetryableFetchError") return "Unable to reach the authentication service."
  if (code === "incomplete_otp") return "Please enter the complete verification code."
  if (operation === "otp-verify") return "The verification code is incorrect or has expired."
  if (code === "email_address_invalid") return "Please enter a valid email address."
  return "We couldn't send the verification email right now."
}
