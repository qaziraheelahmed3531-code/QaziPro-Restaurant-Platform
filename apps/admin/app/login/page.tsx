import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { adminHome, getAdminContext } from "@/lib/auth"

const messages: Record<string,string> = { configuration:"Supabase is not configured for this deployment.", unauthorized:"This account is authenticated but does not have active staff access.", callback:"The sign-in callback could not be completed." }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const context = await getAdminContext()
  if (context) redirect(adminHome(context))
  return <main className="login-page"><LoginForm initialError={messages[params.error ?? ""]}/></main>
}
