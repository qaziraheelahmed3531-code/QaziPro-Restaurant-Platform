"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Product = { id: string; name: string; is_available: boolean; is_active: boolean };
type Notice = { kind: "success" | "error"; text: string };

export function ProductAvailability({ businessId, products, onUpdated }: {
  businessId: string;
  products: Product[];
  onUpdated: (id: string, available: boolean) => void;
}) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const rows = products.filter(row => row.is_active);

  async function toggle(row: Product) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingId(row.id);
    setNotice(null);
    let saved = false;
    try {
      // RLS remains authoritative; expected state avoids overwriting a concurrent change.
      const { data, error } = await createClient().from("products")
        .update({ is_available: !row.is_available })
        .eq("business_id", businessId).eq("id", row.id)
        .eq("is_active", true).eq("is_available", row.is_available)
        .select("id,is_available").maybeSingle();
      if (error) {
        setNotice({ kind: "error", text: "Availability could not be saved. Check your access and try again." });
        return;
      }
      if (!data) {
        setNotice({ kind: "error", text: "This product changed or is no longer editable. Refresh the menu before trying again." });
        router.refresh();
        return;
      }
      saved = true;
      onUpdated(data.id, data.is_available);
      const response = await fetch("/api/revalidate-customer", { method: "POST" });
      const result = await response.json();
      if (!response.ok || result.revalidated !== true) {
        setNotice({ kind: "error", text: "Availability saved. Customer website refresh is not confirmed; check storefront sync before making another change." });
      } else {
        setNotice({ kind: "success", text: `${row.name} is now ${data.is_available ? "available" : "out of stock"}.` });
      }
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: saved
        ? "Availability saved, but website refresh could not be confirmed. Refresh the menu to check the latest state."
        : "Connection interrupted. Refresh the menu to check whether the change was saved before retrying." });
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  return <section className="panel" aria-labelledby="quick-availability-title">
    <div className="panel-header"><div><h2 id="quick-availability-title">Quick availability</h2><p>Mark products in or out of stock without opening the full editor.</p></div></div>
    {notice && <p className={`inline-notice ${notice.kind === "error" ? "is-error" : ""}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</p>}
    <div className="availability-grid">{rows.map(row =>
      <button type="button" key={row.id} className={row.is_available ? "is-on" : "is-off"}
        aria-pressed={row.is_available} aria-busy={pendingId === row.id}
        aria-label={`${row.name}: ${row.is_available ? "in stock" : "out of stock"}`}
        disabled={Boolean(pendingId)} onClick={() => void toggle(row)}>
        <span>{row.name}</span><b>{pendingId === row.id ? "UPDATING…" : row.is_available ? "IN STOCK" : "OUT OF STOCK"}</b><i aria-hidden="true" />
      </button>)}
      {!rows.length && <div className="empty-panel compact">No active products. Add or activate a product to manage availability.</div>}
    </div>
  </section>;
}
