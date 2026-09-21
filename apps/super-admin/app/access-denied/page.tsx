import Link from "next/link"

export default function AccessDenied() {
  return <main className="standalone-state"><div className="state-icon">!</div><p className="eyebrow">PERMISSION REQUIRED</p><h1>Access denied</h1><p>Your QaziPro role does not include this platform permission. Contact a Platform Owner if this is unexpected.</p><Link className="button" href="/">Return to overview</Link></main>
}
