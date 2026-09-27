"use client"

import { useId, useRef, useState, type ReactNode } from "react"
import { unstable_rethrow } from "next/navigation"

// Authorization and success redirects stay server-owned. Expected business and
// network failures preserve the DOM, confirmation dialog and entered values.
export function MutationForm({ action, children, className, confirmation }: {
  action: (form: FormData) => Promise<void | { error?: string }>; children: ReactNode; className?: string;
  confirmation?: string;
}) {
  const locked = useRef(false)
  const approved = useRef(false)
  const failed = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const submitter = useRef<HTMLButtonElement | HTMLInputElement | null>(null)
  const descriptionId = useId()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(data: FormData) {
    setBusy(true); setError(""); failed.current = false
    try {
      data.set("_inlineErrors", "1")
      const result = await action(data)
      if (result?.error) { failed.current = true; setError(result.error); return }
      close()
    }
    catch (cause) {
      unstable_rethrow(cause)
      failed.current = true
      setError("The request could not be confirmed. Your entries are still here. Check the current record before retrying.")
    } finally { locked.current = false; approved.current = false; setBusy(false) }
  }
  function close() { dialog.current?.close(); trigger.current?.focus() }
  return <>
    <form ref={form} action={submit} className={className} aria-busy={busy} onReset={event => { if (failed.current) event.preventDefault() }} onSubmit={event => {
      if (locked.current) { event.preventDefault(); return }
      if (confirmation && !approved.current) {
        event.preventDefault(); trigger.current = document.activeElement as HTMLElement;
        submitter.current = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null
        dialog.current?.showModal(); return
      }
      locked.current = true
    }}>
      {children}
      {error ? <p className="form-error span-2" role="alert">{error}</p> : null}
    </form>
    {confirmation ? <dialog ref={dialog} className="confirmation-dialog" aria-label="Confirm change" aria-describedby={descriptionId} onCancel={event => { if (busy) event.preventDefault(); else close() }}>
      <h2>Confirm change</h2><p id={descriptionId}>{confirmation}</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions"><button type="button" className="button button-secondary" autoFocus disabled={busy} onClick={close}>Cancel</button>
        <button type="button" className="button button-danger" disabled={busy} onClick={() => { approved.current = true; form.current?.requestSubmit(submitter.current ?? undefined) }}>{busy ? "Saving change…" : "Confirm change"}</button></div>
    </dialog> : null}
  </>
}
