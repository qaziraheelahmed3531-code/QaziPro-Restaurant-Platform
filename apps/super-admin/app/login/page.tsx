import { redirect } from "next/navigation"
import { LoginForm } from "@/components/login-form"
import { getPlatformContext } from "@/lib/auth"

const messages: Record<string, string> = {
  configuration: "Platform authentication is not configured for this environment.",
  unauthorized: "This account is authenticated but has no active QaziPro platform access.",
  callback: "The secure sign-in callback could not be completed.",
  migration: "The Super Admin database foundation has not been applied to this environment.",
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const context = await getPlatformContext()
  if (context) redirect("/")
  return <main className="login-page"><LoginForm initialError={messages[params.error ?? ""]}/></main>
}
