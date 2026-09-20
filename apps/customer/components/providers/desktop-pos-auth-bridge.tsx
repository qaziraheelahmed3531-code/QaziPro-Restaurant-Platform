"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PENDING_KEY = "desktop-pos-oauth-pending-at";
const MAX_AGE_MS = 15 * 60 * 1000;

function clearPending() {
  window.localStorage.removeItem(PENDING_KEY);
  document.cookie = `${PENDING_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function appErrorUrl(message: string) {
  const target = new URL("italianpizza-pos://auth/callback");
  target.searchParams.set("error_description", message);
  return target.toString();
}

export function DesktopPosAuthBridge() {
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cookiePending = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${PENDING_KEY}=`))
      ?.split("=")[1];
    const pendingAt = Number(
      window.localStorage.getItem(PENDING_KEY) ?? cookiePending ?? 0,
    );
    if (!pendingAt || Date.now() - pendingAt > MAX_AGE_MS) {
      clearPending();
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const providerError =
      query.get("error_description") ??
      hash.get("error_description") ??
      query.get("error") ??
      hash.get("error");
    const hasResult =
      Boolean(providerError) ||
      query.has("code") ||
      hash.has("access_token");
    if (!hasResult) return;

    void (async () => {
      try {
        if (providerError) throw new Error(providerError);
        const supabase = createClient();
        let session = (await supabase.auth.getSession()).data.session;
        const code = query.get("code");
        if (!session && code) {
          const exchanged = await supabase.auth.exchangeCodeForSession(code);
          if (exchanged.error) throw exchanged.error;
          session = exchanged.data.session;
        }
        if (!session)
          throw new Error("Google did not create a secure sign-in session.");
        const response = await fetch("/api/desktop-pos-auth/exchange", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const result = (await response.json().catch(() => ({}))) as {
          tokenHash?: string;
          error?: string;
        };
        if (!response.ok || !result.tokenHash)
          throw new Error(result.error ?? "Desktop sign-in could not be completed.");
        const target = new URL("italianpizza-pos://auth/callback");
        target.searchParams.set("token_hash", result.tokenHash);
        if (!active) return;
        const value = target.toString();
        setCallbackUrl(value);
        clearPending();
        window.location.replace(value);
      } catch (reason) {
        if (!active) return;
        const value = appErrorUrl(
          reason instanceof Error
            ? reason.message
            : "Desktop sign-in could not be completed.",
        );
        setCallbackUrl(value);
        clearPending();
        window.location.replace(value);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!callbackUrl) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      style={{
        position: "fixed",
        zIndex: 2147483647,
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f6f8",
      }}
    >
      <section
        style={{
          width: "min(440px, 100%)",
          padding: 32,
          border: "1px solid #dde2e7",
          borderRadius: 18,
          background: "white",
          boxShadow: "0 24px 70px #17202a24",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: "0 0 10px" }}>Returning to QaziPRO POS</h1>
        <p style={{ color: "#69727c" }}>
          Google sign-in is complete. Allow the browser to open the QaziPRO POS
          Desktop app.
        </p>
        <a
          href={callbackUrl}
          style={{
            display: "inline-flex",
            marginTop: 10,
            padding: "13px 20px",
            borderRadius: 10,
            background: "#050505",
            color: "white",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Open QaziPRO POS
        </a>
      </section>
    </div>
  );
}
