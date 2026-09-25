"use client"

import { useActionState, useOptimistic } from "react"
import { setEntitlementInstantAction, type ActionState } from "@/app/actions"

const initialState: ActionState = {}

export function EntitlementToggle({ businessId, capability, initialEnabled }: { businessId: string; capability: string; initialEnabled: boolean }) {
  const [state, action, pending] = useActionState(setEntitlementInstantAction, initialState)
  const confirmed = state.success && typeof state.enabled === "boolean" ? state.enabled : initialEnabled
  const [enabled, setOptimisticEnabled] = useOptimistic(confirmed, (_current, next: boolean) => next)
  const target = !enabled
  return <form action={action} className="entitlement-toggle" onSubmit={() => setOptimisticEnabled(target)}>
    <input type="hidden" name="businessId" value={businessId}/>
    <input type="hidden" name="capability" value={capability}/>
    <input type="hidden" name="enabled" value={String(target)}/>
    <button className={`button button-small ${enabled ? "button-danger" : "button-secondary"}`} disabled={pending} aria-busy={pending}>
      {pending ? target ? "Enablingâ€¦" : "Disablingâ€¦" : enabled ? "Disable" : "Enable"}
    </button>
    {state.error ? <small className="inline-action-error" role="alert">{state.error}</small> : null}
    {state.success ? <span className="sr-only" role="status">{capability} {state.enabled ? "enabled" : "disabled"}.</span> : null}
  </form>
}
