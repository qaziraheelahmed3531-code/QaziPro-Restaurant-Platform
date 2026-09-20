"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PENDING_KEY = "desktop-pos-oauth-pending-at";

export default function DesktopPosAuthPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const pendingAt = String(Date.now());
        window.localStorage.setItem(PENDING_KEY, pendingAt);
        document.cookie = `${PENDING_KEY}=${pendingAt}; Max-Age=900; Path=/; SameSite=Lax`;
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("next", "/desktop-pos-auth/complete");
        const { data, error: oauthError } =
          await createClient().auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: callback.toString(),
              skipBrowserRedirect: true,
              queryParams: { prompt: "select_account" },
            },
          });
        if (oauthError || !data.url)
          throw oauthError ?? new Error("Google sign-in could not start.");
        window.location.replace(data.url);
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to start POS sign-in.",
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
          {error ? "QaziPRO sign-in could not start" : "Opening Google sign-in…"}
        </h1>
        <p style={{ color: error ? "#b42318" : "#69727c" }}>
          {error ||
            "Choose the invited staff account. You will return to QaziPRO POS automatically."}
        </p>
      </section>
    </main>
  );
}
