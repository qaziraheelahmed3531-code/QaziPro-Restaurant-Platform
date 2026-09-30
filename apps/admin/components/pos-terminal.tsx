"use client";

import Link from "next/link";
import Image from "@/components/menu-image";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { calculateCashChange, formatPkr } from "@italian-pizza/shared";
import { AppLoader } from "@italian-pizza/shared/app-loader";
import { ReceiptBatch } from "@/components/receipt-batch";
import { type ReceiptData } from "@/components/receipt-document";
import { createBrowserPrintAdapter } from "@/lib/printing";
import { createClient } from "@/lib/supabase/client";
import {
  emptyFulfilment,
  mergePosLine,
  posError,
  validPosDraft,
  type PosDraft,
  type PosFulfilment,
} from "@/lib/pos-state";
import { useReducedMotionPreference } from "@/lib/use-reduced-motion";

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
  is_active?: boolean;
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
  product_variants: Array<{
    id: string;
    name: string;
    price_adjustment: number;
    is_default: boolean;
    is_active: boolean;
    sort_order: number;
  }>;
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
  variantId?: string;
  variantName?: string;
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
  channel: "WEBSITE" | "POS" | "INTEGRATION";
  total: number;
  status:
    | "RECEIVED"
    | "CONFIRMED"
    | "PREPARING"
    | "READY"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED";
  payment_status: string;
  payment_reference: string | null;
  operational_order_type: string | null;
  created_at: string;
  table_reference?: string | null;
  customer_name?: string;
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
    variant_id?: string | null;
    variant_name?: string | null;
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
// Cart, cash-input and realtime status updates must not reconcile the entire
// menu. Catalogue props and callbacks change only when this panel needs work.
const PosProductGrid = memo(function PosProductGrid({products,deals,category,query,locked,onProduct,onDeal}:{products:Product[];deals:Deal[];category:string;query:string;locked:boolean;onProduct:(product:Product)=>void;onDeal:(deal:Deal)=>void}){
  const search=query.trim().toLowerCase();
  const visible=category==="deals"?[]:products.filter(product=>(category==="all"||product.pos_section_id===category)&&`${product.name} ${product.sku??""}`.toLowerCase().includes(search));
  const visibleDeals=category==="all"||category==="deals"?deals.filter(deal=>deal.name.toLowerCase().includes(search)):[];
  return <div className="pos-products">
    {visibleDeals.map(deal=><button key={`deal-${deal.id}`} className="is-deal" disabled={locked} onClick={()=>onDeal(deal)}>
      {deal.image_url&&<span className="pos-product-image"><Image src={deal.image_url} alt="" fill sizes="180px" loading="lazy" unoptimized/></span>}
      <strong>{deal.name}</strong><b>{formatPkr(deal.deal_price)}</b><small>Deal · Add to order</small>
    </button>)}
    {visible.map(product=>{const url=image(product);return <button key={product.id} className={!product.is_available?"is-unavailable":""} disabled={!product.is_available||locked} onClick={()=>onProduct(product)}>
      {url&&<span className="pos-product-image"><Image src={url} alt="" fill sizes="180px" loading="lazy" unoptimized/></span>}
      <strong>{product.name}</strong><b>{formatPkr(product.price)}</b><small>{product.is_available?"Add to order":"Out of stock"}</small>
    </button>})}
    {!visible.length&&!visibleDeals.length&&<div className="state-box">No matching available products.</div>}
  </div>;
});
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
  operations,
  canRefund = false,
  canLookupCustomers = false,
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
  canRefund?: boolean;
  canLookupCustomers?: boolean;
  operations: {
    taxRateBps: number;
    modes: string[];
    tables: Array<{ id: string; name: string; occupied: boolean }>;
    deliveryAreas: Array<{ id: string; name: string }>;
    deliveryRules: {
      free_distance_km: number;
      extra_km_rate: number;
      maximum_distance_km: number | null;
    } | null;
    promotions: Array<{
      code: string;
      discount_type: string;
      discount_value: number;
      maximum_discount: number | null;
    }>;
  };
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotionPreference();
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
          .filter((group): group is Group => Boolean(group) && group?.is_active !== false)
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
        variantId: line.variant_id ?? undefined,
        variantName: line.variant_name ?? undefined,
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
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
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
  const [fulfilment, setFulfilment] = useState<PosFulfilment>(emptyFulfilment);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [heldBusy, setHeldBusy] = useState<string | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [connection, setConnection] = useState("Connecting");
  const [printing, setPrinting] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState("");
  const [serverTotals, setServerTotals] = useState<{
    subtotal: number;
    discount: number;
    tax: number;
    deliveryFee: number;
    total: number;
    fingerprint: string;
  } | null>(null);
  const [customerMatches, setCustomerMatches] = useState<
    Array<{ customer_key: string; name: string; phone: string | null }>
  >([]);
  const [customerBusy, setCustomerBusy] = useState(false);
  const saleLock = useRef(false);
  const actionLock = useRef(false);
  const printLock = useRef(false);
  const draftKey = `qazipro-pos:${businessId}:${branch.id}:${userId}${replacementOrder ? `:${replacementOrder.id}` : ""}`;
  const draftLocked =
    busy || Boolean(heldBusy) || Boolean(pendingPayload) || !draftReady;
  const [posOrders, setPosOrders] = useState(initialPosOrders);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [clock, setClock] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const [held, setHeld] = useState<
    Array<{
      id: string;
      label: string;
      payload: {
        cart: CartLine[];
        customer: string;
        phone: string;
        notes: string;
        fulfilment?: PosFulfilment;
        clientReference?: string;
      };
    }>
  >([]);
  const [clientReference, setClientReference] = useState(() =>
    crypto.randomUUID(),
  );
  const restoreDraft = useCallback((draft: PosDraft) => {
    setCart(draft.cart);
    setCustomer(draft.customer);
    setPhoneInput(draft.phone);
    setNotes(draft.notes);
    setFulfilment(draft.fulfilment);
    setClientReference(draft.clientReference);
    setHeldId(draft.heldId);
    setPendingPayload(draft.pendingPayload);
    if (draft.pendingPayload)
      setMessage(
        "The last sale needs confirmation. Check its status before starting another sale.",
      );
    else if (draft.cart.length)
      setMessage("Your unfinished order has been restored on this tab.");
  }, []);
  useEffect(() => {
    let cancelled = false;
    // Restore before the persistence effect can write the initially empty cart.
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
        if (
          saved?.version === 1 &&
          Date.now() - saved.savedAt < 12 * 60 * 60 * 1000 &&
          validPosDraft(saved.draft)
        )
          restoreDraft(saved.draft);
      } catch {
        /* Unavailable tab storage must not prevent counter operation. */
      }
      setDraftReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey, restoreDraft]);
  useEffect(() => {
    if (!draftReady) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          draft: {
            cart,
            customer,
            phone: phoneInput,
            notes,
            fulfilment,
            clientReference,
            heldId,
            pendingPayload,
          },
        }),
      );
    } catch {
      /* The in-memory cart remains usable if storage is unavailable. */
    }
  }, [
    cart,
    customer,
    phoneInput,
    notes,
    fulfilment,
    clientReference,
    heldId,
    pendingPayload,
    draftKey,
    draftReady,
  ]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !checkoutOpen &&
        !editing &&
        !receipt &&
        !target?.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [checkoutOpen, editing, receipt]);
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
    // Recheck timed offers while the terminal remains open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawDeals, clock],
  );
  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: number | undefined;
    let orderTimer: number | undefined;
    let disposed = false;
    let fetching = false;
    let refreshAgain = false;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 250);
    };
    const refreshOrders = async () => {
      if (fetching) {
        refreshAgain = true;
        return;
      }
      fetching = true;
      try {
        const { data, error } = await supabase
          .from("orders")
          .select(
            "id,order_number,token_number,channel,total,status,payment_status,payment_reference,operational_order_type,table_reference,customer_name,created_at,pos_order_replacements(id)",
          )
          .eq("business_id", businessId)
          .eq("branch_id", branch.id)
          .neq("status", "CANCELLED")
          .order("created_at", { ascending: false })
          .limit(50)
          .abortSignal(AbortSignal.timeout(12_000));
        if (!disposed && data && !error) setPosOrders(data as PosFlowOrder[]);
        else if (!disposed) setConnection("Reconnecting");
      } catch {
        if (!disposed) setConnection("Reconnecting");
      } finally {
        fetching = false;
        if (refreshAgain && !disposed) {
          refreshAgain = false;
          void refreshOrders();
        }
      }
    };
    const scheduleOrders = () => {
      window.clearTimeout(orderTimer);
      orderTimer = window.setTimeout(() => void refreshOrders(), 120);
    };
    const recover = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        void refreshOrders();
        refresh();
      }
    };
    const offline = () => {
      setOnline(false);
      setConnection("Offline");
    };
    const focus = () => {
      if (document.visibilityState === "visible") recover();
    };
    window.addEventListener("online", recover);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", focus);
    const boot = window.setTimeout(() => setOnline(navigator.onLine), 0);
    // Recovery/access check, not aggressive polling. Useful when realtime drops.
    const recovery = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refreshOrders();
        refresh();
      }
    }, 60_000);
    const channel = supabase
      .channel(`pos-live-${businessId}-${branch.id}-${crypto.randomUUID()}`)
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
        scheduleOrders,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "branch_product_overrides",
          filter: `branch_id=eq.${branch.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pos_sections",
          filter: `business_id=eq.${businessId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_tables",
          filter: `branch_id=eq.${branch.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "restaurant_table_sessions",
          filter: `branch_id=eq.${branch.id}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "business_operating_settings",
          filter: `business_id=eq.${businessId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (disposed) return;
        setConnection(status === "SUBSCRIBED" ? "Live" : "Reconnecting");
        if (status === "SUBSCRIBED") void refreshOrders();
      });
    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(orderTimer);
      window.clearTimeout(boot);
      window.clearInterval(recovery);
      window.removeEventListener("online", recover);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
      void supabase.removeChannel(channel);
    };
  }, [branch.id, businessId, router]);
  const subtotal = cart.reduce(
    (sum, line) =>
      sum +
      (line.unitPrice +
        line.selections.reduce((total, item) => total + item.price, 0)) *
        line.quantity,
    0,
  );
  const received = Math.max(0, Math.round(Number(cash) || 0));
  const promotion = operations.promotions.find(
    (promo) => promo.code === fulfilment.promoCode,
  );
  const discount = promotion
    ? Math.min(
        subtotal,
        promotion.maximum_discount ?? subtotal,
        promotion.discount_type === "FIXED"
          ? promotion.discount_value
          : Math.floor((subtotal * promotion.discount_value) / 100),
      )
    : 0;
  const tax = Math.round(
    (Math.max(0, subtotal - discount) * operations.taxRateBps) / 10000,
  );
  const distance = Number(fulfilment.distanceKm);
  const deliveryFee =
    fulfilment.mode === "DELIVERY" &&
    operations.deliveryRules &&
    Number.isFinite(distance)
      ? Math.max(
          0,
          Math.ceil(distance - operations.deliveryRules.free_distance_km),
        ) * operations.deliveryRules.extra_km_rate
      : 0;
  const fingerprint = JSON.stringify([cart, fulfilment]);
  const totals =
    serverTotals?.fingerprint === fingerprint
      ? serverTotals
      : {
          subtotal,
          discount,
          tax,
          deliveryFee,
          total: subtotal - discount + tax + deliveryFee,
        };
  const replacementDifference = replacementMode
    ? totals.total - Number(replacementOrder?.total ?? 0)
    : 0;
  const amountToCollect = replacementMode
    ? Math.max(0, replacementDifference)
    : totals.total;
  const fulfilmentReady =
    replacementMode ||
    (operations.modes.includes(fulfilment.mode) &&
      (fulfilment.mode !== "DINE_IN" ||
        operations.tables.some(
          (table) => table.id === fulfilment.tableId && !table.occupied,
        )) &&
      (fulfilment.mode !== "DELIVERY" ||
        Boolean(
          customer.trim() &&
          phoneInput.trim() &&
          fulfilment.deliveryAreaId &&
          fulfilment.deliveryAddress.trim() &&
          fulfilment.distanceKm !== "" &&
          Number.isFinite(distance) &&
          distance >= 0 &&
          operations.deliveryRules &&
          (operations.deliveryRules.maximum_distance_km === null ||
            distance <= operations.deliveryRules.maximum_distance_km),
        )));
  const selectedPayment =
    paymentMethods.find((item) => item.code === paymentCode) ??
    paymentMethods[0];
  const isCash =
    replacementMode || !selectedPayment || selectedPayment.kind === "CASH";
  const change = isCash ? calculateCashChange(amountToCollect, received) : 0;
  const paymentReady =
    fulfilmentReady &&
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
  const openProduct = useCallback((product: Product) => {
    if (!product.is_available || draftLocked) return;
    dialogOpener.current = document.activeElement as HTMLElement;
    setEditingLineId(null);
    setConfigurationError("");
    const variants = (product.product_variants ?? [])
      .filter((variant) => variant.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!product.groups.length && !variants.length) {
      setCart((rows) =>
        mergePosLine(rows, {
          lineId: crypto.randomUUID(),
          productId: product.id,
          itemKind: "product",
          name: product.name,
          unitPrice: product.price,
          quantity: 1,
          selections: [],
        }),
      );
      return;
    }
    setEditing(product);
    setSelectedVariantId(
      variants.find((variant) => variant.is_default)?.id ??
        variants[0]?.id ??
        null,
    );
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
  },[draftLocked]);
  const addDeal=useCallback((deal:Deal)=>{
    if(draftLocked)return;
    setCart(rows=>mergePosLine(rows,{lineId:crypto.randomUUID(),productId:deal.id,itemKind:"deal",name:deal.name,unitPrice:Number(deal.deal_price),quantity:1,selections:[]}));
  },[draftLocked]);
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
        setConfigurationError(
          `Choose at least ${group.min_selections} option${group.min_selections === 1 ? "" : "s"} for ${group.name}.`,
        );
        return;
      }
    }
    const nextLine: CartLine = {
      lineId: editingLineId ?? crypto.randomUUID(),
      productId: editing.id,
      itemKind: "product",
      name: editing.name,
      unitPrice:
        editing.price +
        Number(
          editing.product_variants?.find(
            (variant) => variant.id === selectedVariantId,
          )?.price_adjustment ?? 0,
        ),
      variantId: selectedVariantId ?? undefined,
      variantName: editing.product_variants?.find(
        (variant) => variant.id === selectedVariantId,
      )?.name,
      quantity:
        cart.find((line) => line.lineId === editingLineId)?.quantity ?? 1,
      selections: selected,
    };
    setCart((rows) =>
      editingLineId
        ? rows.map((line) => (line.lineId === editingLineId ? nextLine : line))
        : mergePosLine(rows, nextLine),
    );
    setEditing(null);
    setEditingLineId(null);
    setConfigurationError("");
    setMessage("");
  };
  const loadHeld = async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setHeldBusy("loading");
    setHeldOpen(true);
    try {
      const { data, error } = await createClient()
        .from("pos_held_orders")
        .select("id,label,payload")
        .eq("business_id", businessId)
        .eq("held_by", userId)
        .eq("branch_id", branch.id)
        .order("created_at", { ascending: false })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      setHeld((data ?? []) as typeof held);
    } catch {
      setMessage(
        "Held orders couldn't load. Your current order is unchanged; try again.",
      );
    } finally {
      actionLock.current = false;
      setHeldBusy(null);
    }
  };
  const hold = async () => {
    if (!cart.length || draftLocked || actionLock.current || !online) return;
    actionLock.current = true;
    setHeldBusy("holding");
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("pos_held_orders")
        .upsert({
          id: heldId ?? clientReference,
          business_id: businessId,
          branch_id: branch.id,
          held_by: userId,
          label: `${customer || "Counter order"} · ${formatPkr(subtotal)}`,
          payload: {
            cart,
            customer,
            phone: phoneInput,
            notes,
            fulfilment,
            clientReference,
          },
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) {
        setMessage("Unable to hold this order. Please try again.");
        return;
      }
      setCart([]);
      setCustomer("");
      setPhoneInput("");
      setNotes("");
      setCash("");
      setHeldId(null);
      setFulfilment(emptyFulfilment);
      setClientReference(crypto.randomUUID());
      setMessage("Order held safely.");
      setHeldOpen(false);
    } catch {
      setMessage(
        "The hold could not be confirmed. Retry safely; your cart is still here.",
      );
    } finally {
      actionLock.current = false;
      setHeldBusy(null);
    }
  };
  const resume = async (item: (typeof held)[number]) => {
    if (draftLocked || actionLock.current) return;
    if (
      cart.length &&
      !window.confirm("Replace the current counter order with this held order?")
    )
      return;
    setCart(item.payload.cart);
    setCustomer(item.payload.customer);
    setPhoneInput(item.payload.phone);
    setNotes(item.payload.notes);
    setFulfilment(item.payload.fulfilment ?? emptyFulfilment);
    setHeldId(item.id);
    setCash("");
    setPaymentReference("");
    setClientReference(item.payload.clientReference ?? item.id);
    setHeldOpen(false);
    setMessage(
      "Held order restored. Review availability and total before payment.",
    );
  };
  const updateOrderStage = async (
    order: PosFlowOrder,
    status: PosFlowOrder["status"],
  ) => {
    const stageOrder = ["CONFIRMED", "PREPARING", "READY", "DELIVERED"];
    if (stageOrder.indexOf(status) !== stageOrder.indexOf(order.status) + 1)
      return;
    if (actionLock.current || !online) return;
    actionLock.current = true;
    setStatusBusy(order.id);
    try {
      const { data, error } = await createClient()
        .rpc("set_pos_order_stage", {
          p_order_id: order.id,
          p_status: status,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) {
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
    } catch {
      setMessage(
        "Stage update could not be confirmed. Current orders will reconnect automatically.",
      );
    } finally {
      actionLock.current = false;
      setStatusBusy(null);
    }
  };
  const cancelPosOrder = async (order: PosFlowOrder) => {
    if (!canRefund || actionLock.current || !online) return;
    if (
      !window.confirm(
        `Cancel ${order.order_number}? Its payment will be recorded as refunded.`,
      )
    )
      return;
    actionLock.current = true;
    setStatusBusy(order.id);
    try {
      const { error } = await createClient()
        .rpc("cancel_pos_order", {
          p_order_id: order.id,
          p_reason: "Cancelled from Web POS",
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) {
        setMessage(posError(error));
      } else {
        setPosOrders((rows) => rows.filter((row) => row.id !== order.id));
        setMessage(
          `${order.order_number} cancelled and its payment recorded as refunded.`,
        );
      }
    } catch {
      setMessage(
        "Cancellation could not be confirmed. Check the order before retrying.",
      );
    } finally {
      actionLock.current = false;
      setStatusBusy(null);
    }
  };
  const submit = async () => {
    if (saleLock.current || !online) return;
    if (!shift) {
      setMessage("Open a register shift before taking a sale.");
      return;
    }
    if (!pendingPayload && (!cart.length || !paymentReady)) {
      setMessage("Complete the payment details before placing this sale.");
      return;
    }
    saleLock.current = true;
    setBusy(true);
    setMessage("");
    let confirmed = false;
    try {
      const payload = pendingPayload ?? {
        branchId: branch.id,
        shiftId: shift.id,
        clientReference,
        orderType: fulfilment.mode,
        tableId: fulfilment.mode === "DINE_IN" ? fulfilment.tableId : null,
        deliveryAreaId:
          fulfilment.mode === "DELIVERY" ? fulfilment.deliveryAreaId : null,
        deliveryAddress:
          fulfilment.mode === "DELIVERY" ? fulfilment.deliveryAddress : null,
        distanceKm:
          fulfilment.mode === "DELIVERY" ? Number(fulfilment.distanceKm) : null,
        promoCode: fulfilment.promoCode || null,
        expectedTotal: totals.total,
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
          variantId: line.variantId,
          quantity: line.quantity,
          modifiers: line.selections.map((item) => ({
            groupId: item.groupId,
            optionId: item.optionId,
          })),
        })),
      };
      // Persist the exact request before sending. An uncertain retry must not
      // become a new sale, even after a refresh or a changed menu price.
      setPendingPayload(payload);
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            version: 1,
            savedAt: Date.now(),
            draft: {
              cart,
              customer,
              phone: phoneInput,
              notes,
              fulfilment,
              clientReference,
              heldId,
              pendingPayload: payload,
            },
          }),
        );
      } catch {
        setMessage(
          "Browser storage is unavailable. Keep this tab open until payment is confirmed.",
        );
      }
      const { data, error } =
        replacementMode && replacementOrder
          ? await createClient()
              .rpc("replace_pos_order", {
                p_order_id: replacementOrder.id,
                p_payload: payload,
              })
              .abortSignal(AbortSignal.timeout(20000))
          : await createClient()
              .rpc("create_pos_order", { p_payload: payload })
              .abortSignal(AbortSignal.timeout(20000));
      if (error) {
        if (!error.code || !/^(22|23|42|P0)/.test(error.code)) throw error;
        setPendingPayload(null);
        if (error.message === "POS_TOTAL_CHANGED") {
          try {
            const current = JSON.parse(error.details);
            if (
              [
                current.subtotal,
                current.discount,
                current.tax,
                current.deliveryFee,
                current.total,
              ].every((value) => Number.isFinite(value) && value >= 0)
            )
              setServerTotals({ ...current, fingerprint });
          } catch {
            /* An invalid detail must not replace the displayed total. */
          }
          setCash("");
          setMessage(
            "Prices or fees changed. Review the updated total and payment before trying again.",
          );
          return;
        }
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
        setMessage(replacementMode ? safeServerMessage : posError(error));
        setBusy(false);
        return;
      }
      const result = data as PosResult;
      if (!result?.id || !result.orderNumber || !Number.isFinite(result.total))
        throw new Error("Uncertain sale response");
      confirmed = true;
      // Keep the exact recoverable request until the cart is reset. A refresh
      // while receipt details load must replay this sale, not create a new one.
      const persisted = await createClient()
        .from("orders")
        .select(
          "subtotal,discount,delivery_fee,tax,total,created_at,order_items(product_name,variant_name,quantity,unit_price,order_item_modifiers(group_name,option_name))",
        )
        .eq("id", result.id)
        .eq("business_id", businessId)
        .eq("branch_id", branch.id)
        .abortSignal(AbortSignal.timeout(12000))
        .single();
      const saved = persisted.data;
      const nextReceipt: ReceiptData | null = saved
        ? {
            businessName,
            logoUrl: printSettings?.logo_url,
            branchName: branch.name,
            businessAddress: branch.formatted_address ?? branch.address ?? null,
            phone,
            orderNumber: result.orderNumber,
            tokenNumber: result.tokenNumber,
            createdAt: saved?.created_at ?? new Date().toISOString(),
            orderType: String(payload.orderType),
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
            lines: saved.order_items.map((line) => ({
              name: line.product_name,
              quantity: line.quantity,
              unitPrice: line.unit_price,
              options: [
                ...(line.variant_name ? [`Variant: ${line.variant_name}`] : []),
                ...line.order_item_modifiers.map(
                  (option) => `${option.group_name}: ${option.option_name}`,
                ),
              ],
            })),
            footer:
              printSettings?.receipt_footer ??
              `Thank you for ordering from ${businessName}.`,
            footerNote: printSettings?.receipt_note,
            width: printSettings?.receipt_width_mm === 58 ? 58 : 80,
            design: {
              logoSize: printSettings?.receipt_logo_size ?? 72,
              logoAlignment: printSettings?.receipt_logo_alignment ?? "CENTER",
              headerAlignment:
                printSettings?.receipt_header_alignment ?? "CENTER",
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
          }
        : null;
      setReceipt(nextReceipt);
      setPosOrders((current) => [
        {
          id: result.id,
          order_number: result.orderNumber,
          token_number: result.tokenNumber,
          channel: "POS",
          total: result.total,
          status: "CONFIRMED",
          payment_status: "PAID",
          payment_reference:
            paymentReference.trim() || selectedPayment?.code || "CASH",
          operational_order_type: String(payload.orderType),
          created_at: saved?.created_at ?? new Date().toISOString(),
          pos_order_replacements: replacementMode ? [{ id: "new" }] : [],
        },
        ...current.filter((order) => order.id !== result.id),
      ]);
      if (replacementMode) setReplacementCompleted(true);
      if (heldId) {
        const cleanup = await createClient()
          .from("pos_held_orders")
          .delete()
          .eq("id", heldId)
          .eq("business_id", businessId)
          .eq("branch_id", branch.id)
          .eq("held_by", userId)
          .abortSignal(AbortSignal.timeout(8000));
        if (!cleanup.error)
          setHeld((rows) => rows.filter((row) => row.id !== heldId));
      }
      setHeldId(null);
      setFulfilment(emptyFulfilment);
      setPendingPayload(null);
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
      if (!saved)
        setMessage(
          `Order ${result.orderNumber} is paid. Receipt details could not load; reopen it from Receipts. Do not take payment again.`,
        );
    } catch {
      if (confirmed) {
        setPendingPayload(null);
        setCart([]);
        setCash("");
        setCustomer("");
        setPhoneInput("");
        setNotes("");
        setHeldId(null);
        setFulfilment(emptyFulfilment);
        setCheckoutOpen(false);
        setClientReference(crypto.randomUUID());
        setMessage(
          "Payment is confirmed. Receipt details are temporarily unavailable; reopen the order from Receipts. Do not take payment again.",
        );
      } else
        setMessage(
          "The sale could not be confirmed. It may already be paid. Reconnect and check this same sale; do not start another payment.",
        );
    } finally {
      saleLock.current = false;
      setBusy(false);
    }
  };
  const printReceipt = useCallback(
    async (document: ReceiptData) => {
      if (!canPrint || printLock.current) return;
      printLock.current = true;
      setPrinting(true);
      try {
        await browserPrinter.print({
          kind: "customer-receipt",
          paperWidth: document.width === 58 ? "58mm" : "80mm",
          copies: 1,
        });
      } catch {
        setMessage(
          "The print dialog could not open. Your sale is paid; retry printing the receipt.",
        );
      } finally {
        printLock.current = false;
        setPrinting(false);
      }
    },
    [canPrint],
  );
  useEffect(() => {
    if (!receipt || !printSettings?.auto_print_receipt) return;
    const frame = requestAnimationFrame(() => void printReceipt(receipt));
    return () => cancelAnimationFrame(frame);
  }, [receipt, printSettings?.auto_print_receipt, printReceipt]);
  const updateQty = (lineId: string, delta: number) =>
    !draftLocked &&
    setCart((rows) =>
      rows.map((line) =>
        line.lineId === lineId
          ? {
              ...line,
              quantity: Math.min(50, Math.max(1, line.quantity + delta)),
            }
          : line,
      ),
    );
  const lookupCustomers = async () => {
    if (!canLookupCustomers || customerBusy || draftLocked) return;
    const term = phoneInput.trim() || customer.trim();
    if (term.length < 2) {
      setMessage(
        "Enter at least two characters of the customer's name or phone.",
      );
      return;
    }
    setCustomerBusy(true);
    try {
      const { data, error } = await createClient()
        .rpc("customer_directory", {
          p_business_id: businessId,
          p_offset: 0,
          p_query: term,
        })
        .abortSignal(AbortSignal.timeout(12000));
      if (error) throw error;
      const matches = (data as { rows?: typeof customerMatches })?.rows ?? [];
      setCustomerMatches(matches.slice(0, 5));
      if (!matches.length)
        setMessage(
          "No matching customers. You can continue with the details entered.",
        );
    } catch {
      setMessage(
        "Customer search is unavailable. You can still enter their details manually.",
      );
    } finally {
      setCustomerBusy(false);
    }
  };
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: reducedMotion ? 0 : 0.18, ease: "easeOut" }}
    >
      <div className="pos-page">
        <div className="pos-connection" role="status">
          <span data-connected={online && connection === "Live"}>
            {online ? connection : "Offline — cart retained"}
          </span>
          <span>
            {shift ? "Counter shift open" : "Open a shift to take payment"}
          </span>
          <kbd>/</kbd>
          <span>Search · Esc closes dialogs</span>
        </div>
        {pendingPayload && (
          <div className="inline-notice is-warning" role="alert">
            <strong>Payment needs confirmation.</strong> Your order is locked to
            prevent a duplicate sale. Reconnect and check the same request.
            <button
              className="button"
              disabled={busy || !online}
              onClick={() => void submit()}
            >
              {busy ? "Checking sale…" : "Check payment status"}
            </button>
          </div>
        )}
        <p className="warning-note pos-small-screen-note">
          For faster counter service, use a tablet or desktop. On this screen,
          the order and payment controls appear below the menu.
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
                disabled={Boolean(heldBusy) || busy}
                onClick={() =>
                  heldOpen ? setHeldOpen(false) : void loadHeld()
                }
              >
                <Pause />
                {heldBusy === "loading"
                  ? "Loading held orders…"
                  : "Held orders"}{" "}
                {held.length > 0 && `(${held.length})`}
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
        {!replacementMode && heldOpen && (
          <div className="held-orders no-print">
            {!held.length && (
              <p>
                {heldBusy
                  ? "Loading your held orders…"
                  : "No held orders for your counter."}
              </p>
            )}
            {held.map((item) => (
              <div key={item.id}>
                <button
                  disabled={draftLocked}
                  onClick={() => void resume(item)}
                >
                  <strong>{item.label}</strong>
                  <small>Resume order</small>
                </button>
                <button
                  aria-label={`Cancel held order ${item.label}`}
                  disabled={draftLocked}
                  onClick={async () => {
                    if (
                      actionLock.current ||
                      !window.confirm(
                        "Discard this held order? This cannot be undone.",
                      )
                    )
                      return;
                    actionLock.current = true;
                    setHeldBusy(item.id);
                    try {
                      const { error } = await createClient()
                        .from("pos_held_orders")
                        .delete()
                        .eq("id", item.id)
                        .eq("business_id", businessId)
                        .eq("branch_id", branch.id)
                        .eq("held_by", userId)
                        .abortSignal(AbortSignal.timeout(12000));
                      if (error)
                        setMessage(
                          "Unable to cancel the held order. Please retry.",
                        );
                      else
                        setHeld((rows) =>
                          rows.filter((row) => row.id !== item.id),
                        );
                    } catch {
                      setMessage(
                        "Couldn't confirm removal. Refresh held orders before retrying.",
                      );
                    } finally {
                      actionLock.current = false;
                      setHeldBusy(null);
                    }
                  }}
                >
                  {heldBusy === item.id ? "Removing…" : "Discard"}
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
                <h2>Live branch orders</h2>
              </div>
            </header>
            {activePosOrders.length ? (
              <div className="pos-flow-strip">
                {activePosOrders.map((order) => {
                  const isCounterOrder = order.channel === "POS";
                  const nextStage =
                    order.status === "CONFIRMED"
                      ? "PREPARING"
                      : order.status === "PREPARING"
                        ? "READY"
                        : "DELIVERED";
                  const replacementEligible =
                    isCounterOrder &&
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
                        <small>
                          {order.channel === "WEBSITE"
                            ? "Online"
                            : order.channel === "POS"
                              ? "Counter"
                              : "Integration"}
                        </small>
                      </div>
                      <div className="pos-stage-buttons">
                        <span
                          className={`pos-current-stage pos-stage-${order.status.toLowerCase()}`}
                        >
                          {order.status.charAt(0) +
                            order.status.slice(1).toLowerCase()}
                        </span>
                        {isCounterOrder &&
                          ["CONFIRMED", "PREPARING", "READY"].includes(
                            order.status,
                          ) && (
                            <button
                              className={`pos-stage-action pos-stage-${nextStage.toLowerCase()}`}
                              disabled={statusBusy !== null}
                              onClick={() =>
                                void updateOrderStage(
                                  order,
                                  nextStage as PosFlowOrder["status"],
                                )
                              }
                            >
                              {statusBusy === order.id
                                ? "Updating…"
                                : nextStage === "PREPARING"
                                  ? "Start preparing"
                                  : nextStage === "READY"
                                    ? "Mark ready"
                                    : "Mark delivered"}
                            </button>
                          )}
                        {!isCounterOrder && (
                          <Link
                            className="pos-stage-action"
                            href={`/orders?order=${encodeURIComponent(order.id)}`}
                          >
                            Open order
                          </Link>
                        )}
                        {replacementEligible && (
                          <Link
                            className="pos-replacement-action"
                            href={`/pos?replace=${order.id}`}
                          >
                            <RotateCcw />
                            Replacement
                          </Link>
                        )}
                        {isCounterOrder && canRefund && (
                          <button
                            className="pos-cancel-action"
                            disabled={statusBusy !== null}
                            onClick={() => void cancelPosOrder(order)}
                          >
                            <X />
                            {statusBusy===order.id ? "Updating…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="pos-flow-empty">
                No active branch orders. New counter and online sales appear
                here instantly.
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
        <div
          className="pos-layout no-print"
          inert={checkoutOpen || Boolean(editing) || Boolean(receipt)}
        >
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
              {query && <button className="icon-action" aria-label="Clear search" onClick={()=>{setQuery("");searchRef.current?.focus();}}><X/></button>}
            </div>
            <div className="pos-categories">
              <button
                className={category === "all" ? "is-active" : ""}
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
              >
                All
              </button>
              <button
                className={category === "deals" ? "is-active" : ""}
                aria-pressed={category === "deals"}
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
                    aria-pressed={category === item.id}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
            </div>
            <PosProductGrid products={products} deals={deals} category={category} query={query} locked={draftLocked} onProduct={openProduct} onDeal={addDeal}/>
          </section>
          <aside className="pos-cart">
            <header>
              <span>
                <ShoppingCart />
                <strong>Current order</strong>
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Clear the current order?")) setCart([]);
                }}
                disabled={!cart.length || draftLocked}
              >
                Clear
              </button>
            </header>
            {!replacementMode && (
              <div className="pos-fulfilment">
                <div className="pos-modes" aria-label="Order type">
                  {operations.modes.map((mode) => (
                    <button
                      key={mode}
                      disabled={draftLocked}
                      aria-pressed={fulfilment.mode === mode}
                      onClick={() =>
                        setFulfilment({
                          ...emptyFulfilment,
                          mode: mode as PosFulfilment["mode"],
                          promoCode: fulfilment.promoCode,
                        })
                      }
                    >
                      {mode.replaceAll("_", " ").toLowerCase()}
                    </button>
                  ))}
                </div>
                {fulfilment.mode === "DINE_IN" && (
                  <label>
                    Table
                    <select
                      aria-label="Table"
                      disabled={draftLocked}
                      value={fulfilment.tableId}
                      onChange={(event) =>
                        setFulfilment({
                          ...fulfilment,
                          tableId: event.target.value,
                        })
                      }
                    >
                      <option value="">Select a table</option>
                      {operations.tables.map((table) => (
                        <option
                          key={table.id}
                          value={table.id}
                          disabled={table.occupied}
                        >
                          {table.name}
                          {table.occupied ? " — open bill" : ""}
                        </option>
                      ))}
                    </select>
                    <small>
                      Existing table bills appear in the table-payment queue.
                    </small>
                  </label>
                )}
                {fulfilment.mode === "DELIVERY" && (
                  <>
                    <label>
                      Delivery area
                      <select
                        disabled={draftLocked}
                        value={fulfilment.deliveryAreaId}
                        onChange={(event) =>
                          setFulfilment({
                            ...fulfilment,
                            deliveryAreaId: event.target.value,
                          })
                        }
                      >
                        <option value="">Choose a service area</option>
                        {operations.deliveryAreas.map((area) => (
                          <option key={area.id} value={area.id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Delivery address
                      <input
                        disabled={draftLocked}
                        value={fulfilment.deliveryAddress}
                        onChange={(event) =>
                          setFulfilment({
                            ...fulfilment,
                            deliveryAddress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Confirmed distance (km)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        disabled={draftLocked}
                        value={fulfilment.distanceKm}
                        onChange={(event) =>
                          setFulfilment({
                            ...fulfilment,
                            distanceKm: event.target.value,
                          })
                        }
                      />
                    </label>
                    <small>
                      Confirm the distance before collecting payment. The server
                      applies the configured branch delivery rules.
                    </small>
                  </>
                )}
              </div>
            )}
            <div className="pos-cart-lines">
              <AnimatePresence initial={false}>
                {cart.map((line) => (
                  <motion.article
                    key={line.lineId}
                    initial={{ opacity: 0, x: reducedMotion ? 0 : 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reducedMotion ? 0 : -8 }}
                  >
                    <div>
                      <strong>{line.name}</strong>
                      {line.itemKind !== "deal" && (
                        <button
                          className="pos-edit-line"
                          disabled={draftLocked}
                      onClick={() => {
                        dialogOpener.current = document.activeElement as HTMLElement;
                        const product = products.find(
                              (item) => item.id === line.productId,
                            );
                            if (!product?.is_available) {
                              setMessage("This item is no longer available.");
                              return;
                            }
                            setEditing(product);
                            setEditingLineId(line.lineId);
                            setSelected(line.selections);
                            setSelectedVariantId(line.variantId ?? null);
                            setConfigurationError("");
                          }}
                          aria-label={`Edit ${line.name}`}
                        >
                          Edit
                        </button>
                      )}
                      {line.variantName && (
                        <small>Variant: {line.variantName}</small>
                      )}
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
                      <button
                        disabled={draftLocked || line.quantity <= 1}
                        aria-label={`Decrease ${line.name}`}
                        onClick={() => updateQty(line.lineId, -1)}
                      >
                        <Minus />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        disabled={draftLocked || line.quantity >= 50}
                        aria-label={`Increase ${line.name}`}
                        onClick={() => updateQty(line.lineId, 1)}
                      >
                        <Plus />
                      </button>
                      <button
                        onClick={() =>
                          setCart((rows) =>
                            rows.filter((item) => item.lineId !== line.lineId),
                          )
                        }
                        aria-label={`Remove ${line.name}`}
                        disabled={draftLocked}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
              {!cart.length && (
                <div className="empty-panel">
                  <ShoppingCart />
                  <p>Select a product to start a counter order.</p>
                </div>
              )}
            </div>
            <div className="pos-customer">
              <input
                aria-label="Customer name"
                disabled={draftLocked}
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="Customer name (optional)"
              />
              <input
                aria-label="Customer phone"
                type="tel"
                disabled={draftLocked}
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="Phone (optional)"
              />
              <textarea
                aria-label="Order notes"
                disabled={draftLocked}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Order notes"
              />
              {canLookupCustomers && (
                <button
                  className="button button--outline"
                  disabled={draftLocked || customerBusy}
                  onClick={() => void lookupCustomers()}
                >
                  {customerBusy
                    ? "Searching customers…"
                    : "Find existing customer"}
                </button>
              )}
              {customerMatches.map((match) => (
                <button
                  key={match.customer_key}
                  disabled={draftLocked}
                  onClick={() => {
                    setCustomer(match.name);
                    setPhoneInput(match.phone ?? "");
                    setCustomerMatches([]);
                  }}
                >
                  {match.name} · {match.phone}
                </button>
              ))}
              {operations.promotions.length > 0 && !replacementMode && (
                <label>
                  Promotion
                  <select
                    disabled={draftLocked}
                    value={fulfilment.promoCode}
                    onChange={(event) =>
                      setFulfilment({
                        ...fulfilment,
                        promoCode: event.target.value,
                      })
                    }
                  >
                    <option value="">No discount</option>
                    {operations.promotions.map((promo) => (
                      <option key={promo.code}>{promo.code}</option>
                    ))}
                  </select>
                </label>
              )}
              {replacementMode && (
                <label className="pos-replacement-reason">
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
            </div>
            <div className="pos-payment">
              <div>
                <span>Subtotal</span>
                <span>{formatPkr(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div>
                  <span>Discount</span>
                  <span>− {formatPkr(totals.discount)}</span>
                </div>
              )}
              <div>
                <span>Tax</span>
                <span>{formatPkr(totals.tax)}</span>
              </div>
              {fulfilment.mode === "DELIVERY" && (
                <div>
                  <span>Delivery</span>
                  <span>{formatPkr(totals.deliveryFee)}</span>
                </div>
              )}
              <div>
                <span>{replacementMode ? "New total" : "Total"}</span>
                <motion.strong
                  key={totals.total}
                  initial={{ opacity: 0.65 }}
                  animate={{ opacity: 1 }}
                >
                  {formatPkr(totals.total)}
                </motion.strong>
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
                  disabled={
                    draftLocked || !online || (!cart.length && !replacementMode)
                  }
                >
                  <Pause />
                  {heldBusy === "holding"
                    ? "Holding…"
                    : replacementMode
                      ? "Cancel"
                      : "Hold"}
                </button>
                <button
                  className="button"
                  onClick={() => {dialogOpener.current = document.activeElement as HTMLElement;setCheckoutOpen(true);}}
                  disabled={
                    draftLocked ||
                    !online ||
                    !shift ||
                    !cart.length ||
                    !fulfilmentReady
                  }
                >
                  <CreditCard />
                  {replacementMode ? "Review replacement" : "Checkout"}
                </button>
              </div>
            </div>
          </aside>
        </div>
        <AnimatePresence onExitComplete={()=>requestAnimationFrame(()=>dialogOpener.current?.focus())}>
          {checkoutOpen && (
            <motion.div
              className="drawer-backdrop no-print pos-checkout-backdrop"
              initial={{ opacity: 0.96 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{duration:0.12}}
            >
              <motion.section
                className="pos-checkout-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pos-checkout-title"
                initial={{ y: 6 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ y: 6 }}
                transition={{duration:0.12}}
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
                <fieldset
                  className="pos-checkout-body"
                  disabled={busy || Boolean(pendingPayload)}
                >
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
                            aria-pressed={paymentCode === method.code}
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
                            <strong>{formatPkr(totals.total)}</strong>
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
                          disabled={
                            replacementMode && replacementDifference <= 0
                          }
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
                      <strong>{formatPkr(totals.total)}</strong>
                    </div>
                    {message && <p role="status">{message}</p>}
                    <button
                      className="button pos-place-order"
                      disabled={
                        busy ||
                        !online ||
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
                          ? "Confirm replacement"
                          : "Complete sale"}
                    </button>
                  </section>
                </fieldset>
                {pendingPayload && (
                  <button
                    className="button"
                    disabled={busy || !online}
                    onClick={() => void submit()}
                  >
                    {busy ? "Checking sale…" : "Check payment status"}
                  </button>
                )}
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
                  {Boolean(
                    editing.product_variants?.filter(
                      (variant) => variant.is_active,
                    ).length,
                  ) && (
                    <fieldset>
                      <legend>
                        Variant <small>Required</small>
                      </legend>
                      {editing.product_variants
                        .filter((variant) => variant.is_active)
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((variant) => (
                          <button
                            key={variant.id}
                            aria-pressed={selectedVariantId === variant.id}
                            className={
                              selectedVariantId === variant.id
                                ? "is-selected"
                                : ""
                            }
                            onClick={() => setSelectedVariantId(variant.id)}
                          >
                            <i>
                              {selectedVariantId === variant.id && <Check />}
                            </i>
                            <span>{variant.name}</span>
                            <b>
                              {variant.price_adjustment
                                ? `+ ${formatPkr(variant.price_adjustment)}`
                                : "Base price"}
                            </b>
                          </button>
                        ))}
                    </fieldset>
                  )}
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
                            aria-pressed={checked}
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
                  {configurationError && (
                    <p role="alert">{configurationError}</p>
                  )}
                  <button
                    className="button button--outline"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button className="button" onClick={addCustomized}>
                    {editingLineId ? "Update item" : "Add to order"} ·{" "}
                    {formatPkr(
                      editing.price +
                        Number(
                          editing.product_variants?.find(
                            (variant) => variant.id === selectedVariantId,
                          )?.price_adjustment ?? 0,
                        ) +
                        selected.reduce((sum, item) => sum + item.price, 0),
                    )}
                  </button>
                </footer>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
        {receipt && (
          <div className="receipt-preview" role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title">
            <div className="receipt-preview__actions no-print">
              <strong id="pos-receipt-title">Receipt ready</strong>
              <button
                className="button button--outline"
                aria-label="Close receipt and start new order"
                onClick={() => {
                  setReceipt(null);
                  requestAnimationFrame(() => searchRef.current?.focus());
                }}
              >
                <X />
                Close
              </button>
              <button
                disabled={!canPrint || printing}
                className="button"
                onClick={() => void printReceipt(receipt)}
              >
                <Printer />
                {printing ? "Preparing…" : "Print receipt"}
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
    </MotionConfig>
  );
}
