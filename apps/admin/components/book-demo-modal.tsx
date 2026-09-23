"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

export function BookDemoModal({ triggerClassName = "" }: { triggerClassName?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (window.location.hash === "#request") dialog.current?.showModal();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const body = Object.fromEntries(data.entries());
    try {
      const response = await fetch("/api/demo-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string; requestId?: string };
      if (!response.ok) throw new Error(result.message || "Demo request could not be sent.");
      setMessage("Thanks. The QaziPro team will contact you soon.");
      (event.target as HTMLFormElement).reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Demo request could not be sent.");
    } finally { setBusy(false); }
  }
  return <><button type="button" className={triggerClassName || "button button--outline"} onClick={() => dialog.current?.showModal()}>Book a Demo</button><dialog ref={dialog} className="book-demo-dialog" aria-label="Book a QaziPro demo" onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}><div className="book-demo-dialog__head"><div><span>QAZIPRO WALKTHROUGH</span><h2>See QaziPro with your team</h2><p>Tell us a little about your restaurant and we’ll get in touch.</p></div><button type="button" aria-label="Close request form" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button></div><form onSubmit={submit}><label>Full name<input name="fullName" required minLength={2} maxLength={100} autoComplete="name" /></label><label>Business / brand name<input name="businessName" required minLength={2} maxLength={120} /></label><label>Email<input name="email" required type="email" autoComplete="email" /></label><label>Phone / WhatsApp<input name="phone" required type="tel" minLength={7} maxLength={35} autoComplete="tel" /></label><label>Number of branches<select name="branchBand" required defaultValue=""><option value="" disabled>Select a range</option><option value="ONE">Single branch</option><option value="TWO_TO_FIVE">2–5 branches</option><option value="SIX_PLUS">6+ / Enterprise</option></select></label><input className="book-demo-dialog__trap" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />{message && <p role="status" className="book-demo-dialog__success">{message}</p>}{error && <p role="alert" className="auth-error">{error}</p>}<button className="button" disabled={busy}>{busy ? "Sending…" : "Request walkthrough"}</button></form></dialog></>;
}
