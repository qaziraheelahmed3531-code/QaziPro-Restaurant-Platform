"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function StoreStatusControl({ businessId, branchId, branchName, temporarilyClosed, onlineEnabled, canManage, onChanged }: {
  businessId: string;
  branchId: string | null;
  branchName: string;
  temporarilyClosed: boolean;
  onlineEnabled: boolean;
  canManage: boolean;
  onChanged: (closed: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!branchId) return null;
  const paused = temporarilyClosed || !onlineEnabled;
  async function toggle() {
    if (!branchId || !canManage || busy || !onlineEnabled) return;
    const closing = !temporarilyClosed;
    if (!window.confirm(`${closing ? "Pause" : "Resume"} online ordering for ${branchName}? ${closing ? "Customers will not be able to place new online orders for this branch." : "Configured opening hours will still apply."}`)) return;
    setBusy(true);
    setError("");
    const { data, error: updateError } = await createClient().from("branches")
      .update({ temporarily_closed: closing }).eq("business_id", businessId).eq("id", branchId)
      .select("id,temporarily_closed").maybeSingle();
    setBusy(false);
    if (updateError || !data) { setError("Store status could not be changed. Please retry or check your access."); return; }
    onChanged(Boolean(data.temporarily_closed));
    router.refresh();
  }
  return <div className="store-status-control">
    <button type="button" className={`store-status-control__button ${paused ? "is-paused" : "is-enabled"}`}
      aria-label={`Online ordering ${paused ? "paused" : "enabled"} for ${branchName}`}
      title={!onlineEnabled ? "Online ordering is disabled in Branch settings." : "Opening hours still apply to online orders."}
      disabled={busy || !canManage || !onlineEnabled} onClick={() => void toggle()}>
      <span aria-hidden="true" />{busy ? "Updating…" : paused ? "Orders paused" : "Orders enabled"}
    </button>
    {error && <p role="alert" className="store-status-control__error">{error}</p>}
  </div>;
}
