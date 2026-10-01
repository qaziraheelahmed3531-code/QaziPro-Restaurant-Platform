"use client"

import { useActionState, useEffect, useRef } from "react"
import { LoaderCircle, Send } from "lucide-react"
import { sendClientMessageAction, type PortalActionState } from "@/app/client-portal/actions"

export function PortalMessageForm({ reference }: { reference: string }) {
  const [state, action, pending] = useActionState(sendClientMessageAction, {} as PortalActionState)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => { if (state.ok) form.current?.reset() }, [state.ok])
  return <form ref={form} action={action} className="portal-message-form">
    <input type="hidden" name="reference" value={reference}/>
    <label htmlFor="client-portal-message">Reply to QaziPro</label>
    <textarea id="client-portal-message" name="message" rows={4} minLength={2} maxLength={4000} placeholder="Add the requested information or ask a question…" required/>
    {state.error ? <p className="portal-form-error" role="alert">{state.error}</p> : null}
    {state.ok ? <p className="portal-form-success" role="status">{state.message}</p> : null}
    <button className="button button-primary" disabled={pending}>{pending ? <><LoaderCircle className="spinner"/> Sending…</> : <>Send response <Send size={17}/></>}</button>
  </form>
}
