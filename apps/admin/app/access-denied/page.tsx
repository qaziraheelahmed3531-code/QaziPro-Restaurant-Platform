import Link from "next/link"
import { requireAdmin } from "@/lib/auth"
export default async function Page() {
  await requireAdmin()
  return <main className="panel"><h1>Access not assigned</h1><p>Your account is signed in, but this section is not included in your saved permissions. Ask an owner to update your access.</p><Link href="/login">Return to sign-in</Link></main>
}
