"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return <button className="button button-secondary" type="button" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }}>{copied ? <Check/> : <Copy/>}{copied ? "Copied" : "Copy link"}</button>
}
