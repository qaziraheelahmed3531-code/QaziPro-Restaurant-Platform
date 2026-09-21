"use client"

import { useActionState } from "react"
import { signAgreementAction, type ActionState } from "@/app/actions"
import { CheckCircle2, PenLine } from "lucide-react"

export function AgreementSignForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signAgreementAction, {})
  if (!state.error && state.requestId) return <div className="agreement-complete"><CheckCircle2/><h2>Agreement submitted</h2><p>QaziPro has received your signed agreement for review. Reference: {state.requestId}</p></div>
  return <form action={action} className="agreement-sign-form"><input type="hidden" name="token" value={token}/><label>Full legal name<input name="signerName" required autoComplete="name"/></label><label>Email<input name="signerEmail" type="email" required defaultValue={email} autoComplete="email"/></label><label className="agreement-accept"><input name="accepted" type="checkbox" required/><span>I confirm that I am authorized to approve this agreement and accept the displayed version.</span></label>{state.error ? <div className="form-error" role="alert">{state.error}<small>Reference: {state.requestId}</small></div> : null}<button className="button" disabled={pending}><PenLine/>{pending ? "Submitting..." : "Sign and submit"}</button></form>
}
