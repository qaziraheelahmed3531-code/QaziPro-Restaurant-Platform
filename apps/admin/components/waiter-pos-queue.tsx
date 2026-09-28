"use client";

import {
  Banknote,
  Check,
  ChevronDown,
  Clock3,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatPkr } from "@italian-pizza/shared";
import { AppLoader } from "@italian-pizza/shared/app-loader";
import { createClient } from "@/lib/supabase/client";

export type WaiterPosOrder = {
  id: string;
  order_number: string;
  token_number: number;
  table_reference: string | null;
  waiter_name: string | null;
  customer_name: string;
  order_notes: string | null;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    line_total: number;
    order_item_modifiers: Array<{ group_name: string; option_name: string }>;
  }>;
};

export function WaiterPosQueue({
  businessId,
  branchId,
  shift,
  initialOrders,
}: {
  businessId: string;
  branchId: string;
  shift: { id: string } | null;
  initialOrders: WaiterPosOrder[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState<string | null>(null);
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const settlingRef = useRef(false);
  useEffect(() => {
    const client = createClient();
    let disposed = false;
    let fetching = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (disposed || fetching || settlingRef.current || !navigator.onLine)
        return;
      fetching = true;
      try {
        const { data, error } = await client
          .from("orders")
          .select(
            "id,order_number,token_number,table_reference,waiter_name,customer_name,order_notes,total,status,payment_status,created_at,order_items(id,product_name,quantity,line_total,order_item_modifiers(group_name,option_name))",
          )
          .eq("business_id", businessId)
          .eq("branch_id", branchId)
          .eq("service_mode", "DINE_IN")
          .eq("payment_status", "UNPAID")
          .neq("status", "CANCELLED")
          .order("created_at")
          .abortSignal(AbortSignal.timeout(12000));
        if (!disposed && !error) setOrders((data ?? []) as WaiterPosOrder[]);
      } finally {
        fetching = false;
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh().catch(() => undefined), 150);
    };
    const channel = client
      // Unsubscribe is asynchronous. A refresh/Suspense reattachment must not
      // reuse the still-leaving channel and add callbacks after subscribe().
      .channel(`waiter-pos-queue-${branchId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchId}`,
        },
        schedule,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") schedule();
      });
    const recover = () => {
      if (document.visibilityState === "visible") schedule();
    };
    const fallback = setInterval(recover, 60000);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
      void client.removeChannel(channel);
    };
  }, [businessId, branchId]);
  if (!orders.length && !message) return null;
  const settle = async (order: WaiterPosOrder) => {
    if (settlingRef.current) return;
    if (!shift) {
      setMessage("Open your register shift before collecting a table payment.");
      return;
    }
    if (!navigator.onLine) {
      setMessage(
        "Reconnect before collecting payment. This bill is still saved.",
      );
      return;
    }
    const received = Math.round(Number(cash) || 0);
    if (received < order.total) {
      setMessage("Cash received is less than the order total.");
      return;
    }
    settlingRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await createClient()
        .rpc("settle_waiter_pos_order", {
          p_order_id: order.id,
          p_shift_id: shift.id,
          p_cash_received: received,
        })
        .abortSignal(AbortSignal.timeout(20000));
      if (error) {
        setMessage(
          "Payment could not be confirmed. Check this same bill before collecting cash again; retry is duplicate-safe.",
        );
        return;
      }
      const result = data as { change: number };
      setOrders((rows) => rows.filter((row) => row.id !== order.id));
      setSelected(null);
      setCash("");
      setMessage(
        `${order.order_number} paid. Change ${formatPkr(Number(result.change))}.`,
      );
    } catch {
      setMessage(
        "Payment could not be confirmed. Reconnect and retry the same bill; do not collect cash twice.",
      );
    } finally {
      settlingRef.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="waiter-pos-queue no-print">
      <header>
        <div>
          <span className="eyebrow">LIVE TABLE SERVICE</span>
          <h2>Table payments</h2>
          <p>
            QR and waiter table orders use the same operational bill. Collect
            payment here.
          </p>
        </div>
        <b>{orders.length} awaiting payment</b>
      </header>
      {message && (
        <p
          className={`inline-notice ${message.includes("paid.") ? "" : "is-error"}`}
          role="status"
        >
          {message}
        </p>
      )}
      <div className="waiter-pos-cards">
        {orders.map((order) => {
          const open = selected === order.id;
          return (
            <article key={order.id}>
              <button
                className="waiter-pos-summary"
                disabled={busy}
                onClick={() => {
                  setSelected(open ? null : order.id);
                  setCash(open ? "" : String(order.total));
                }}
              >
                <span>
                  <small>TABLE</small>
                  <strong>{order.table_reference ?? "Guest"}</strong>
                </span>
                <span>
                  <small>WAITER</small>
                  <strong>{order.waiter_name ?? "QR / guest"}</strong>
                </span>
                <span>
                  <small>ORDER / TOKEN</small>
                  <strong>
                    {order.order_number} ·{" "}
                    {String(order.token_number).padStart(3, "0")}
                  </strong>
                </span>
                <span>
                  <small>TOTAL</small>
                  <strong>{formatPkr(Number(order.total))}</strong>
                </span>
                <ChevronDown className={open ? "is-open" : ""} />
              </button>
              {open && (
                <div className="waiter-pos-detail">
                  <div className="waiter-pos-items">
                    {order.order_items.map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>
                            {item.quantity}× {item.product_name}
                          </strong>
                          {item.order_item_modifiers.map((option) => (
                            <small key={`${item.id}-${option.option_name}`}>
                              {option.group_name}: {option.option_name}
                            </small>
                          ))}
                        </span>
                        <b>{formatPkr(Number(item.line_total))}</b>
                      </div>
                    ))}
                    {order.order_notes && (
                      <p>
                        <UtensilsCrossed />
                        {order.order_notes}
                      </p>
                    )}
                  </div>
                  <div className="waiter-pos-payment">
                    <span>
                      <Clock3 />
                      {new Date(order.created_at).toLocaleTimeString("en-PK", {
                        timeZone: "Asia/Karachi",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · Kitchen: {order.status.replaceAll("_", " ")}
                    </span>
                    <label>
                      Cash received
                      <input
                        type="number"
                        disabled={busy}
                        min={0}
                        value={cash}
                        onChange={(event) => setCash(event.target.value)}
                      />
                    </label>
                    <button
                      className="button button--outline"
                      disabled={busy}
                      onClick={() => setCash(String(order.total))}
                    >
                      <Banknote />
                      Exact cash
                    </button>
                    <button
                      className="button"
                      disabled={busy || !shift}
                      onClick={() => void settle(order)}
                    >
                      {busy ? (
                        <AppLoader active delay={0} label="Recording payment" />
                      ) : (
                        <Check />
                      )}
                      {busy ? "Saving…" : "Mark paid"}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
