"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/providers/app-provider";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
type ServiceRequestType = "CALL_WAITER" | "REQUEST_BILL";

export function TableContextBanner() {
  const { storefront } = useApp();
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientReady,
    serverReady,
  );
  const [confirm, setConfirm] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pendingType, setPendingType] = useState<ServiceRequestType | null>(null);
  const [sentType, setSentType] = useState<ServiceRequestType | null>(null);
  const [callState, setCallState] = useState<"idle" | "sent" | "error">("idle");
  const [callError, setCallError] = useState("");
  const callPending = useRef(false);
  useEffect(() => {
    if (callState !== "sent") return;
    const timer = window.setTimeout(() => {
      setCallState("idle");
      setSentType(null);
    }, 120_000);
    return () => window.clearTimeout(timer);
  }, [callState]);
  if (!storefront.tableContext) return null;
  async function requestService(requestType: ServiceRequestType) {
    if (callPending.current || sentType === requestType) return;
    callPending.current = true;
    setPendingType(requestType);
    setCallState("idle");
    setCallError("");
    try {
      const response = await fetch("/api/table-call-waiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType }),
        signal: AbortSignal.timeout(12_000),
      });
      const result = (await response.json()) as {
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        setCallError(
          result.error || "We couldn't call a waiter. Please try again.",
        );
        setCallState("error");
        return;
      }
      if (
        !result.status ||
        !["PENDING", "ACKNOWLEDGED"].includes(result.status)
      )
        throw new Error("Request not confirmed");
      setSentType(requestType);
      setCallState("sent");
    } catch {
      setCallError(
        "We couldn't confirm your request. Check your connection and try again.",
      );
      setCallState("error");
    } finally {
      callPending.current = false;
      setPendingType(null);
    }
  }
  return (
    <section className="table-context-banner" aria-label="Your dining table">
      <div>
        <small>DINING AT</small>
        <strong>{storefront.tableContext.name}</strong>
        <span>{storefront.branch.name}</span>
      </div>
      {storefront.tableContext.waiterCallEnabled && (
        <div className="table-context-call">
          <button
            type="button"
            disabled={!ready || pendingType !== null || sentType === "CALL_WAITER"}
            onClick={() => void requestService("CALL_WAITER")}
          >
            {pendingType === "CALL_WAITER"
              ? "Calling…"
              : sentType === "CALL_WAITER"
                ? "Waiter requested"
                : "Call a waiter"}
          </button>
          <button
            type="button"
            disabled={!ready || pendingType !== null || sentType === "REQUEST_BILL"}
            onClick={() => void requestService("REQUEST_BILL")}
          >
            {pendingType === "REQUEST_BILL"
              ? "Requesting…"
              : sentType === "REQUEST_BILL"
                ? "Bill requested"
                : "Request bill"}
          </button>
          {callState === "error" && <span role="alert">{callError}</span>}
          <span role="status" className="sr-only">
            {callState === "sent"
              ? `${sentType === "REQUEST_BILL" ? "Bill" : "Waiter"} request sent to the waiter app.`
              : ""}
          </span>
        </div>
      )}
      {confirm ? (
        <form
          action="/api/table-context"
          method="post"
          onSubmit={() => setLeaving(true)}
        >
          <p>Your table cart stays saved separately.</p>
          <button type="submit" disabled={leaving}>
            {leaving ? "Leaving…" : "Leave dine-in"}
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={() => setConfirm(false)}
          >
            Keep table
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setConfirm(true)}>
          Change order mode
        </button>
      )}
    </section>
  );
}
