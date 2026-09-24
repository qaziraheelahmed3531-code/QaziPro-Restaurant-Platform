"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial load starts the realtime/polling synchronization */

import Link from "next/link";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Printer, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatPkr,
  nextOrderStatuses,
  type OrderStatus,
} from "@italian-pizza/shared";
import { AppLoader } from "@italian-pizza/shared/app-loader";
import { ReceiptBatch } from "@/components/receipt-batch";
import { type ReceiptData } from "@/components/receipt-document";
import { createBrowserPrintAdapter } from "@/lib/printing";
import { createClient } from "@/lib/supabase/client";

type Modifier = {
  id: string;
  group_name: string;
  option_name: string;
  price_adjustment: number;
};
type Item = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  order_item_modifiers: Modifier[];
};
type History = {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
};
type LocationSnapshot = {
  restaurantName?: string;
  branchName?: string;
  branchAddress?: string;
  branchCity?: string;
  deliveryAreaName?: string;
  deliveryCity?: string;
  customerAddress?: string;
};
type Order = {
  id: string;
  order_number: string;
  token_number: number;
  channel: string;
  operational_order_type: string;
  waiter_id: string | null;
  waiter_name: string | null;
  rider_id: string | null;
  rider_name: string | null;
  table_reference: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  service_mode: string;
  status: OrderStatus;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  delivery_area_name: string | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  order_notes: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  tax: number;
  total: number;
  created_at: string;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  delivery_failed_at: string | null;
  delivery_failure_reason: string | null;
  location_snapshot: LocationSnapshot | null;
  order_items: Item[];
  order_status_history: History[];
  pos_order_replacements: Array<{ id: string }>;
  branches: { name: string } | Array<{ name: string }> | null;
};
type View = "ALL" | "NEW" | "ACTIVE" | "READY" | "COMPLETED" | "CANCELLED";
type ViewCounts = Record<View, number | null>;
const initialViewCounts: ViewCounts = {
  ALL: null,
  NEW: null,
  ACTIVE: null,
  READY: null,
  COMPLETED: null,
  CANCELLED: null,
};
const browserPrinter = createBrowserPrintAdapter();
const statusForView: Record<View, OrderStatus[] | null> = {
  ALL: null,
  NEW: ["RECEIVED"],
  ACTIVE: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"],
  READY: ["READY"],
  COMPLETED: ["DELIVERED"],
  CANCELLED: ["CANCELLED"],
};
const select =
  "id,order_number,token_number,channel,operational_order_type,waiter_id,waiter_name,rider_id,rider_name,table_reference,customer_name,customer_phone,customer_email,service_mode,status,payment_method,payment_status,payment_reference,delivery_area_name,delivery_address,delivery_instructions,latitude,longitude,order_notes,subtotal,discount,delivery_fee,tax,total,created_at,confirmed_at,preparing_at,ready_at,delivered_at,delivery_failed_at,delivery_failure_reason,location_snapshot,order_items(id,product_name,quantity,unit_price,line_total,order_item_modifiers(id,group_name,option_name,price_adjustment)),order_status_history(id,status,note,created_at),pos_order_replacements(id),branches(name)";
