"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";

export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <section className="state-box" role="alert" aria-labelledby="dashboard-load-error">
    <h2 id="dashboard-load-error">This page couldn&apos;t be loaded</h2>
    <p>Try again to load the latest data. If a save was in progress, check its status before repeating it.</p>
    <button className="button button--outline" type="button" disabled={pending} onClick={() => startTransition(retry)}>
      <RefreshCw aria-hidden="true" />{pending ? "Retrying…" : "Try again"}
    </button>
  </section>;
}
