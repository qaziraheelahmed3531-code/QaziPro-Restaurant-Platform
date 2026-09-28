"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminError } from "@/lib/admin-errors";
export function PosShiftStart({ branchId }: { branchId: string }) {
  const [cash, setCash] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const lock = useRef(false);
  return (
    <form
      className="panel section-gap"
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        const amount = Number(cash);
        if (!Number.isSafeInteger(amount) || amount < 0) {
          setError("Enter a whole, non-negative opening cash amount.");
          return;
        }
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          const result = await createClient()
            .rpc("open_pos_shift", {
              p_branch_id: branchId,
              p_opening_cash: amount,
            })
            .abortSignal(AbortSignal.timeout(15000));
          if (result.error) setError(adminError(result.error));
          else router.refresh();
        } catch {
          setError(
            "Your shift could not be confirmed. Refresh to check before retrying.",
          );
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <h2>Start your counter shift</h2>
      <p>
        Enter cash already in your drawer. Full register reconciliation remains
        restricted to staff with Register access.
      </p>
      <label>
        Opening cash (PKR)
        <input
          required
          disabled={busy}
          type="number"
          min="0"
          step="1"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </label>
      <button className="button" disabled={busy}>
        {busy ? "Opening shift…" : "Open my counter shift"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
