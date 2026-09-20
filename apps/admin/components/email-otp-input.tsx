"use client"

import { useRef } from "react"
import { EMAIL_OTP_LENGTH, editOtpDigits, otpKeyAction } from "@italian-pizza/shared"

export function EmailOtpInput({ digits, onChange, disabled = false }: { digits: string[]; onChange: (digits: string[]) => void; disabled?: boolean }) {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  function apply(result: ReturnType<typeof editOtpDigits>) {
    if (!result) return
    onChange(result.digits)
    inputs.current[result.focus]?.focus()
    inputs.current[result.focus]?.select()
  }
  return <div className="otp-inputs" role="group" aria-label="Verification code" style={{ gridTemplateColumns: `repeat(${EMAIL_OTP_LENGTH}, minmax(0, 1fr))` }}>
    {digits.map((digit, index) => <input key={index}
      ref={element => { inputs.current[index] = element }}
      value={digit} disabled={disabled} type="text" inputMode="numeric" pattern="[0-9]*"
      autoComplete={index === 0 ? "one-time-code" : "off"}
      aria-label={`Verification code digit ${index + 1} of ${EMAIL_OTP_LENGTH}`}
      maxLength={EMAIL_OTP_LENGTH} autoFocus={index === 0}
      onFocus={event => event.currentTarget.select()}
      onChange={event => apply(editOtpDigits(digits, index, event.target.value))}
      onPaste={event => { event.preventDefault(); apply(editOtpDigits(digits, index, event.clipboardData.getData("text"), true)) }}
      onKeyDown={event => { const result = otpKeyAction(digits, index, event.key); if (result) { event.preventDefault(); apply(result) } }}
    />)}
  </div>
}
