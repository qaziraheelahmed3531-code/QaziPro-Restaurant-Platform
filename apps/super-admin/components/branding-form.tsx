"use client"
import { useActionState, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { saveBrandingAction, type BrandingState } from "@/app/settings/actions"
import type { PlatformBranding } from "@/lib/branding-contract"
import { SubmitButton } from "./submit-button"

export function BrandingForm({ branding, owner }: { branding: PlatformBranding; owner: boolean }) {
  const lock = useRef(false)
  const failed = useRef(false)
  const approved = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const resetButton = useRef<HTMLButtonElement | null>(null)
  const urls = useRef<{ logo?: string; icon?: string }>({})
  const [preview, setPreview] = useState<{ logo?: string; icon?: string }>({})
  const [state, action, pending] = useActionState(async (previous: BrandingState, form: FormData) => {
    failed.current = false
    try {
      const result = await saveBrandingAction(previous, form)
      failed.current = Boolean(result.error)
      if (result.success) {
        Object.values(urls.current).forEach(url => { if (url) URL.revokeObjectURL(url) })
        urls.current = {}; setPreview({}); dialog.current?.close()
      }
      return result
    }
    catch { failed.current = true; return { error: "The request could not be confirmed. Reload to check the current branding before retrying." } }
    finally { lock.current = false; approved.current = false }
  }, {})
  useEffect(() => {
    const current = urls.current
    return () => { if (current.logo) URL.revokeObjectURL(current.logo); if (current.icon) URL.revokeObjectURL(current.icon) }
  }, [])
  const version = state.version ?? branding.version
  return <><form ref={formRef} className="form-grid branding-form" action={action} aria-busy={pending} onReset={event => { if (failed.current) event.preventDefault() }} onSubmit={event => {
    if (lock.current) { event.preventDefault(); return }
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    if (submitter?.getAttribute("value") === "true" && !approved.current) {
      event.preventDefault(); resetButton.current = submitter as HTMLButtonElement; dialog.current?.showModal(); return
    }
    lock.current = true
  }}>
    <input name="version" type="hidden" value={version}/>
    {([['logo','Primary logo',branding.logo],['icon','Compact icon / favicon',branding.icon]] as const).map(([key,label,current]) => <label className="brand-upload" key={key}>
      <span>{label}</span><span className="brand-preview"><Image src={preview[key] ?? current} alt={`${label} preview`} width={120} height={120} unoptimized onError={() => { if (urls.current[key]) { URL.revokeObjectURL(urls.current[key]!); urls.current[key] = undefined; setPreview({ ...urls.current }) } }}/></span>
      <input type="file" name={key} aria-label={label} accept="image/png,image/jpeg,image/webp" disabled={!owner || pending || !branding.available} onChange={event => {
        if (urls.current[key]) URL.revokeObjectURL(urls.current[key]!)
        const file = event.target.files?.[0]
        urls.current[key] = file && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? URL.createObjectURL(file) : undefined
        setPreview({ ...urls.current })
      }}/>
      <small>{key === "logo" ? "Used in navigation and sign-in. Transparent PNG recommended." : "Optional square icon. Falls back to the primary logo."}</small>
    </label>)}
    <p className="form-help span-2">PNG, JPEG or WebP. Maximum 2 MB; 32–4000 pixels per side. Images are safely re-encoded. Restaurant branding is not affected.</p>
    {!branding.available ? <p className="form-error span-2" role="alert">Branding storage is unavailable. Saving is disabled; the default logo remains visible.</p> : null}
    {!owner ? <p className="form-help span-2">Only the Platform Owner can change these assets.</p> : null}
    {state.error ? <p className="form-error span-2" role="alert">{state.error}</p> : null}
    {state.success ? <p className="success-banner span-2" role="status">{state.success}</p> : null}
    <div className="dialog-actions span-2"><SubmitButton className="button button-secondary" name="reset" value="true" disabled={!owner || !branding.available} pendingLabel="Saving branding…">Reset to default</SubmitButton><SubmitButton className="button" disabled={!owner || !branding.available} pendingLabel="Processing and saving…">Save branding</SubmitButton></div>
  </form><dialog ref={dialog} className="confirmation-dialog" aria-labelledby="reset-brand-title" aria-describedby="reset-brand-description" onCancel={event => { if (pending) event.preventDefault() }}>
    <h2 id="reset-brand-title">Reset QaziPro branding?</h2><p id="reset-brand-description">The default QaziPro assets will be restored. Restaurant logos will not change.</p>
    {state.error ? <p role="alert" className="form-error">{state.error}</p> : null}
    <div className="dialog-actions"><button type="button" autoFocus className="button button-secondary" disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button><button type="button" className="button button-danger" disabled={pending} onClick={() => { approved.current = true; if (resetButton.current) formRef.current?.requestSubmit(resetButton.current) }}>{pending ? "Resetting…" : "Reset to default"}</button></div>
  </dialog></>
}
