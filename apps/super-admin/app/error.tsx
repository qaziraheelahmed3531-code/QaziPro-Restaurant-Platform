"use client"
import Link from "next/link"
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="recovery-page"><h1>We couldn’t load this workspace.</h1><p>No change has been confirmed. Try again, or return to the overview to check the current record.</p><div className="dialog-actions"><button className="button" onClick={reset}>Try again</button><Link className="button button-secondary" href="/">Back to overview</Link></div></main>
}
