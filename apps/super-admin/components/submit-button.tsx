"use client"

import { useFormStatus } from "react-dom"
import type { ComponentProps } from "react"
import { LoaderCircle } from "lucide-react"

export function SubmitButton({ children, pendingLabel = "Saving…", disabled, ...props }: ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus()
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <><LoaderCircle className="pending-spinner" aria-hidden="true"/>{pendingLabel}</> : children}
  </button>
}
