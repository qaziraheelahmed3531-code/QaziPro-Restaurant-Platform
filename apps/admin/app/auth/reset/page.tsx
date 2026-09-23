import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PasswordResetForm } from "@/components/password-reset-form";

export default async function ResetPage() {
  const context = await requireAdmin();
  if (!context.userId) redirect("/login");
  return <main className="login-page"><div className="login-card"><h1>Set a new password</h1><p>Choose a strong password for your QaziPro restaurant account.</p><PasswordResetForm /></div></main>;
}
