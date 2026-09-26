import Link from "next/link"
export default function NotFound() {
  return <main className="recovery-page"><h1>This page isn’t available.</h1><p>The record may have moved, or the address may be incorrect.</p><Link href="/" className="button">Back to overview</Link></main>
}
