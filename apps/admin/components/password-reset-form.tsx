"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordResetForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 12) { setError("Use at least 12 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true); setError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) { setError("Password could not be updated. Please request a new reset link."); setBusy(false); return; }
    window.location.replace("/auth/complete");
  }
  return <form className="login-form" onSubmit={submit}><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={event => setPassword(event.target.value)}/><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={event => setConfirm(event.target.value)}/>{error && <p role="alert" className="auth-error">{error}</p>}<button className="button" disabled={busy}>{busy ? "Updating…" : "Save password"}</button></form>;
}
