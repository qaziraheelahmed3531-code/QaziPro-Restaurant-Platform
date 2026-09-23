"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global { interface Window { plausible?: (event: string, options?: { props?: Record<string,string> }) => void } }

export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  useEffect(() => {
    if (!domain) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      const name = href.startsWith("https://wa.me/") ? "WhatsApp Click" : href.includes("book-a-demo") ? "Book Demo" : href.includes("get-a-quote") ? "Quote Start" : href.includes("portal") ? "Client Login" : "";
      if (name) window.plausible?.(name, { props: { page: location.pathname } });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [domain]);
  if (!domain) return null;
  return <Script defer data-domain={domain} src="https://plausible.io/js/script.js" strategy="afterInteractive"/>;
}
