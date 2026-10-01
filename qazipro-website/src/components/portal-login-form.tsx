"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { ArrowRight, KeyRound, LoaderCircle, Mail, RotateCcw, ShieldCheck } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { requestPortalCodeAction, verifyPortalCodeAction, type PortalActionState } from "@/app/client-portal/actions"

const emptyState: PortalActionState = {}
const OTP_LENGTH = 8

export function PortalLoginForm({ defaultReference = "", defaultEmail = "" }: { defaultReference?: string; defaultEmail?: string }) {
  const [requestState, requestAction, requesting] = useActionState(requestPortalCodeAction, emptyState)
  const [verifyState, verifyAction, verifying] = useActionState(verifyPortalCodeAction, emptyState)
  const [digits, setDigits] = useState(() => Array<string>(OTP_LENGTH).fill(""))
  const [remaining, setRemaining] = useState(0)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const reduceMotion = useReducedMotion()
  const sent = Boolean(requestState.sent && requestState.email && requestState.reference)

  useEffect(() => {
    if (!sent) return
    setRemaining(60)
    inputs.current[0]?.focus()
  }, [sent, requestState.message])

  useEffect(() => {
    if (!remaining) return
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [remaining])

  function applyDigits(index: number, raw: string, paste = false) {
    const clean = raw.replace(/[\s-]/g, "")
    if (/[^0-9]/.test(clean) || clean.length > OTP_LENGTH) return
    const start = paste || clean.length === OTP_LENGTH ? 0 : index
    const next = paste || clean.length === OTP_LENGTH ? Array<string>(OTP_LENGTH).fill("") : [...digits]
    if (!clean) next[start] = ""
    else clean.slice(0, OTP_LENGTH - start).split("").forEach((digit, offset) => { next[start + offset] = digit })
    setDigits(next)
    const focus = Math.min(start + clean.length, OTP_LENGTH - 1)
    inputs.current[focus]?.focus()
    inputs.current[focus]?.select()
  }

  return <motion.div className="portal-login-card" initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .28 }}>
    <div className="portal-login-icon"><ShieldCheck aria-hidden="true" /></div>
    <span className="eyebrow">SECURE CLIENT ACCESS</span>
    <h1>{sent ? "Check your inbox." : "Your QaziPro application."}</h1>
    <p>{sent ? <>Enter the 8-digit code sent to <strong>{requestState.email}</strong>.</> : "Use the email and reference from your signed application. No password is required."}</p>
    <AnimatePresence mode="wait" initial={false}>
      {!sent ? <motion.form key="request" action={requestAction} className="portal-auth-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <label><span>Application reference</span><div className="portal-input"><KeyRound size={18}/><input name="reference" defaultValue={defaultReference} placeholder="QP-20261001-ABC123" autoCapitalize="characters" required/></div></label>
        <label><span>Email address</span><div className="portal-input"><Mail size={18}/><input name="email" type="email" defaultValue={defaultEmail} placeholder="you@restaurant.com" autoComplete="email" required/></div></label>
        {requestState.error ? <p className="portal-form-error" role="alert">{requestState.error}</p> : null}
        <button className="button button-primary" disabled={requesting}>{requesting ? <><LoaderCircle className="spinner"/> Sending secure code…</> : <>Email my sign-in code <ArrowRight/></>}</button>
      </motion.form> : <motion.div key="verify" className="portal-auth-form" initial={{ opacity: 0, x: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
        <form action={verifyAction}>
          <input type="hidden" name="email" value={requestState.email}/><input type="hidden" name="reference" value={requestState.reference}/><input type="hidden" name="token" value={digits.join("")}/>
          <div className="portal-otp" role="group" aria-label="Verification code">{digits.map((digit, index) => <input key={index} ref={(element) => { inputs.current[index] = element }} value={digit} disabled={verifying} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? "one-time-code" : "off"} aria-label={`Verification code digit ${index + 1} of ${OTP_LENGTH}`} maxLength={OTP_LENGTH} onFocus={(event) => event.currentTarget.select()} onChange={(event) => applyDigits(index, event.target.value)} onPaste={(event) => { event.preventDefault(); applyDigits(index, event.clipboardData.getData("text"), true) }} onKeyDown={(event) => { if (event.key === "Backspace" && !digits[index] && index > 0) { event.preventDefault(); const next=[...digits];next[index-1]="";setDigits(next);inputs.current[index-1]?.focus() } }}/>)}</div>
          {verifyState.error ? <p className="portal-form-error" role="alert">{verifyState.error}</p> : null}
          <button className="button button-primary" disabled={verifying || digits.some((digit) => !digit)}>{verifying ? <><LoaderCircle className="spinner"/> Verifying…</> : <>Open Client Portal <ArrowRight/></>}</button>
        </form>
        <form action={requestAction} className="portal-resend"><input type="hidden" name="email" value={requestState.email}/><input type="hidden" name="reference" value={requestState.reference}/><button type="submit" disabled={requesting || remaining > 0}><RotateCcw size={15}/> {remaining ? `Resend in ${remaining}s` : "Resend code"}</button></form>
        <button className="portal-change-login" type="button" onClick={() => window.location.assign(`/client-portal?reference=${encodeURIComponent(requestState.reference || "")}`)}>Use different details</button>
      </motion.div>}
    </AnimatePresence>
    <small>Only the verified email on the application can open its records. QaziPro never asks for a portal password.</small>
  </motion.div>
}
