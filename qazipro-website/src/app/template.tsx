"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";

export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="route-transition" key={pathname}><div className="route-curtain" aria-hidden="true"><Image src="/brand/qazipro-mark-clean.png" width={720} height={413} sizes="150px" alt="" loading="eager" style={{ height: "auto" }}/><span>QaziPro</span></div>{children}</div>;
}
