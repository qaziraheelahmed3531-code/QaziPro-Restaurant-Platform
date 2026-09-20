"use client";

import Link from "next/link";
import Image from "@/components/menu-image";
import { AnimatePresence, motion } from "motion/react";
import {
  Banknote,
  Check,
  CircleDollarSign,
  CreditCard,
  ListChecks,
  Minus,
  Pause,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { calculateCashChange, formatPkr } from "@italian-pizza/shared";
import { AppLoader } from "@italian-pizza/shared/app-loader";
import { ReceiptBatch } from "@/components/receipt-batch";
import { type ReceiptData } from "@/components/receipt-document";
import { createBrowserPrintAdapter } from "@/lib/printing";
import { createClient } from "@/lib/supabase/client";

type PosSection = { id: string; name: string; color: string };
type Option = {
  image_url?: string | null;
  id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};
type Group = {
  id: string;
  name: string;
  selection_type: "SINGLE" | "MULTIPLE";
  is_required: boolean;
  min_selections: number;
  max_selections: number | null;
  modifier_options: Option[];
};
type Assignment = {
  product_id: string;
  sort_order: number;
  modifier_groups: Group | Group[] | null;
};
type RawProduct = {
  id: string;
  sku?: string | null;
  name: string;
  category_id: string;
  pos_section_id: string | null;
  base_price: number;
  sale_price: number | null;
  is_available: boolean;
  product_images: Array<{ url: string; is_primary: boolean }>;
};
type Product = RawProduct & { price: number; groups: Group[] };
type Deal = {
  id: string;
  name: string;
  deal_price: number;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
};
type Selection = {
  groupId: string;
  optionId: string;
  label: string;
  price: number;
};
type CartLine = {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  selections: Selection[];
  itemKind?: "product" | "deal";
};
type PosResult = {
  id: string;
  orderNumber: string;
  tokenNumber: number;
  total: number;
  change: number;
  cashAdjustment?: number;
  refund?: number;
};
export type PosPaymentMethod = {
  id: string;
  code: string;
  name: string;
  kind: "CASH" | "WALLET" | "CARD" | "OTHER";
  requires_reference: boolean;
  sort_order: number;
};
export type PosFlowOrder = {
  id: string;
  order_number: string;
  token_number: number;
  total: number;
  status: "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED";
  payment_status: string;
  payment_reference: string | null;
  operational_order_type: string | null;
  created_at: string;
  pos_order_replacements?: Array<{ id: string }>;
};
export type PosReplacementOrder = {
  id: string;
  order_number: string;
  created_at: string;
  total: number;
  customer_name: string;
  customer_phone: string;
  order_notes: string | null;
  order_items: Array<{
    id: string;
    product_id: string | null;
    deal_id: string | null;
    product_name: string;
    quantity: number;
    unit_base_price: number;
    order_item_modifiers: Array<{
      modifier_group_id: string | null;
      modifier_option_id: string | null;
      group_name: string;
      option_name: string;
      price_adjustment: number;
    }>;
  }>;
};
function image(product: RawProduct) {
  return (
    product.product_images?.find((item) => item.is_primary)?.url ??
    product.product_images?.[0]?.url ??
    null
  );
}
const browserPrinter = createBrowserPrintAdapter();
export function PosTerminal({
  canPrint,
  businessId,
  userId,
  businessName,
  phone,
  branch,
  posSections,
  products: rawProducts,
  deals: rawDeals,
  assignments,
  shift,
  printSettings,
  replacementOrder,
  replacementWindowMinutes,
  paymentMethods,
  initialPosOrders,
  recentOrderLimit,
}: {
  canPrint: boolean;
  businessId: string;
  userId: string;
  businessName: string;
  phone: string | null;
  branch: {
    id: string;
    name: string;
    city: string;
    address?: string | null;
    formatted_address?: string | null;
  };
  posSections: PosSection[];
  products: RawProduct[];
  deals: Deal[];
  assignments: Assignment[];
  shift: { id: string; opening_cash: number; opened_at: string } | null;
  printSettings: {
    logo_url?: string | null;
    receipt_width_mm: number;
    auto_print_receipt: boolean;
    receipt_footer: string;
    receipt_note?: string | null;
    copies: number;
    print_kitchen_ticket: boolean;
    show_prices_on_kitchen_ticket: boolean;
    receipt_logo_size?: number;
    receipt_logo_alignment?: "LEFT" | "CENTER" | "RIGHT";
    receipt_header_alignment?: "LEFT" | "CENTER" | "RIGHT";
    show_logo?: boolean;
    show_phone?: boolean;
    show_address?: boolean;
    show_tax?: boolean;
    show_customer_address?: boolean;
    show_payment_status?: boolean;
    show_branch_name?: boolean;
    show_order_number?: boolean;
    show_order_date?: boolean;
    show_order_type?: boolean;
    show_customer_name?: boolean;
    show_customer_phone?: boolean;
    show_payment_method?: boolean;
  } | null;
  replacementOrder?: PosReplacementOrder | null;
  replacementWindowMinutes: number;
  paymentMethods: PosPaymentMethod[];
  initialPosOrders: PosFlowOrder[];
  recentOrderLimit: number;
}) {
  const router = useRouter();
  const products = useMemo<Product[]>(
    () =>
      rawProducts.map((product) => ({
        ...product,
        price: Number(product.sale_price ?? product.base_price),
        groups: assignments
          .filter((item) => item.product_id === product.id)
          .map((item) =>
            Array.isArray(item.modifier_groups)
              ? item.modifier_groups[0]
              : item.modifier_groups,
          )
          .filter((group): group is Group => Boolean(group))
          .map((group) => ({
            ...group,
            modifier_options: (group.modifier_options ?? [])
              .filter((option) => option.is_active)
              .sort((a, b) => a.sort_order - b.sort_order),
          })),
      })),
    [assignments, rawProducts],
  );
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [replacementCompleted, setReplacementCompleted] = useState(false);
  const replacementMode = Boolean(replacementOrder) && !replacementCompleted;
  const [replacementReason, setReplacementReason] = useState(
    "Customer requested a different item",
  );
  const [cart, setCart] = useState<CartLine[]>(
    () =>
      replacementOrder?.order_items.map((line) => ({
        lineId: line.id,
        productId: line.product_id ?? line.deal_id ?? "",
        itemKind: line.deal_id ? "deal" : "product",
        name: line.product_name,
        unitPrice: line.unit_base_price,
        quantity: line.quantity,
        selections: line.order_item_modifiers.flatMap((item) =>
          item.modifier_group_id && item.modifier_option_id
            ? [
                {
                  groupId: item.modifier_group_id,
                  optionId: item.modifier_option_id,
                  label: `${item.group_name}: ${item.option_name}`,
                  price: item.price_adjustment,
                },
              ]
            : [],
        ),
      })) ?? [],
  );
  const [editing, setEditing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Selection[]>([]);
  const [cash, setCash] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentCode, setPaymentCode] = useState(
    paymentMethods[0]?.code ?? "CASH",
  );
  const [paymentReference, setPaymentReference] = useState("");
  const [customer, setCustomer] = useState(
    replacementOrder?.customer_name ?? "",
  );
  const [phoneInput, setPhoneInput] = useState(
    replacementOrder?.customer_phone ?? "",
  );
  const [notes, setNotes] = useState(replacementOrder?.order_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [posOrders, setPosOrders] = useState(initialPosOrders);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useState<
    Array<{
      id: string;
      label: string;
      payload: {
        cart: CartLine[];
        customer: string;
        phone: string;
        notes: string;
      };
    }>
  >([]);
  const [clientReference, setClientReference] = useState(() =>
    crypto.randomUUID(),
  );
  useEffect(() => {
    const initial = window.setTimeout(() => setClock(Date.now()), 0);
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);
  const deals = useMemo(
    () =>
      rawDeals.filter(
        (deal) =>
          (!deal.starts_at || new Date(deal.starts_at) <= new Date()) &&
          (!deal.ends_at || new Date(deal.ends_at) > new Date()),
      ),
    [rawDeals],
  );
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 250);
    };
    const refreshOrders = async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id,order_number,token_number,total,status,payment_status,payment_reference,operational_order_type,created_at,pos_order_replacements(id)",
        )
        .eq("business_id", businessId)
        .eq("branch_id", branch.id)
        .eq("channel", "POS")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) setPosOrders(data as PosFlowOrder[]);
    };
    const channel = supabase
      .channel(`pos-live-${businessId}-${branch.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `business_id=eq.${businessId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
          filter: `business_id=eq.${businessId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branch.id}`,
        },
        () => void refreshOrders(),
      )
      .subscribe();
    return () => {
      window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [branch.id, businessId, router]);
  const visible = products.filter(
    (product) =>
      (category === "all" ||
        category === "deals" ||
        product.pos_section_id === category) &&
      [product.name, product.sku ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const showProducts = category !== "deals";
  const showDeals = category === "all" || category === "deals";
  const subtotal = cart.reduce(
    (sum, line) =>
      sum +
      (line.unitPrice +
        line.selections.reduce((total, item) => total + item.price, 0)) *
        line.quantity,
    0,
  );
  const received = Math.max(0, Math.round(Number(cash) || 0));
  const replacementDifference = replacementMode
    ? subtotal - Number(replacementOrder?.total ?? 0)
    : 0;
  const amountToCollect = replacementMode
    ? Math.max(0, replacementDifference)
    : subtotal;
  const selectedPayment =
    paymentMethods.find((item) => item.code === paymentCode) ??
    paymentMethods[0];
  const isCash =
    replacementMode || !selectedPayment || selectedPayment.kind === "CASH";
  const change = isCash ? calculateCashChange(amountToCollect, received) : 0;
  const paymentReady =
    Boolean(selectedPayment) &&
    (!selectedPayment.requires_reference ||
      paymentReference.trim().length >= 2) &&
    (isCash ? change !== null : true);
  const activePosOrders = posOrders.filter(
    (order) => order.status !== "DELIVERED",
  );
  const recentPosOrders = posOrders
    .filter((order) => order.status === "DELIVERED")
    .slice(0, recentOrderLimit);
  useEffect(() => {
    if (!checkoutOpen && !editing)
      window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [checkoutOpen, editing]);
  const openProduct = (product: Product) => {
    if (!product.is_available) return;
    if (!product.groups.length) {
      setCart((rows) => [
        ...rows,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          itemKind: "product",
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          selections: [],
        },
      ]);
      return;
    }
    setEditing(product);
    setSelected(
      product.groups.flatMap((group) =>
        group.modifier_options
          .filter((option) => option.is_default)
          .slice(0, group.selection_type === "SINGLE" ? 1 : undefined)
          .map((option) => ({
            groupId: group.id,
            optionId: option.id,
            label: `${group.name}: ${option.name}`,
            price: Number(option.price_adjustment),
          })),
      ),
    );
  };
  const toggle = (group: Group, option: Option) =>
    setSelected((current) => {
      const exists = current.some((item) => item.optionId === option.id);
      if (exists) return current.filter((item) => item.optionId !== option.id);
      const next =
        group.selection_type === "SINGLE"
          ? current.filter((item) => item.groupId !== group.id)
          : current;
      const count = next.filter((item) => item.groupId === group.id).length;
      if (group.max_selections && count >= group.max_selections) return current;
      return [
        ...next,
        {
          groupId: group.id,
          optionId: option.id,
          label: `${group.name}: ${option.name}`,
          price: Number(option.price_adjustment),
        },
      ];
    });
  const addCustomized = () => {
    if (!editing) return;
    for (const group of editing.groups) {
      const count = selected.filter((item) => item.groupId === group.id).length;
      if (count < group.min_selections) {
        setMessage(`Select ${group.name}.`);
        return;
      }
    }
    setCart((rows) => [
      ...rows,
      {
        lineId: crypto.randomUUID(),
        productId: editing.id,
        itemKind: "product",
        name: editing.name,
        unitPrice: editing.price,
        quantity: 1,
        selections: selected,
      },
    ]);
    setEditing(null);
    setMessage("");
  };
  const loadHeld = async () => {
    const { data } = await createClient()
      .from("pos_held_orders")
      .select("id,label,payload")
      .eq("business_id", businessId)
      .eq("held_by", userId)
      .eq("branch_id", branch.id)
      .order("created_at", { ascending: false });
    setHeld((data ?? []) as typeof held);
  };
  const hold = async () => {
    if (!cart.length) return;
    const supabase = createClient();
    const { error } = await supabase.from("pos_held_orders").insert({
      business_id: businessId,
      branch_id: branch.id,
      held_by: userId,
      label: `${customer || "Counter order"} · ${formatPkr(subtotal)}`,
      payload: { cart, customer, phone: phoneInput, notes },
    });
    if (error) {
      setMessage("Unable to hold this order. Please try again.");
      return;
    }
    setCart([]);
    setCustomer("");
    setPhoneInput("");
    setNotes("");
    setCash("");
    setClientReference(crypto.randomUUID());
    setMessage("Order held safely.");
    void loadHeld();
  };
  const resume = async (item: (typeof held)[number]) => {
    if (
      cart.length &&
      !window.confirm("Replace the current counter order with this held order?")
    )
      return;
    setCart(item.payload.cart);
    setCustomer(item.payload.customer);
    setPhoneInput(item.payload.phone);
    setNotes(item.payload.notes);
    await createClient().from("pos_held_orders").delete().eq("id", item.id);
    setHeld((current) => current.filter((row) => row.id !== item.id));
    setClientReference(crypto.randomUUID());
  };
  const updateOrderStage = async (
    order: PosFlowOrder,
    status: PosFlowOrder["status"],
  ) => {
    const stageOrder = ["CONFIRMED", "PREPARING", "READY", "DELIVERED"];
    if (stageOrder.indexOf(status) !== stageOrder.indexOf(order.status) + 1)
      return;
    const previous = posOrders;
    setStatusBusy(order.id);
    setPosOrders((rows) =>
      rows.map((row) => (row.id === order.id ? { ...row, status } : row)),
    );
    const { data, error } = await createClient().rpc("set_pos_order_stage", {
      p_order_id: order.id,
      p_status: status,
    });
    if (error) {
      setPosOrders(previous);
      setMessage("Order stage could not be updated. Refresh and try again.");
    } else
      setPosOrders((rows) =>
        rows.map((row) =>
          row.id === order.id
            ? {
                ...row,
                status: (data as { status: PosFlowOrder["status"] }).status,
              }
            : row,
        ),
      );
    setStatusBusy(null);
  };
  const cancelPosOrder = async (order: PosFlowOrder) => {
    if (
      !window.confirm(
        `Cancel ${order.order_number}? Its payment will be recorded as refunded.`,
      )
    )
      return;
    const previous = posOrders;
    setStatusBusy(order.id);
    setPosOrders((rows) => rows.filter((row) => row.id !== order.id));
    const { error } = await createClient().rpc("cancel_pos_order", {
      p_order_id: order.id,
      p_reason: "Cancelled from Web POS",
    });
    if (error) {
      setPosOrders(previous);
      setMessage(
        error.message || "Order could not be cancelled. Refresh and try again.",
      );
    } else
      setMessage(
        `${order.order_number} cancelled and its payment recorded as refunded.`,
      );
    setStatusBusy(null);
  };
  const submit = async () => {
    if (!shift) {
      setMessage("Open a register shift before taking a sale.");
      return;
    }
    if (!cart.length || !paymentReady) {
      setMessage("Complete the payment details before placing this sale.");
      return;
    }
    setBusy(true);
    setMessage("");
    const payload = {
      branchId: branch.id,
      shiftId: shift.id,
      clientReference,
      orderType: "TAKEAWAY",
      customerName: customer,
      customerPhone: phoneInput,
      notes,
      cashReceived: received,
      paymentMethodCode: selectedPayment?.code ?? "CASH",
      paymentReference: paymentReference.trim(),
      reason: replacementReason,
      items: cart.map((line) => ({
        itemKind: line.itemKind ?? "product",
        productId: line.productId,
        quantity: line.quantity,
        modifiers: line.selections.map((item) => ({
          groupId: item.groupId,
          optionId: item.optionId,
        })),
      })),
    };
    const { data, error } =
      replacementMode && replacementOrder
        ? await createClient().rpc("replace_pos_order", {
            p_order_id: replacementOrder.id,
            p_payload: payload,
          })
        : await createClient().rpc("create_pos_order", { p_payload: payload });
    if (error) {
      const safeReplacementMessages = [
        "replacement window has expired",
        "kitchen preparation",
        "register shift",
        "additional cash",
        "replacement refund",
        "selected deal is unavailable",
        "selected product is unavailable",
        "modifier selections are invalid",
        "selected modifier is unavailable",
        "already been replaced",
        "invoice reissue",
      ];
      const serverMessage = error.message?.trim() ?? "";
      const safeServerMessage = safeReplacementMessages.some((fragment) =>
        serverMessage.toLowerCase().includes(fragment),
      )
        ? serverMessage
        : "Unable to replace this POS order. Please refresh the order and try again.";
      setMessage(
        replacementMode
          ? safeServerMessage
          : "Unable to complete this sale. Check product availability and payment, then retry.",
      );
      setBusy(false);
      return;
    }
    const result = data as PosResult;
    const persisted = await createClient()
      .from("orders")
      .select(
        "subtotal,discount,delivery_fee,tax,total,created_at,order_items(product_name,quantity,unit_price,order_item_modifiers(group_name,option_name))",
      )
      .eq("id", result.id)
      .single();
    const saved = persisted.data;
    const nextReceipt: ReceiptData = {
      businessName,
      logoUrl: printSettings?.logo_url,
      branchName: branch.name,
      businessAddress: branch.formatted_address ?? branch.address ?? null,
      phone,
      orderNumber: result.orderNumber,
      tokenNumber: result.tokenNumber,
      createdAt: saved?.created_at ?? new Date().toISOString(),
      orderType: "TAKEAWAY",
      customerName: customer || "Counter guest",
      subtotal: saved?.subtotal ?? result.total,
      discount: saved?.discount ?? 0,
      deliveryFee: saved?.delivery_fee ?? 0,
      tax: saved?.tax ?? 0,
      total: saved?.total ?? result.total,
      paymentMethod: replacementMode
        ? "CASH ADJUSTMENT"
        : (selectedPayment?.name ?? "Cash"),
      paymentStatus: "PAID",
      lines: saved
        ? saved.order_items.map((line) => ({
            name: line.product_name,
            quantity: line.quantity,
            unitPrice: line.unit_price,
            options: line.order_item_modifiers.map(
              (option) => `${option.group_name}: ${option.option_name}`,
            ),
          }))
        : cart.map((line) => ({
            name: line.name,
            quantity: line.quantity,
            unitPrice:
              line.unitPrice +
              line.selections.reduce((sum, item) => sum + item.price, 0),
            options: line.selections.map((item) => item.label),
          })),
      footer:
        printSettings?.receipt_footer ??
        `Thank you for ordering from ${businessName}.`,
      footerNote: printSettings?.receipt_note,
      width: printSettings?.receipt_width_mm === 58 ? 58 : 80,
      design: {
        logoSize: printSettings?.receipt_logo_size ?? 72,
        logoAlignment: printSettings?.receipt_logo_alignment ?? "CENTER",
        headerAlignment: printSettings?.receipt_header_alignment ?? "CENTER",
        showLogo: printSettings?.show_logo ?? true,
        showPhone: printSettings?.show_phone ?? true,
        showAddress: printSettings?.show_address ?? true,
        showTax: printSettings?.show_tax ?? true,
        showCustomerAddress: printSettings?.show_customer_address ?? true,
        showPaymentStatus: printSettings?.show_payment_status ?? true,
        showBranchName: printSettings?.show_branch_name ?? true,
        showOrderNumber: printSettings?.show_order_number ?? true,
        showOrderDate: printSettings?.show_order_date ?? true,
        showOrderType: printSettings?.show_order_type ?? true,
        showCustomerName: printSettings?.show_customer_name ?? true,
        showCustomerPhone: printSettings?.show_customer_phone ?? true,
        showPaymentMethod: printSettings?.show_payment_method ?? true,
      },
    };
    setReceipt(nextReceipt);
    setPosOrders((current) => [
      {
        id: result.id,
        order_number: result.orderNumber,
        token_number: result.tokenNumber,
        total: result.total,
        status: "CONFIRMED",
        payment_status: "PAID",
        payment_reference:
          paymentReference.trim() || selectedPayment?.code || "CASH",
        operational_order_type: "TAKEAWAY",
        created_at: saved?.created_at ?? new Date().toISOString(),
        pos_order_replacements: replacementMode ? [{ id: "new" }] : [],
      },
      ...current.filter((order) => order.id !== result.id),
    ]);
    if (replacementMode) setReplacementCompleted(true);
    setCart([]);
    setCash("");
    setCustomer("");
    setPhoneInput("");
    setNotes("");
    setPaymentReference("");
    setCheckoutOpen(false);
    setClientReference(crypto.randomUUID());
    setBusy(false);
    setMessage(
      replacementMode
        ? `Order ${result.orderNumber} replaced safely.${Number(result.refund) > 0 ? ` Return ${formatPkr(Number(result.refund))} to the customer.` : Number(result.cashAdjustment) > 0 ? ` Additional cash collected ${formatPkr(Number(result.cashAdjustment))}. Change ${formatPkr(result.change)}.` : " No cash adjustment required."}`
        : `Order ${result.orderNumber} · Token ${String(result.tokenNumber).padStart(3, "0")} completed. Change ${formatPkr(result.change)}.`,
    );
    if (canPrint)
      window.setTimeout(
        () =>
          void browserPrinter.print({
            kind: "customer-receipt",
            paperWidth: nextReceipt.width === 58 ? "58mm" : "80mm",
            copies: 1,
          }),
        100,
      );
  };
  const updateQty = (lineId: string, delta: number) =>
    setCart((rows) =>
      rows.map((line) =>
        line.lineId === lineId
          ? { ...line, quantity: Math.max(1, line.quantity + delta) }
          : line,
      ),
    );
  return (
    <div className="pos-page">
      <p className="warning-note pos-small-screen-note">
        For faster counter service, use a tablet or desktop. On this screen, the
        order and payment controls appear below the menu.
      </p>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">
            {replacementMode
              ? `POS REPLACEMENT · ${replacementOrder?.order_number}`
              : `COUNTER SALE · ${branch.name}`}
          </span>
          <h1>
            {replacementMode ? "Replace POS order items" : "Point of sale"}
          </h1>
          <p>
            {replacementMode
              ? `Replace this counter sale within ${replacementWindowMinutes} minutes, before preparation starts. Review the updated total before confirming.`
              : "Choose items, customize the order and collect payment."}
          </p>
        </div>
        <div className="heading-actions">
          {!replacementMode && (
            <button
              className="button button--outline"
              onClick={() => void loadHeld()}
            >
              <Pause />
              Held orders {held.length > 0 && `(${held.length})`}
            </button>
          )}
          {replacementMode && (
            <Link className="button button--outline" href="/pos">
              Cancel replacement
            </Link>
          )}
          {!shift && (
            <Link className="button" href="/register">
              Open shift
            </Link>
          )}
        </div>
      </div>
      {!replacementMode && held.length > 0 && (
        <div className="held-orders no-print">
          {held.map((item) => (
            <div key={item.id}>
              <button onClick={() => void resume(item)}>
                <strong>{item.label}</strong>
                <small>Resume order</small>
              </button>
              <button
                aria-label={`Cancel held order ${item.label}`}
                onClick={async () => {
                  const { error } = await createClient()
                    .from("pos_held_orders")
                    .delete()
                    .eq("id", item.id);
                  if (error)
                    setMessage(
                      "Unable to cancel the held order. Please retry.",
                    );
                  else
                    setHeld((rows) => rows.filter((row) => row.id !== item.id));
                }}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
      {replacementMode && (
        <section
          className="pos-replacement-guide no-print"
          aria-label="POS replacement instructions"
        >
          <div>
            <strong>Original order loaded</strong>
            <span>
              Remove the item the customer no longer wants, then choose its
              replacement from the menu.
            </span>
          </div>
          <button
            className="button button--outline"
            disabled={!cart.length}
            onClick={() => setCart([])}
          >
            <Trash2 /> Clear old items
          </button>
        </section>
      )}
      {!replacementMode && (
        <section className="pos-flow-panel no-print">
          <header>
            <div>
              <span className="eyebrow">ONE-TAP KITCHEN FLOW</span>
              <h2>Active POS orders</h2>
            </div>
          </header>
          {activePosOrders.length ? (
            <div className="pos-flow-strip">
              {activePosOrders.map((order) => {
                const nextStage =
                  order.status === "CONFIRMED"
                    ? "PREPARING"
                    : order.status === "PREPARING"
                      ? "READY"
                      : "DELIVERED";
                const replacementEligible =
                  clock > 0 &&
                  order.status === "CONFIRMED" &&
                  !order.pos_order_replacements?.length &&
                  clock - new Date(order.created_at).getTime() <=
                    replacementWindowMinutes * 60_000;
                return (
                  <article key={order.id} data-pos-order-id={order.id}>
                    <div>
                      <strong>
                        #{String(order.token_number).padStart(3, "0")}
                      </strong>
                      <span>{order.order_number}</span>
                      <b>{formatPkr(order.total)}</b>
                    </div>
                    <div className="pos-stage-buttons">
                      <span
                        className={`pos-current-stage pos-stage-${order.status.toLowerCase()}`}
                      >
                        {order.status.charAt(0) +
                          order.status.slice(1).toLowerCase()}
                      </span>
                      <button
                        className={`pos-stage-action pos-stage-${nextStage.toLowerCase()}`}
                        disabled={statusBusy !== null}
                        onClick={() => void updateOrderStage(order, nextStage)}
                      >
                        {nextStage === "PREPARING"
                          ? "Start preparing"
                          : nextStage === "READY"
                            ? "Mark ready"
                            : "Mark delivered"}
                      </button>
                      {replacementEligible && (
                        <Link
                          className="pos-replacement-action"
                          href={`/pos?replace=${order.id}`}
                        >
                          <RotateCcw />
                          Replacement
                        </Link>
                      )}
                      <button
                        className="pos-cancel-action"
                        disabled={statusBusy !== null}
                        onClick={() => void cancelPosOrder(order)}
                      >
                        <X />
                        Cancel
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="pos-flow-empty">
              No active counter orders. New sales appear here instantly.
            </p>
          )}
          {recentPosOrders.length > 0 && (
            <details className="pos-recent-orders">
              <summary>
                <ListChecks />
                Recent delivered ({recentPosOrders.length})
              </summary>
              <div>
                {recentPosOrders.map((order) => (
                  <span key={order.id}>
                    <b>#{String(order.token_number).padStart(3, "0")}</b>
                    {order.order_number}
                    <strong>{formatPkr(order.total)}</strong>
                  </span>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      <div className="pos-layout no-print">
        <section className="pos-catalog">
          <div className="pos-search">
            <Search />
            <input
              ref={searchRef}
              autoFocus
              aria-label="Search POS products"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product or SKU"
            />
          </div>
          <div className="pos-categories">
            <button
              className={category === "all" ? "is-active" : ""}
              onClick={() => setCategory("all")}
            >
              All
            </button>
            <button
              className={category === "deals" ? "is-active" : ""}
              onClick={() => setCategory("deals")}
            >
              Deals
            </button>
            {posSections
              .filter((item) => item.name.trim().toLowerCase() !== "deals")
              .map((item) => (
                <button
                  key={item.id}
                  className={category === item.id ? "is-active" : ""}
                  style={
                    category === item.id
                      ? {
                          background: item.color,
                          borderColor: item.color,
                          color: "#fff",
                        }
                      : { borderColor: item.color }
                  }
                  onClick={() => setCategory(item.id)}
                >
                  {item.name}
                </button>
              ))}
          </div>
          <div className="pos-products">
            {showDeals &&
              deals.map((deal) => (
                <button
                  key={`deal-${deal.id}`}
                  className="is-deal"
                  onClick={() =>
                    setCart((rows) => [
                      ...rows,
                      {
                        lineId: crypto.randomUUID(),
                        productId: deal.id,
                        itemKind: "deal",
                        name: deal.name,
                        unitPrice: Number(deal.deal_price),
                        quantity: 1,
                        selections: [],
                      },
                    ])
                  }
                >
                  {deal.image_url && (
                    <span
                      style={{ backgroundImage: `url(${deal.image_url})` }}
                    />
                  )}
                  <strong>{deal.name}</strong>
                  <b>{formatPkr(deal.deal_price)}</b>
                  <small>Deal · Add to order</small>
                </button>
              ))}
            {showProducts &&
              visible.map((product) => (
                <button
                  key={product.id}
                  className={!product.is_available ? "is-unavailable" : ""}
                  onClick={() => openProduct(product)}
                  disabled={!product.is_available}
                >
                  {image(product) && (
                    <span
                      style={{ backgroundImage: `url(${image(product)})` }}
                    />
                  )}
                  <strong>{product.name}</strong>
                  <b>{formatPkr(product.price)}</b>
                  <small>
                    {product.is_available ? "Add to order" : "Out of stock"}
                  </small>
                </button>
              ))}
            {(!showProducts || !visible.length) &&
              (!showDeals || !deals.length) && (
                <div className="state-box">No matching available products.</div>
              )}
          </div>
        </section>
        <aside className="pos-cart">
          <header>
            <span>
              <ShoppingCart />
              <strong>Current order</strong>
            </span>
            <button onClick={() => setCart([])} disabled={!cart.length}>
              Clear
            </button>
          </header>
          <div className="pos-cart-lines">
            {cart.map((line) => (
              <article key={line.lineId}>
                <div>
                  <strong>{line.name}</strong>
                  {line.selections.map((item) => (
                    <small key={item.optionId}>{item.label}</small>
                  ))}
                  <b>
                    {formatPkr(
                      (line.unitPrice +
                        line.selections.reduce(
                          (sum, item) => sum + item.price,
                          0,
                        )) *
                        line.quantity,
                    )}
                  </b>
                </div>
                <div className="quantity-row">
                  <button onClick={() => updateQty(line.lineId, -1)}>
                    <Minus />
                  </button>
                  <span>{line.quantity}</span>
                  <button onClick={() => updateQty(line.lineId, 1)}>
                    <Plus />
                  </button>
                  <button
                    onClick={() =>
                      setCart((rows) =>
                        rows.filter((item) => item.lineId !== line.lineId),
                      )
                    }
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 />
                  </button>
                </div>
              </article>
            ))}
            {!cart.length && (
              <div className="empty-panel">
                <ShoppingCart />
                <p>Select a product to start a counter order.</p>
              </div>
            )}
          </div>
          <div className="pos-customer">
            <input
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder="Customer name (optional)"
            />
            <input
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              placeholder="Phone (optional)"
            />
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Order notes"
            />
            {replacementMode && (
              <label className="pos-replacement-reason">
                Replacement reason
                <input
                  minLength={3}
                  maxLength={500}
                  value={replacementReason}
                  onChange={(event) => setReplacementReason(event.target.value)}
                />
              </label>
            )}
          </div>
          <div className="pos-payment">
            <div>
              <span>{replacementMode ? "New total" : "Total"}</span>
              <strong>{formatPkr(subtotal)}</strong>
            </div>
            {replacementMode && (
              <div
                className={`pos-adjustment ${replacementDifference < 0 ? "is-refund" : ""}`}
              >
                <span>
                  {replacementDifference > 0
                    ? "Additional cash due"
                    : replacementDifference < 0
                      ? "Cash to return"
                      : "Cash adjustment"}
                </span>
                <strong>{formatPkr(Math.abs(replacementDifference))}</strong>
              </div>
            )}
            <label>
              {replacementMode ? "Additional cash received" : "Cash received"}
              <input
                type="number"
                min={0}
                value={cash}
                onChange={(event) => setCash(event.target.value)}
                disabled={replacementMode && replacementDifference <= 0}
              />
            </label>
            <button
              className="button button--outline"
              onClick={() => setCash(String(amountToCollect))}
              disabled={replacementMode && replacementDifference <= 0}
            >
              Exact cash
            </button>
            <div>
              <span>Change</span>
              <strong>{change === null ? "—" : formatPkr(change)}</strong>
            </div>
            {message && <p role="status">{message}</p>}
            <div className="pos-submit">
              <button
                className="button button--outline"
                onClick={() =>
                  replacementMode ? router.push("/pos") : void hold()
                }
                disabled={!cart.length && !replacementMode}
              >
                <Pause />
                {replacementMode ? "Cancel" : "Hold"}
              </button>
              <button
                className="button"
                onClick={() => setCheckoutOpen(true)}
                disabled={!shift || !cart.length}
              >
                <CreditCard />
                {replacementMode ? "Review replacement" : "Checkout"}
              </button>
            </div>
          </div>
        </aside>
      </div>
      <AnimatePresence>
        {checkoutOpen && (
          <motion.div
            className="drawer-backdrop no-print pos-checkout-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="pos-checkout-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-checkout-title"
              initial={{ scale: 0.97, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 14 }}
            >
              <header>
                <div>
                  <span className="eyebrow">FINAL CHECK</span>
                  <h2 id="pos-checkout-title">
                    {replacementMode ? "Confirm replacement" : "Checkout"}
                  </h2>
                </div>
                <button
                  className="icon-action"
                  disabled={busy}
                  onClick={() => setCheckoutOpen(false)}
                  aria-label="Close checkout"
                >
                  <X />
                </button>
              </header>
              <div className="pos-checkout-body">
                <section className="pos-checkout-order">
                  <h3>Order details</h3>
                  <div className="pos-checkout-lines">
                    {cart.map((line) => (
                      <span key={line.lineId}>
                        <b>
                          {line.quantity}× {line.name}
                        </b>
                        <strong>
                          {formatPkr(
                            (line.unitPrice +
                              line.selections.reduce(
                                (sum, item) => sum + item.price,
                                0,
                              )) *
                              line.quantity,
                          )}
                        </strong>
                      </span>
                    ))}
                  </div>
                  <label>
                    Customer name
                    <input
                      value={customer}
                      onChange={(event) => setCustomer(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={phoneInput}
                      onChange={(event) => setPhoneInput(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Order notes
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Kitchen or customer note"
                    />
                  </label>
                  {replacementMode && (
                    <label>
                      Replacement reason
                      <input
                        minLength={3}
                        maxLength={500}
                        value={replacementReason}
                        onChange={(event) =>
                          setReplacementReason(event.target.value)
                        }
                      />
                    </label>
                  )}
                </section>
                <section className="pos-checkout-payment">
                  <h3>
                    {replacementMode
                      ? "Cash adjustment"
                      : "How is the customer paying?"}
                  </h3>
                  {!replacementMode && (
                    <div className="pos-tender-grid">
                      {paymentMethods.map((method) => (
                        <button
                          key={method.id}
                          className={
                            paymentCode === method.code ? "is-selected" : ""
                          }
                          onClick={() => {
                            setPaymentCode(method.code);
                            setCash("");
                            setPaymentReference("");
                          }}
                        >
                          {method.kind === "CASH" ? (
                            <Banknote />
                          ) : method.kind === "CARD" ? (
                            <CreditCard />
                          ) : (
                            <CircleDollarSign />
                          )}
                          <span>
                            <strong>{method.name}</strong>
                            <small>{method.kind}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!replacementMode &&
                    selectedPayment &&
                    selectedPayment.kind !== "CASH" && (
                      <>
                        <label>
                          Sender / transaction reference{" "}
                          {selectedPayment.requires_reference
                            ? "(required)"
                            : "(optional)"}
                          <input
                            autoFocus={selectedPayment.requires_reference}
                            required={selectedPayment.requires_reference}
                            value={paymentReference}
                            maxLength={120}
                            onChange={(event) =>
                              setPaymentReference(event.target.value)
                            }
                            placeholder={
                              selectedPayment.kind === "WALLET"
                                ? "Sender phone or transaction ID (optional)"
                                : "Card terminal reference (optional)"
                            }
                          />
                        </label>
                        <div className="pos-payment-received">
                          <span>Amount received</span>
                          <strong>{formatPkr(subtotal)}</strong>
                        </div>
                      </>
                    )}
                  {isCash && (
                    <>
                      <label>
                        {replacementMode
                          ? "Additional cash received"
                          : "Cash received"}
                        <input
                          autoFocus
                          type="number"
                          min={0}
                          value={cash}
                          onChange={(event) => setCash(event.target.value)}
                          disabled={
                            replacementMode && replacementDifference <= 0
                          }
                        />
                      </label>
                      <button
                        className="button button--outline"
                        onClick={() => setCash(String(amountToCollect))}
                        disabled={replacementMode && replacementDifference <= 0}
                      >
                        Exact cash
                      </button>
                      <div className="pos-change">
                        <span>Change</span>
                        <strong>
                          {change === null ? "—" : formatPkr(change)}
                        </strong>
                      </div>
                    </>
                  )}
                  {replacementMode && (
                    <div
                      className={`pos-adjustment ${replacementDifference < 0 ? "is-refund" : ""}`}
                    >
                      <span>
                        {replacementDifference > 0
                          ? "Additional cash due"
                          : replacementDifference < 0
                            ? "Cash to return"
                            : "Cash adjustment"}
                      </span>
                      <strong>
                        {formatPkr(Math.abs(replacementDifference))}
                      </strong>
                    </div>
                  )}
                  <div className="pos-checkout-total">
                    <span>Total</span>
                    <strong>{formatPkr(subtotal)}</strong>
                  </div>
                  {message && <p role="status">{message}</p>}
                  <button
                    className="button pos-place-order"
                    disabled={
                      busy ||
                      !shift ||
                      !paymentReady ||
                      (replacementMode && replacementReason.trim().length < 3)
                    }
                    onClick={() => void submit()}
                  >
                    {busy ? (
                      <AppLoader active label="Placing order" />
                    ) : (
                      <Printer />
                    )}
                    {busy
                      ? "Placing…"
                      : replacementMode
                        ? "Save replacement & print"
                        : "Place order & print receipt"}
                  </button>
                </section>
              </div>
            </motion.section>
          </motion.div>
        )}
        {editing && (
          <motion.div
            className="drawer-backdrop no-print"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="editor pos-modifier"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-product-title"
              initial={{ scale: 0.98, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.98, y: 12 }}
            >
              <header>
                <div>
                  <small>CUSTOMIZE</small>
                  <h2 id="pos-product-title">{editing.name}</h2>
                </div>
                <button
                  className="icon-action"
                  onClick={() => setEditing(null)}
                  aria-label="Close"
                >
                  <X />
                </button>
              </header>
              <div className="modifier-groups">
                {editing.groups.map((group) => (
                  <fieldset key={group.id}>
                    <legend>
                      {group.name}{" "}
                      {group.is_required && <small>Required</small>}
                    </legend>
                    {group.modifier_options.map((option) => {
                      const checked = selected.some(
                        (item) => item.optionId === option.id,
                      );
                      return (
                        <button
                          key={option.id}
                          className={checked ? "is-selected" : ""}
                          onClick={() => toggle(group, option)}
                        >
                          <i>{checked && <Check />}</i>
                          {option.image_url && (
                            <Image
                              className="addon-thumbnail"
                              src={option.image_url}
                              alt=""
                              width={44}
                              height={44}
                              unoptimized
                            />
                          )}
                          <span>{option.name}</span>
                          <b>
                            {option.price_adjustment
                              ? `+ ${formatPkr(option.price_adjustment)}`
                              : "Included"}
                          </b>
                        </button>
                      );
                    })}
                  </fieldset>
                ))}
              </div>
              <footer className="editor-footer">
                <button
                  className="button button--outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="button" onClick={addCustomized}>
                  Add to order
                </button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
      {receipt && (
        <div className="receipt-preview">
          <div className="receipt-preview__actions no-print">
            <strong>Receipt ready</strong>
            <button
              className="button button--outline"
              onClick={() => setReceipt(null)}
            >
              <X />
              Close
            </button>
            <button
              disabled={!canPrint}
              className="button"
              onClick={() =>
                void browserPrinter.print({
                  kind: "customer-receipt",
                  paperWidth: receipt.width === 58 ? "58mm" : "80mm",
                  copies: 1,
                })
              }
            >
              <Printer />
              Print receipt
            </button>
          </div>
          <ReceiptBatch
            receipt={receipt}
            copies={printSettings?.copies ?? 1}
            includeKitchen={printSettings?.print_kitchen_ticket ?? false}
            kitchenPrices={
              printSettings?.show_prices_on_kitchen_ticket ?? false
            }
          />
        </div>
      )}
    </div>
  );
}