export function OrdersManager({
  canEdit,
  canPrint,
  canInvoice,
  canReplacePos,
  canConfigureReplacement,
  replacementWindowMinutes: initialReplacementWindowMinutes,
  riderPortalEnabled,
  businessId,
  branchId,
  initialStatus,
  focusedOrderId,
  businessName,
  printSettings,
}: {
  canEdit: boolean;
  canPrint: boolean;
  canInvoice: boolean;
  canReplacePos: boolean;
  canConfigureReplacement: boolean;
  replacementWindowMinutes: number;
  riderPortalEnabled: boolean;
  businessName: string;
  printSettings: {
    logo_url?: string | null;
    receipt_width_mm: number;
    receipt_footer: string;
    show_prices_on_kitchen_ticket: boolean;
    copies: number;
  } | null;
  businessId: string;
  branchId?: string;
  initialStatus?: string;
  focusedOrderId?: string;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewCounts, setViewCounts] = useState<ViewCounts>(initialViewCounts);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(initialStatus ? "ALL" : "NEW");
  const [channelFilter, setChannel] = useState("ALL");
  const [selected, setSelected] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState<"live" | "polling">("polling");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [clock, setClock] = useState<number | null>(null);
  const [alert, setAlert] = useState<Order | null>(null);
  const [replacementWindowMinutes, setReplacementWindowMinutes] = useState(
    initialReplacementWindowMinutes,
  );
  const [replacementWindowDraft, setReplacementWindowDraft] = useState(
    String(initialReplacementWindowMinutes),
  );
  const [replacementSettingsBusy, setReplacementSettingsBusy] = useState(false);
  const [replacementSettingsMessage, setReplacementSettingsMessage] = useState("");
  const knownIds = useRef(new Set<string>());
  const hasLoaded = useRef(false);
  const selectedId = useRef<string | null>(null);
  useEffect(() => {
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const saveReplacementWindow = async () => {
    const minutes = Number(replacementWindowDraft);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setReplacementSettingsMessage("Enter a whole number from 1 to 1440 minutes.");
      return;
    }
    setReplacementSettingsBusy(true);
    setReplacementSettingsMessage("");
    const { error: settingsError } = await createClient()
      .from("business_operating_settings")
      .upsert({
        business_id: businessId,
        pos_replacement_window_minutes: minutes,
      });
    if (settingsError) {
      setReplacementSettingsMessage("Unable to save the replacement window. Please try again.");
    } else {
      setReplacementWindowMinutes(minutes);
      setReplacementSettingsMessage(`POS replacement window saved as ${minutes} minutes.`);
    }
    setReplacementSettingsBusy(false);
  };
  useEffect(() => {
    selectedId.current = selected?.id ?? null;
  }, [selected]);
  const load = useCallback(
    async (announce = false) => {
      let request = createClient()
        .from("orders")
        .select(select)
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (branchId) request = request.eq("branch_id", branchId);
      if (statusForView[view])
        request = request.in("status", statusForView[view]!);
      if (initialStatus && view === "ALL")
        request = request.eq("status", initialStatus);
      if (channelFilter !== "ALL")
        request = request.eq("channel", channelFilter);
      if (paymentFilter !== "ALL")
        request = request.eq("payment_status", paymentFilter);
      if (dateFilter) {
        const start = new Date(dateFilter + "T00:00:00+05:00");
        request = request
          .gte("created_at", start.toISOString())
          .lt("created_at", new Date(start.getTime() + 86400000).toISOString());
      }
      const term = query.trim().replace(/[^a-zA-Z0-9 +@.-]/g, "");
      if (term)
        request = request.or(
          `order_number.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,waiter_name.ilike.%${term}%,rider_name.ilike.%${term}%,table_reference.ilike.%${term}%${/^\d+$/.test(term) ? ",token_number.eq." + Number(term) : ""}`,
        );
      const { data, error: loadError } = await request.range(
        page * 50,
        page * 50 + 50,
      );
      setHasMore((data?.length ?? 0) > 50);
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      const next = (data ?? []).slice(0, 50) as Order[];
      const fresh = next.find((order) => !knownIds.current.has(order.id));
      if (
        announce &&
        fresh &&
        fresh.status === "RECEIVED" &&
        hasLoaded.current
      ) {
        setAlert(fresh);
      }
      knownIds.current = new Set(next.map((order) => order.id));
      setOrders(next);
      hasLoaded.current = true;
      if (selectedId.current) {
        const detail = await createClient()
          .from("orders")
          .select(select)
          .eq("id", selectedId.current)
          .eq("business_id", businessId)
          .single();
        if (detail.data)
          setSelected((current) =>
            current?.id === detail.data.id ? (detail.data as Order) : current,
          );
      }
      setLoading(false);
      setError("");
    },
    [
      businessId,
      branchId,
      initialStatus,
      view,
      channelFilter,
      paymentFilter,
      dateFilter,
      query,
      page,
    ],
  );
  useEffect(() => {
    if (!focusedOrderId) return
    void createClient().from("orders").select(select).eq("business_id",businessId).eq("id",focusedOrderId).maybeSingle().then(({data})=>{if(data){setView("ALL");setSelected(data as Order)}})
  }, [businessId, focusedOrderId])
  const loadViewCounts = useCallback(async () => {
    const count = (statuses?: OrderStatus[]) => {
      let request = createClient()
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId);
      if (branchId) request = request.eq("branch_id", branchId);
      if (statuses?.length) request = request.in("status", statuses);
      return request;
    };
    const [all, received, active, ready, completed, cancelled] =
      await Promise.all([
        count(),
        count(["RECEIVED"]),
        count(["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"]),
        count(["READY"]),
        count(["DELIVERED"]),
        count(["CANCELLED"]),
      ]);
    if ([all, received, active, ready, completed, cancelled].some((result) => result.error)) return;
    setViewCounts({
      ALL: all.count ?? 0,
      NEW: received.count ?? 0,
      ACTIVE: active.count ?? 0,
      READY: ready.count ?? 0,
      COMPLETED: completed.count ?? 0,
      CANCELLED: cancelled.count ?? 0,
    });
  }, [branchId, businessId]);
  useEffect(() => {
    void load();
    void loadViewCounts();
    const reconcile = () => {
      void load(true);
      void loadViewCounts();
    };
    const timer = window.setInterval(reconcile, 15000);
    const supabase = createClient();
    const channel = supabase
      .channel(`orders-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        reconcile,
      )
      .subscribe((status) =>
        setConnection(status === "SUBSCRIBED" ? "live" : "polling"),
      );
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [businessId, load, loadViewCounts]);
  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(null), 7000);
    return () => window.clearTimeout(timer);
  }, [alert]);
  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const allowed = statusForView[view];
        if (allowed && !allowed.includes(order.status)) return false;
        if (channelFilter !== "ALL" && order.channel !== channelFilter)
          return false;
        const needle = query.trim().toLowerCase();
        return (
          !needle ||
          [
            order.order_number,
            String(order.token_number),
            order.customer_name,
            order.customer_phone,
            order.waiter_name,
            order.rider_name,
            order.table_reference,
          ].some((value) => String(value).toLowerCase().includes(needle))
        );
      }),
    [channelFilter, orders, query, view],
  );
  const updateStatus = async (orderId: string, status: OrderStatus) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Order status could not be updated.");
      if (result.emailStatus === "FAILED")
        setError(
          "Order was confirmed, but the confirmation email could not be sent. It is recorded for retry.",
        );
      await load();
      await loadViewCounts();
      setSelected((current) =>
        current?.id === orderId ? { ...current, status } : current,
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Order status could not be updated.",
      );
    } finally {
      setSaving(false);
    }
  };
  const change = async (status: OrderStatus) => {
    if (!selected) return;
    await updateStatus(selected.id, status);
  };
  const printOrder = async (cached: Order, kind: "customer" | "kitchen") => {
    if (!canPrint) return;
    const { data, error: printError } = await createClient()
      .from("orders")
      .select(select)
      .eq("id", cached.id)
      .eq("business_id", businessId)
      .single();
    if (printError || !data) {
      setError("The receipt could not be loaded. Please retry.");
      return;
    }
    const order = data as Order;
    const branch = Array.isArray(order.branches)
      ? order.branches[0]
      : order.branches;
    const snapshot = order.location_snapshot;
    flushSync(() =>
      setReceipt({
        businessName: snapshot?.restaurantName ?? businessName,
        logoUrl: printSettings?.logo_url,
        branchName: snapshot?.branchName ?? branch?.name ?? "Restaurant",
        orderNumber: order.order_number,
        tokenNumber: order.token_number,
        createdAt: order.created_at,
        orderType: order.operational_order_type ?? order.service_mode,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryAddress:
          snapshot?.customerAddress ?? order.delivery_address ?? undefined,
        deliveryInstructions: order.delivery_instructions ?? undefined,
        subtotal: order.subtotal,
        discount: order.discount,
        deliveryFee: order.delivery_fee,
        tax: order.tax,
        total: order.total,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        lines: order.order_items.map((item) => ({
          name: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          options: item.order_item_modifiers.map(
            (mod) => `${mod.group_name}: ${mod.option_name}`,
          ),
          notes: order.order_notes ?? undefined,
        })),
        footer:
          printSettings?.receipt_footer ??
          `Thank you for ordering from ${snapshot?.restaurantName ?? businessName}.`,
        width: printSettings?.receipt_width_mm === 58 ? 58 : 80,
        kind,
        showPrices: printSettings?.show_prices_on_kitchen_ticket ?? false,
      }),
    );
    await browserPrinter.print({
      kind: kind === "kitchen" ? "kitchen-ticket" : "customer-receipt",
      paperWidth: printSettings?.receipt_width_mm === 58 ? "58mm" : "80mm",
      copies: 1,
    });
  };
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">ORDER OPERATIONS</span>
          <h1>Orders</h1>
          <p>
            Incoming website and counter orders with legal workflow transitions
            and live updates.
          </p>
        </div>
        <div className={`connection-pill is-${connection}`}>
          {connection === "live" ? "Realtime connected" : "Polling every 15s"}
          <button onClick={() => void load()}>
            <RefreshCw />
          </button>
        </div>
      </div>
      {canConfigureReplacement && (
        <section className="pos-replacement-setting no-print" aria-labelledby="pos-replacement-setting-title">
          <div>
            <strong id="pos-replacement-setting-title">POS replacement time</strong>
            <small>Recent counter orders can be changed before kitchen preparation starts.</small>
          </div>
          <label>
            <span>Minutes</span>
            <input
              aria-label="POS replacement window in minutes"
              type="number"
              min="1"
              max="1440"
              step="1"
              value={replacementWindowDraft}
              onChange={(event) => setReplacementWindowDraft(event.target.value)}
            />
          </label>
          <button
            className="button button--outline"
            disabled={replacementSettingsBusy}
            onClick={() => void saveReplacementWindow()}
          >
            {replacementSettingsBusy ? <AppLoader active delay={0} label="Saving replacement time" /> : null}
            {replacementSettingsBusy ? "Saving…" : "Save time"}
          </button>
          {replacementSettingsMessage && <p role="status">{replacementSettingsMessage}</p>}
        </section>
      )}
      {alert && (
        <aside className="new-order-alert no-print" role="status">
          <div>
            <strong>
              NEW ORDER · {alert.order_number} · Token {alert.token_number}
            </strong>
            <p>
              {alert.customer_name} ·{" "}
              {alert.delivery_area_name ?? alert.service_mode} ·{" "}
              {formatPkr(alert.total)} · {alert.payment_status}
            </p>
          </div>
          <div>
            {canEdit && alert.status === "RECEIVED" && (
              <button
                className="button"
                disabled={saving}
                onClick={async () => {
                  await updateStatus(alert.id, "CONFIRMED");
                  setAlert(null);
                }}
              >
                Confirm
              </button>
            )}
            {canPrint && (
              <button
                className="button button--outline"
                onClick={() => void printOrder(alert, "customer")}
              >
                Print Receipt
              </button>
            )}
            <button
              className="button button--outline"
              onClick={() => {
                setSelected(alert);
                setAlert(null);
              }}
            >
              Open
            </button>
            <button
              className="icon-action"
              aria-label="Dismiss new order"
              onClick={() => setAlert(null)}
            >
              <X />
            </button>
          </div>
        </aside>
      )}
      <div className="order-view-tabs no-print">
        {(
          ["NEW", "ACTIVE", "READY", "COMPLETED", "CANCELLED", "ALL"] as View[]
        ).map((item) => (
          <button
            key={item}
            className={view === item ? "is-active" : ""}
            onClick={() => {
              setView(item);
              setPage(0);
            }}
          >
            {item}
            <span>
              {viewCounts[item] ?? "…"}
            </span>
          </button>
        ))}
      </div>
      <div className="resource-toolbar no-print">
        <label className="search-field">
          <Search />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Order, token, customer, waiter or table"
          />
        </label>
        <select
          className="button button--outline"
          value={channelFilter}
          onChange={(event) => {
            setChannel(event.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">All channels</option>
          <option value="WEBSITE">Website</option>
          <option value="POS">Counter POS</option>
        </select>
        <input
          aria-label="Filter order date"
          type="date"
          value={dateFilter}
          onChange={(event) => {
            setDateFilter(event.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Payment status"
          className="button button--outline"
          value={paymentFilter}
          onChange={(event) => {
            setPaymentFilter(event.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">All payments</option>
          {[
            "UNPAID",
            "PAID",
            "PENDING",
            "FAILED",
            "REFUNDED",
            "PARTIALLY_REFUNDED",
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="state-box state-box--loading" role="status"><AppLoader active delay={0} label="Loading orders"/><span>Loading orders…</span></div>
      ) : error ? (
        <div className="inline-notice is-error">{error}</div>
      ) : filtered.length ? (
        <div className="data-table-wrap no-print">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order / Token</th>
                <th>Customer</th>
                <th>Time</th>
                <th>Channel</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id}>
                  <td data-label="Order">
                    <strong>{order.order_number}</strong>
                    <small className="token-inline">
                      Token {String(order.token_number).padStart(3, "0")}
                    </small>
                  </td>
                  <td data-label="Customer">
                    {order.customer_name}
                    <small>{order.customer_phone}</small>
                    {order.waiter_id && (
                      <small>
                        Table {order.table_reference ?? "—"} · Waiter {order.waiter_name ?? "Staff"}
                      </small>
                    )}
                    {order.rider_id && <small>Rider {order.rider_name ?? "Assigned"}</small>}
                  </td>
                  <td data-label="Time">
                    {new Date(order.created_at).toLocaleString("en-PK", {
                      timeZone: "Asia/Karachi",
                    })}
                  </td>
                  <td data-label="Channel">
                    <span className="status-badge">{order.channel}</span>
                  </td>
                  <td data-label="Type">
                    {order.operational_order_type ?? order.service_mode}
                  </td>
                  <td data-label="Amount">{formatPkr(order.total)}</td>
                  <td data-label="Payment">{order.payment_status}</td>
                  <td data-label="Status">
                    <span
                      className={`status-badge status-${order.status.toLowerCase()}`}
                    >
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td data-label="Action">
                    <div className="table-actions">
                      <button
                        className="button button--outline"
                        onClick={() => setSelected(order)}
                      >
                        Open
                      </button>
                      {canPrint && (
                        <button
                          className="button button--outline"
                          onClick={() => printOrder(order, "customer")}
                        >
                          <Printer /> Print Receipt
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="state-box">No matching real orders.</div>
      )}
      <div className="heading-actions section-gap no-print">
        <button
          className="button button--outline"
          disabled={page === 0 || loading}
          onClick={() => setPage((value) => value - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button button--outline"
          disabled={!hasMore || loading}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
      <AnimatePresence>
        {selected && (
          <motion.div
            className="drawer-backdrop no-print"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="editor order-detail"
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-title"
              initial={{ x: 18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 18, opacity: 0 }}
            >
              <header>
                <div>
                  <small>
                    Token {String(selected.token_number).padStart(3, "0")} ·{" "}
                    {selected.channel}
                  </small>
                  <h2 id="order-title">{selected.order_number}</h2>
                </div>
                <button
                  className="icon-action"
                  onClick={() => setSelected(null)}
                  aria-label="Close order"
                >
                  <X />
                </button>
              </header>
              <div className="order-detail__body">
                <section>
                  <h3>Customer & fulfillment</h3>
                  <p>
                    <strong>{selected.customer_name}</strong>
                    <br />
                    {selected.customer_phone}
                    {selected.customer_email && (
                      <>
                        <br />
                        {selected.customer_email}
                      </>
                    )}
                  </p>
                  {selected.waiter_id && (
                    <p className="inline-notice">
                      <strong>Table {selected.table_reference ?? "—"}</strong>
                      <br />
                      Sent by waiter: {selected.waiter_name ?? "Staff member"}
                    </p>
                  )}
                  {selected.rider_id&&<p className="inline-notice"><strong>Assigned rider: {selected.rider_name??"Rider"}</strong><br/>Customer live GPS is available while this order is out for delivery.</p>}
                  {selected.delivery_failure_reason&&<p className="inline-notice is-error"><strong>Delivery failed</strong><br/>{selected.delivery_failure_reason}</p>}
                  <p>
                    {[
                      selected.delivery_area_name,
                      selected.delivery_address,
                      selected.delivery_instructions,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Counter / pickup"}
                  </p>
                </section>
                <section>
                  <h3>Items</h3>
                  {selected.order_items.map((item) => (
                    <div className="order-line" key={item.id}>
                      <span>
                        <strong>
                          {item.quantity}× {item.product_name}
                        </strong>
                        {item.order_item_modifiers.map((mod) => (
                          <small key={mod.id}>
                            {mod.group_name}: {mod.option_name}
                          </small>
                        ))}
                      </span>
                      <b>{formatPkr(item.line_total)}</b>
                    </div>
                  ))}
                </section>
                <section className="order-total-list">
                  <div>
                    <span>Subtotal</span>
                    <b>{formatPkr(selected.subtotal)}</b>
                  </div>
                  <div>
                    <span>Discount</span>
                    <b>−{formatPkr(selected.discount)}</b>
                  </div>
                  <div>
                    <span>Delivery</span>
                    <b>{formatPkr(selected.delivery_fee)}</b>
                  </div>
                  <div>
                    <span>Tax</span>
                    <b>{formatPkr(selected.tax)}</b>
                  </div>
                  <div>
                    <strong>Total</strong>
                    <b>{formatPkr(selected.total)}</b>
                  </div>
                </section>
                <section>
                  <h3>Status timeline</h3>
                  <ol className="compact-timeline">
                    {[...(selected.order_status_history ?? [])]
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .map((row) => (
                        <li key={row.id}>
                          <i />
                          <span>
                            <strong>{row.status.replaceAll("_", " ")}</strong>
                            <small>
                              {new Date(row.created_at).toLocaleString("en-PK", {
                                timeZone: "Asia/Karachi",
                              })}
                            </small>
                          </span>
                        </li>
                      ))}
                  </ol>
                </section>
              </div>
              <footer className="order-actions">
                {canReplacePos && selected.channel === "POS" && selected.status === "CONFIRMED" && !(selected.pos_order_replacements?.length) && clock !== null && clock - new Date(selected.created_at).getTime() <= replacementWindowMinutes * 60 * 1000 && (
                  <Link className="button pos-replace-action" href={`/pos?replace=${selected.id}`}>
                    Replace POS items · {Math.max(1, Math.ceil((replacementWindowMinutes * 60 * 1000 - (clock - new Date(selected.created_at).getTime())) / 60_000))} min left
                  </Link>
                )}
                {selected.channel === "POS" && selected.status === "CONFIRMED" && selected.pos_order_replacements?.length > 0 && <span className="replacement-state">Items already replaced · audit saved</span>}
                {canInvoice && (
                  <Link
                    className="button button--outline"
                    href={`/invoices?order=${selected.id}`}
                  >
                    Create / view invoice
                  </Link>
                )}
                {canPrint && (
                  <>
                    <button
                      className="button button--outline"
                      onClick={() => printOrder(selected, "customer")}
                    >
                      <Printer />
                      Print Receipt
                    </button>
                    <button
                      className="button button--outline"
                      onClick={() => printOrder(selected, "kitchen")}
                    >
                      <Printer />
                      Kitchen
                    </button>
                  </>
                )}
                {canEdit &&
                  nextOrderStatuses[selected.status]
                    .filter(
                      (status) =>
                        !(
                          selected.service_mode === "PICKUP" &&
                          status === "OUT_FOR_DELIVERY"
                        ) &&
                        !(
                          selected.service_mode === "DELIVERY" &&
                          selected.status === "READY" &&
                          status === "DELIVERED"
                        ) && !(riderPortalEnabled&&selected.service_mode==="DELIVERY"&&((selected.status==="READY"&&status==="OUT_FOR_DELIVERY")||(selected.status==="OUT_FOR_DELIVERY"&&status==="DELIVERED"))),
                    )
                    .map((status) => (
                      <button
                        key={status}
                        className={
                          status === "CANCELLED"
                            ? "button button--danger"
                            : "button"
                        }
                        disabled={saving}
                        onClick={() => void change(status)}
                      >
                        {status.replaceAll("_", " ")}
                      </button>
                    ))}
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      {receipt && (
        <>
          <ReceiptBatch receipt={receipt} copies={printSettings?.copies ?? 1} />
          <button
            className="no-print"
            onClick={() => setReceipt(null)}
            style={{ position: "fixed", right: 20, bottom: 20, zIndex: 100 }}
          >
            Close print preview
          </button>
        </>
      )}
    </>
  );
}
