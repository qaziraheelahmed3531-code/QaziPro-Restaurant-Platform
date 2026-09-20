"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DesktopPosAuthCompletePage() {
  const [deepLink, setDeepLink] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session)
          throw (
            sessionError ?? new Error("Google did not create a secure session.")
          );
        const response = await fetch("/api/desktop-pos-auth/exchange", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        const result = (await response.json().catch(() => ({}))) as {
          tokenHash?: string;
          error?: string;
        };
        if (!response.ok || !result.tokenHash)
          throw new Error(
            result.error ?? "Desktop sign-in could not be completed.",
          );
        // Keep the original scheme for already-installed copies. New installers
        // register both this legacy scheme and the branded qazipro-pos scheme.
        const callback = new URL("italianpizza-pos://auth/callback");
        callback.searchParams.set("token_hash", result.tokenHash);
        if (!active) return;
        setDeepLink(callback.toString());
        window.location.replace(callback.toString());
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Desktop sign-in could not be completed.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
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
        aria-live="polite"
        style={{
          width: "min(440px, 100%)",
          padding: 32,
          border: "1px solid #dde2e7",
          borderRadius: 18,
          background: "white",
          textAlign: "center",
        }}
      >
        <Image
          src="/qazipro-logo.png"
          alt="QaziPRO logo"
          width={96}
          height={96}
          priority
          style={{ objectFit: "contain" }}
        />
        <h1>
          {error ? "Could not return to QaziPRO POS" : "Google sign-in complete"}
        </h1>
        <p style={{ color: error ? "#b42318" : "#69727c" }}>
          {error || "Opening the QaziPRO POS Desktop app…"}
        </p>
        {deepLink ? (
          <a
            href={deepLink}
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
        ) : null}
      </section>
    </main>
  );
}
