"use client"

import { useActionState, useRef } from "react"
import { setEntitlementInstantAction, type ActionState } from "@/app/actions"

const initialState: ActionState = {}

export function EntitlementToggle({ businessId, capability, label, initialEnabled, updatedAt }: { businessId: string; capability: string; label: string; initialEnabled: boolean; updatedAt: string | null }) {
  const lock = useRef(false)
  const [state, action, pending] = useActionState(async (previous: ActionState, form: FormData): Promise<ActionState> => {
    try { return await setEntitlementInstantAction(previous, form) }
    catch { return { error: "The request could not be confirmed. Refresh before retrying." } }
    finally { lock.current = false }
  }, initialState)
  const enabled = state.success && typeof state.enabled === "boolean" ? state.enabled : initialEnabled
  const target = !enabled
  return <form action={action} className="entitlement-toggle" onSubmit={event => { if (lock.current) event.preventDefault(); else lock.current = true }}>
    <input type="hidden" name="updatedAt" value={state.updatedAt ?? updatedAt ?? ""}/>
    <input type="hidden" name="businessId" value={businessId}/>
    <input type="hidden" name="capability" value={capability}/>
    <input type="hidden" name="enabled" value={String(target)}/>
    <button className={`button button-small ${enabled ? "button-danger" : "button-secondary"}`} disabled={pending} aria-busy={pending} aria-label={`${enabled ? "Disable" : "Enable"} ${label}`}>
      {pending ? target ? "Enabling..." : "Disabling..." : enabled ? "Disable" : "Enable"}
    </button>
    {state.error ? <small className="inline-action-error" role="alert">{state.error}</small> : null}
    {state.success ? <span className="sr-only" role="status">{capability} {state.enabled ? "enabled" : "disabled"}.</span> : null}
  </form>
}
