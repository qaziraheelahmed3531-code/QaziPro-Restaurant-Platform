"use client";

import { usePathname } from "next/navigation";
import { siWhatsapp } from "simple-icons";
import { whatsappLink } from "@/lib/site";

export function WhatsappLink() {
  const pathname = usePathname();
  const subject = pathname.startsWith("/restaurant") || pathname === "/online-ordering" || pathname === "/multi-branch"
    ? "the QaziPro restaurant platform"
    : pathname.includes("shopify")
      ? "a Shopify project"
      : pathname === "/full-stack-development"
        ? "a custom software project"
        : "a QaziPro project";
  return <a className="whatsapp-link" href={whatsappLink(subject)} aria-label="Chat with QaziPro on WhatsApp" target="_blank" rel="noopener noreferrer" data-cursor="CHAT"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={siWhatsapp.path}/></svg></a>;
}
