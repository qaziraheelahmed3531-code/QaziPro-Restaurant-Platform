import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DesktopDialogs } from "./dialog-accessibility";
import {
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  CheckCheck,
  ChefHat,
  CircleDollarSign,
  Cloud,
  CreditCard,
  History,
  LogOut,
  Minus,
  Pause,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  activeShift,
  closeShift,
  db,
  localId,
  nextToken,
  openShift,
  posLocked,
  setPosLocked,
} from "./db";
import {
  availableBranches,
  downloadCatalog,
  imageDataUrl,
  loadWebsiteOrders,
  supabase,
  syncPendingOrders,
  updateWebsiteOrderStatus,
} from "./sync";
import type {
  CartLine,
  CatalogProduct,
  CatalogSnapshot,
  HeldOrder,
  LocalOrder,
  LocalShift,
  PosPaymentMethod,
  WebsiteOrder,
  WebsiteOrderStatus,
} from "./types";

type Stage = "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED";
type Branch = {
  id: string;
  name: string;
  restaurant_name: string | null;
  city: string;
};
const stages: Stage[] = ["CONFIRMED", "PREPARING", "READY", "DELIVERED"];
const nextStage = (status: Stage): Stage | null => {
  const next = stages[stages.indexOf(status) + 1];
  return next ?? null;
};
const websiteNext: Record<WebsiteOrderStatus, WebsiteOrderStatus | null> = {
  RECEIVED: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};
const money = (value: number) =>
  `Rs ${Math.round(value).toLocaleString("en-PK")}`;
const replacementMoney = (oldTotal: number, newTotal: number) => {
  const difference = newTotal - oldTotal;
  return {
    difference,
    label:
      difference > 0
        ? "Extra to collect"
        : difference < 0
          ? "Refund to customer"
          : "Balance",
    amount: Math.abs(difference),
  };
};
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const defaults = (p: CatalogProduct) =>
  p.groups.flatMap((g) =>
    g.options
      .filter((o) => o.isDefault)
      .slice(0, g.selection === "SINGLE" ? 1 : (g.max ?? 99))
      .map((o) => ({
        groupId: g.id,
        optionId: o.id,
        groupName: g.name,
        optionName: o.name,
        price: o.price,
      })),
  );

let alertAudioContext: AudioContext | null = null;
async function playDesktopOrderSound(source?: string | null) {
  if (source) {
    try {
      const sound = new Audio(source);
      sound.volume = 1;
      await sound.play();
      return;
    } catch {
      /* Fall through to the built-in chime. */
    }
  }
  try {
    alertAudioContext ??= new AudioContext();
    if (alertAudioContext.state === "suspended")
      await alertAudioContext.resume();
    const start = alertAudioContext.currentTime;
    for (const [frequency, delay] of [
      [740, 0],
      [960, 0.13],
    ] as const) {
      const oscillator = alertAudioContext.createOscillator();
      const gain = alertAudioContext.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + delay);
      gain.gain.exponentialRampToValueAtTime(0.1, start + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.18);
      oscillator.connect(gain);
      gain.connect(alertAudioContext.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + 0.2);
    }
  } catch {
    /* The visible bell alert remains available. */
  }
}
async function nativeIconDataUrl(source: string) {
  return new Promise<string | null>((resolve) => {
    const icon = new Image();
    icon.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return resolve(null);
      const scale = Math.min(
        size / icon.naturalWidth,
        size / icon.naturalHeight,
      );
      const width = Math.max(1, Math.round(icon.naturalWidth * scale));
      const height = Math.max(1, Math.round(icon.naturalHeight * scale));
      context.clearRect(0, 0, size, size);
      context.drawImage(
        icon,
        Math.round((size - width) / 2),
        Math.round((size - height) / 2),
        width,
        height,
      );
      resolve(canvas.toDataURL("image/png"));
    };
    icon.onerror = () => resolve(null);
    icon.src = source;
  });
}
async function desktopSoundFileError(file: File) {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  const allowed: Record<string, string[]> = {
    "audio/mpeg": ["mp3"],
    "audio/wav": ["wav"],
    "audio/ogg": ["ogg"],
  };
  if (!allowed[file.type]?.includes(extension))
    return "Choose a genuine MP3, WAV or OGG file.";
  if (!file.size || file.size > 5 * 1024 * 1024)
    return "Sound must be smaller than 5 MB.";
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer()),
    text = String.fromCharCode(...bytes);
  const valid =
    file.type === "audio/wav"
      ? text.startsWith("RIFF") && text.slice(8, 12) === "WAVE"
      : file.type === "audio/ogg"
        ? text.startsWith("OggS")
        : text.startsWith("ID3") ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return valid ? null : "The file contents do not match its audio format.";
}

export function App() {
  const [booting, setBooting] = useState(true),
    [locked, setLocked] = useState(false),
    [session, setSession] = useState(false);
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null),
    [branches, setBranches] = useState<Branch[]>([]),
    [shift, setShift] = useState<LocalShift | null>(null),
    [orders, setOrders] = useState<LocalOrder[]>([]),
    [held, setHeld] = useState<HeldOrder[]>([]),
    [websiteOrders, setWebsiteOrders] = useState<WebsiteOrder[]>([]),
    [websiteBusy, setWebsiteBusy] = useState(false),
    [websiteActionId, setWebsiteActionId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine),
    [syncing, setSyncing] = useState(false),
    [message, setMessage] = useState(""),
    [view, setView] = useState<"sale" | "orders" | "settings">("sale");
  const [deviceAlertsEnabled, setDeviceAlertsEnabled] = useState(true),
    [deviceSoundDataUrl, setDeviceSoundDataUrl] = useState<string | null>(null),
    [notificationOpen, setNotificationOpen] = useState(false),
    [unreadWebsiteIds, setUnreadWebsiteIds] = useState<Set<string>>(new Set()),
    [focusedWebsiteOrderId, setFocusedWebsiteOrderId] = useState<string | null>(
      null,
    );
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [otpChallenge, setOtpChallenge] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [authError, setAuthError] = useState(""),
    [authMessage, setAuthMessage] = useState("");
  const [openingCash, setOpeningCash] = useState("0"),
    [countedCash, setCountedCash] = useState("");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [cart, setCart] = useState<CartLine[]>([]),
    [customer, setCustomer] = useState(""),
    [phone, setPhone] = useState(""),
    [notes, setNotes] = useState(""),
    [orderType, setOrderType] = useState<"TAKEAWAY" | "DINE_IN">("TAKEAWAY"),
    [table, setTable] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false),
    [paymentCode, setPaymentCode] = useState("CASH"),
    [paymentReference, setPaymentReference] = useState(""),
    [cash, setCash] = useState("");
  const [customizing, setCustomizing] = useState<CatalogProduct | null>(null),
    [chosen, setChosen] = useState<Record<string, string[]>>({}),
    [chosenVariantId,setChosenVariantId]=useState<string|null>(null),
    [receipt, setReceipt] = useState<LocalOrder | null>(null),
    [replacing, setReplacing] = useState<LocalOrder | null>(null),
    [replacementReason, setReplacementReason] = useState(
      "Customer requested a different item",
    );
  const searchRef = useRef<HTMLInputElement>(null),
    knownWebsiteIds = useRef(new Set<string>()),
    websiteLoaded = useRef(false),
    branchForSync = catalog?.branchId;
  const loginRequired =
    locked || (!session && online) || (!catalog && !session);

  const refreshLocal = useCallback(async (branchId?: string) => {
    const activeCatalog = branchId
      ? await db.catalogs.get(branchId)
      : await db.catalogs.orderBy("updatedAt").last();
    if (!activeCatalog) return null;
    const localOrders = await db.orders
      .where("branchId")
      .equals(activeCatalog.branchId)
      .sortBy("soldAt");
    setCatalog(activeCatalog);
    setShift((await activeShift(activeCatalog.branchId)) ?? null);
    setOrders(localOrders.reverse());
    setHeld(await db.held.orderBy("createdAt").reverse().toArray());
    return activeCatalog;
  }, []);
  const refreshWebsite = useCallback(
    async (branchId?: string, quiet = true) => {
      if (!branchId || !navigator.onLine) return;
      if (!quiet) setWebsiteBusy(true);
      try {
        const rows = await loadWebsiteOrders(branchId);
        if (!websiteLoaded.current) {
          knownWebsiteIds.current = new Set(rows.map((order) => order.id));
          websiteLoaded.current = true;
        }
        setWebsiteOrders(rows);
      } catch (error) {
        if (!quiet)
          setMessage(
            error instanceof Error
              ? error.message
              : "Website orders could not be loaded.",
          );
      } finally {
        if (!quiet) setWebsiteBusy(false);
      }
    },
    [],
  );
  const sync = useCallback(
    async (silent = false) => {
      if (!navigator.onLine) return;
      setSyncing(true);
      if (!silent) setMessage("Syncing catalog and offline sales…");
      try {
        const result = await syncPendingOrders();
        if (branchForSync) setCatalog(await downloadCatalog(branchForSync));
        await Promise.all([
          refreshLocal(branchForSync),
          refreshWebsite(branchForSync),
        ]);
        if (!silent || result.synced || result.failed)
          setMessage(
            result.failed
              ? `${result.synced} synced · ${result.failed} need attention`
              : `Everything synced · ${result.synced} new order${result.synced === 1 ? "" : "s"}`,
          );
      } catch (error) {
        if (!silent)
          setMessage(
            error instanceof Error ? error.message : "Sync unavailable",
          );
      } finally {
        setSyncing(false);
      }
    },
    [branchForSync, refreshLocal, refreshWebsite],
  );

  const openWebsiteOrder = useCallback((orderId: string) => {
    setUnreadWebsiteIds((current) => {
      const next = new Set(current);
      next.delete(orderId);
      return next;
    });
    setFocusedWebsiteOrderId(orderId);
    setNotificationOpen(false);
    setView("orders");
    window.setTimeout(
      () =>
        document
          .querySelector(`[data-website-order-id="${CSS.escape(orderId)}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80,
    );
  }, []);

  const notifyIncomingWebsiteOrder = useCallback(
    (order: Partial<WebsiteOrder> & { id?: string; channel?: string }) => {
      if (
        !order.id ||
        order.channel !== "WEBSITE" ||
        order.status !== "RECEIVED" ||
        knownWebsiteIds.current.has(order.id)
      )
        return;
      knownWebsiteIds.current.add(order.id);
      setUnreadWebsiteIds((current) => new Set(current).add(order.id!));
      const token = String(order.token_number ?? 0).padStart(3, "0");
      const title = "New website order";
      const body = `${order.order_number ?? "New order"} · Token ${token} · ${money(Number(order.total ?? 0))}`;
      setMessage(body);
      if (
        deviceAlertsEnabled &&
        catalog &&
        catalog.desktopOrderSound !== false
      ) {
        void playDesktopOrderSound(
          deviceSoundDataUrl ??
            catalog.orderNotificationSoundDataUrl ??
            catalog.orderNotificationSoundUrl,
        );
        void window.desktopPOS?.notify({ title, body, orderId: order.id });
      }
    },
    [catalog, deviceAlertsEnabled, deviceSoundDataUrl],
  );

  useEffect(() => {
    void (async () => {
      const cached = await refreshLocal(),
        storedLock = await posLocked(),
        alertPreference = await db.settings.get("orderAlertsEnabled"),
        soundPreference = await db.settings.get("orderAlertSound"),
        { data } = await supabase.auth.getSession();
      setSession(Boolean(data.session));
      setLocked(storedLock);
      setDeviceAlertsEnabled(alertPreference?.value !== "false");
      setDeviceSoundDataUrl(soundPreference?.value || null);
      if (data.session && navigator.onLine)
        try {
          const assigned = await availableBranches();
          setBranches(assigned);
          if (
            cached &&
            !assigned.some(
              (branch) =>
                branch.id === cached.branchId &&
                branch.business_id === cached.businessId,
            )
          ) {
            setCatalog(null);
            setShift(null);
          }
        } catch (error) {
          setAuthError(
            error instanceof Error
              ? error.message
              : "Unable to load assigned restaurant.",
          );
        }
      if (!data.session && (navigator.onLine || !cached)) setLocked(true);
      setBooting(false);
    })();
    const onOnline = () => {
        setOnline(true);
        void sync(true);
      },
      onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(Boolean(value));
      if (!value && navigator.onLine) setLocked(true);
    });
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      data.subscription.unsubscribe();
    };
  }, [refreshLocal, sync]);
  useEffect(() => {
    const unsubscribe = window.desktopPOS?.onOAuthCallback(async (url) => {
      setAuthError("");
      setAuthBusy(true);
      try {
        const callback = new URL(url),
          hash = new URLSearchParams(callback.hash.slice(1)),
          errorText =
            callback.searchParams.get("error_description") ??
            hash.get("error_description") ??
            callback.searchParams.get("error") ??
            hash.get("error");
        if (errorText) throw new Error(errorText);
        const code = callback.searchParams.get("code"),
          tokenHash = callback.searchParams.get("token_hash"),
          access = hash.get("access_token"),
          refresh = hash.get("refresh_token"),
          result = tokenHash
            ? await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type: "magiclink",
              })
            : code
              ? await supabase.auth.exchangeCodeForSession(code)
              : access && refresh
                ? await supabase.auth.setSession({
                    access_token: access,
                    refresh_token: refresh,
                  })
                : {
                    error: new Error(
                      "Google did not return a secure sign-in session.",
                    ),
                  };
        if (result.error) throw result.error;
        const assignedBranches = await availableBranches();
        setBranches(assignedBranches);
        setCatalog(null);
        setShift(null);
        setLocked(false);
        await setPosLocked(false);
      } catch (error) {
        setAuthError(
          error instanceof Error ? error.message : "Google sign-in failed.",
        );
      } finally {
        setAuthBusy(false);
      }
    });
    return unsubscribe ?? (() => {});
  }, []);
  useEffect(
    () => window.desktopPOS?.onNotificationOpen(openWebsiteOrder) ?? (() => {}),
    [openWebsiteOrder],
  );
  useEffect(() => {
    const restaurantIcon =
      catalog?.faviconDataUrl ?? catalog?.logoDataUrl ?? null;
    if (loginRequired || !catalog || !restaurantIcon) return;
    const restaurantName = catalog.businessName;
    const restaurantId = catalog.businessId;
    let cancelled = false;
    void nativeIconDataUrl(restaurantIcon).then((icon) => {
      if (!cancelled && icon)
        void window.desktopPOS?.setBranding(
          icon,
          restaurantName,
          restaurantId,
        );
    });
    return () => {
      cancelled = true;
    };
  }, [
    loginRequired,
    catalog?.businessId,
    catalog?.faviconDataUrl,
    catalog?.logoDataUrl,
    catalog?.businessName,
  ]);
  useEffect(() => {
    if (booting || !loginRequired) return;
    let cancelled = false;
    void imageDataUrl("/qazipro-logo.png").then((logo) => {
      if (!cancelled && logo)
        void window.desktopPOS?.setBranding(logo, "QaziPRO POS Desktop");
    });
    return () => {
      cancelled = true;
    };
  }, [booting, loginRequired]);
  useEffect(() => {
    if (session && online && !branches.length)
      void availableBranches()
        .then(setBranches)
        .catch((e) =>
          setAuthError(
            e instanceof Error
              ? e.message
              : "Unable to load assigned restaurant.",
          ),
        );
  }, [session, online, branches.length]);
  useEffect(() => {
    if (!branchForSync || !online || !session) return;
    void sync(true);
    const timer = window.setInterval(() => void sync(true), 60_000);
    return () => window.clearInterval(timer);
  }, [branchForSync, online, session, sync]);
  useEffect(() => {
    if (!branchForSync || !online || !session) {
      if (!online) setWebsiteOrders([]);
      return;
    }
    knownWebsiteIds.current.clear();
    websiteLoaded.current = false;
    void refreshWebsite(branchForSync, false);
    const channel = supabase
      .channel(`desktop-website-orders-${branchForSync}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchForSync}`,
        },
        (payload) => {
          notifyIncomingWebsiteOrder(
            payload.new as Partial<WebsiteOrder> & {
              id?: string;
              channel?: string;
            },
          );
          void refreshWebsite(branchForSync);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchForSync}`,
        },
        () => void refreshWebsite(branchForSync),
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchForSync}`,
        },
        () => void refreshWebsite(branchForSync),
      )
      .subscribe();
    const fallback = window.setInterval(
      () => void refreshWebsite(branchForSync),
      15_000,
    );
    return () => {
      window.clearInterval(fallback);
      void supabase.removeChannel(channel);
    };
  }, [
    branchForSync,
    notifyIncomingWebsiteOrder,
    online,
    refreshWebsite,
    session,
  ]);
  useEffect(() => {
    const active = new Set(
      websiteOrders
        .filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status))
        .map((order) => order.id),
    );
    setUnreadWebsiteIds(
      (current) => new Set([...current].filter((id) => active.has(id))),
    );
  }, [websiteOrders]);
  useEffect(() => {
    if (view === "sale" && !checkoutOpen)
      requestAnimationFrame(() => searchRef.current?.focus());
  }, [view, checkoutOpen, category]);

  const paymentMethods = useMemo<PosPaymentMethod[]>(
    () =>
      catalog?.paymentMethods?.length
        ? catalog.paymentMethods
        : [
            {
              id: "cash",
              code: "CASH",
              name: "Cash",
              kind: "CASH",
              requiresReference: false,
              sortOrder: 0,
            },
          ],
    [catalog],
  );
  const selectedPayment =
      paymentMethods.find((x) => x.code === paymentCode) ?? paymentMethods[0],
    isCash = selectedPayment.kind === "CASH";
  const subtotal = useMemo(
      () =>
        cart.reduce(
          (sum, line) =>
            sum +
            (line.unitBasePrice +
              line.selections.reduce((v, x) => v + x.price, 0)) *
              line.quantity,
          0,
        ),
      [cart],
    ),
    cashValue = Math.floor(Number(cash) || 0),
    change =
      isCash && cashValue >= subtotal
        ? cashValue - subtotal
        : isCash
          ? null
          : 0;
  const visible = useMemo(() => {
    if (!catalog) return [];
    const term = query.trim().toLowerCase();
    return [
      ...catalog.deals.map((x) => ({
        ...x,
        categoryId: "deals",
        sku: null,
        groups: [],
        kind: "deal" as const,
      })),
      ...catalog.products.map((x) => ({ ...x, kind: "product" as const })),
    ].filter(
      (x) =>
        (category === "all" ||
          (x.kind === "deal"
            ? x.categoryId
            : Array.isArray(catalog.posSections)
              ? x.posSectionId
              : x.categoryId) === category) &&
        (x.name.toLowerCase().includes(term) ||
          x.sku?.toLowerCase().includes(term)),
    );
  }, [catalog, category, query]);
  const activeOrders = orders.filter(
      (o) =>
        !["DELIVERED", "CANCELLED"].includes(
          o.operationalStatus ?? "CONFIRMED",
        ),
    ),
    recentDelivered = orders
      .filter((o) => o.operationalStatus === "DELIVERED")
      .slice(0, catalog?.recentOrderLimit ?? 10),
    activeWebsiteNotifications = websiteOrders
      .filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status))
      .sort(
        (a, b) =>
          Number(unreadWebsiteIds.has(b.id)) -
            Number(unreadWebsiteIds.has(a.id)) ||
          Date.parse(b.created_at) - Date.parse(a.created_at),
      ),
    pendingWebsiteOrders = websiteOrders
      .filter((order) => order.status === "RECEIVED")
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)),
    paymentReady =
      !selectedPayment.requiresReference || Boolean(paymentReference.trim());

  const addLine = (
    p: { id: string; name: string; price: number },
    selections: CartLine["selections"],
    kind: "product" | "deal" = "product",
    variant?: {id:string;name:string;price:number},
  ) =>
    setCart((current) => [
      ...current,
      {
        lineId: localId(),
        itemKind: kind,
        productId: p.id,
        name: p.name,
        unitBasePrice: p.price + (variant?.price??0),
        quantity: 1,
        selections,
        variantId:variant?.id,
        variantName:variant?.name,
      },
    ]);
  const addProduct = (p: CatalogProduct) => {
    if (!p.groups.length && !p.variants.length) {
      addLine(p, []);
      return;
    }
    setChosen(
      Object.fromEntries(
        p.groups.map((g) => [
          g.id,
          defaults(p)
            .filter((x) => x.groupId === g.id)
            .map((x) => x.optionId),
        ]),
      ),
    );
    setChosenVariantId(p.variants.find(variant=>variant.isDefault)?.id??p.variants[0]?.id??null)
    setCustomizing(p);
  };
  const confirmCustom = () => {
    if (!customizing) return;
    const selections = customizing.groups.flatMap((g) =>
      (chosen[g.id] ?? []).map((id) => {
        const o = g.options.find((x) => x.id === id)!;
        return {
          groupId: g.id,
          optionId: o.id,
          groupName: g.name,
          optionName: o.name,
          price: o.price,
        };
      }),
    );
    if (customizing.groups.some((g) => (chosen[g.id] ?? []).length < g.min)) {
      setMessage("Choose all required options.");
      return;
    }
    const variant=customizing.variants.find(item=>item.id===chosenVariantId)
    if(customizing.variants.length&&!variant){setMessage("Choose a product variant.");return}
    addLine(customizing, selections,"product",variant);
    setCustomizing(null);
  };
  const resetSale = () => {
    setCart([]);
    setCustomer("");
    setPhone("");
    setNotes("");
    setTable("");
    setCash("");
    setPaymentReference("");
    setCheckoutOpen(false);
    setReplacing(null);
  };
  const printAfterRender = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => void window.desktopPOS?.print()),
    );
  const complete = async () => {
    if (
      !catalog ||
      !shift ||
      !cart.length ||
      !paymentReady ||
      (isCash && change === null)
    )
      return;
    const soldAt = new Date().toISOString(),
      received = isCash ? cashValue : subtotal;
    if (replacing) {
      if (
        Date.now() - new Date(replacing.soldAt).getTime() >
        catalog.replacementWindowMinutes * 60_000
      ) {
        setMessage("Replacement window has expired.");
        return;
      }
      const updated: LocalOrder = {
        ...replacing,
        catalogVersionId: catalog.catalogVersionId,
        items: cart,
        subtotal,
        total: subtotal,
        cashReceived: received,
        paymentMethodCode: selectedPayment.code,
        paymentMethodName: selectedPayment.name,
        paymentReference: paymentReference.trim(),
        syncState: "PENDING",
        syncError: null,
        replacement: {
          reason: replacementReason.trim(),
          oldItems: replacing.items,
          oldTotal: replacing.total,
          createdAt: soldAt,
        },
      };
      await db.orders.put(updated);
      setReceipt(updated);
      setMessage(`${replacing.localNumber} replacement saved offline.`);
    } else {
      const token = await nextToken(catalog.branchId, today()),
        order: LocalOrder = {
          id: localId(),
          branchId: catalog.branchId,
          catalogVersionId: catalog.catalogVersionId,
          shiftId: shift.id,
          localNumber: `OFF-${today().replaceAll("-", "")}-${String(token).padStart(4, "0")}`,
          tokenNumber: token,
          businessDate: today(),
          soldAt,
          customerName: customer.trim() || "Counter guest",
          customerPhone: phone.trim() || "Counter",
          notes: notes.trim(),
          orderType,
          tableReference: orderType === "DINE_IN" ? table.trim() : "",
          cashReceived: received,
          paymentMethodCode: selectedPayment.code,
          paymentMethodName: selectedPayment.name,
          paymentReference: paymentReference.trim(),
          operationalStatus: "CONFIRMED",
          subtotal,
          total: subtotal,
          items: cart,
          syncState: "PENDING",
          syncError: null,
          serverOrderId: null,
          serverOrderNumber: null,
          syncedAt: null,
          replacement: null,
        };
      await db.orders.add(order);
      setReceipt(order);
    }
    resetSale();
    await refreshLocal(catalog.branchId);
    printAfterRender();
    if (navigator.onLine) void sync(true);
  };
  const editReplacement = (o: LocalOrder) => {
    setReplacing(o);
    setCart(o.items);
    setCustomer(o.customerName);
    setPhone(o.customerPhone);
    setNotes(o.notes);
    setOrderType(o.orderType);
    setTable(o.tableReference);
    setPaymentCode(o.paymentMethodCode ?? "CASH");
    setPaymentReference(o.paymentReference ?? "");
    setCash(String(o.total));
    setView("sale");
  };
  const updateStage = async (o: LocalOrder, target: Stage) => {
    const current = o.operationalStatus ?? "CONFIRMED";
    if (current === "CANCELLED") return;
    if (stages.indexOf(target) !== stages.indexOf(current) + 1) return;
    await db.orders.update(o.id, {
      operationalStatus: target,
      syncState: "PENDING",
      syncError: null,
    });
    await refreshLocal(catalog?.branchId);
    if (navigator.onLine) void sync(true);
  };
  const cancelLocalOrder = async (order: LocalOrder) => {
    const current = order.operationalStatus ?? "CONFIRMED";
    if (["DELIVERED", "CANCELLED"].includes(current)) return;
    if (
      !window.confirm(
        `Cancel ${order.serverOrderNumber ?? order.localNumber}? Its payment will be recorded as refunded.`,
      )
    )
      return;
    await db.orders.update(order.id, {
      operationalStatus: "CANCELLED",
      syncState: "PENDING",
      syncError: null,
    });
    await refreshLocal(catalog?.branchId);
    setMessage(
      `${order.serverOrderNumber ?? order.localNumber} cancelled. The cancellation is saved and will sync automatically.`,
    );
    if (navigator.onLine) void sync(true);
  };
  const updateWebsiteStage = async (
    order: WebsiteOrder,
    target: WebsiteOrderStatus,
  ) => {
    if (!catalog || !online || websiteActionId) return;
    const previous = websiteOrders;
    setWebsiteActionId(order.id);
    setWebsiteOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? { ...item, status: target, updated_at: new Date().toISOString() }
          : item,
      ),
    );
    try {
      const result = await updateWebsiteOrderStatus(
        catalog.branchId,
        order.id,
        target,
      );
      setMessage(
        target === "CONFIRMED" && result.emailStatus === "SENT"
          ? `${order.order_number} confirmed · customer email sent.`
          : `${order.order_number} is now ${target.replaceAll("_", " ").toLowerCase()}.`,
      );
      await refreshWebsite(catalog.branchId);
    } catch (error) {
      setWebsiteOrders(previous);
      setMessage(
        error instanceof Error
          ? error.message
          : "Website order could not be updated.",
      );
    } finally {
      setWebsiteActionId(null);
    }
  };
  const requestOtp = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthBusy(true);
    try {
      const address = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        throw new Error("Enter the invited staff email address.");
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setOtpChallenge(true);
      setOtp("");
      setAuthMessage("A secure login code was sent to the invited email.");
    } catch (e) {
      setAuthError(
        e instanceof TypeError
          ? "Could not reach the secure login service. Check the internet connection and try again."
          : e instanceof Error
            ? e.message
            : "Login code could not be sent.",
      );
    } finally {
      setAuthBusy(false);
    }
  };
  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthBusy(true);
    try {
      const code = otp.replace(/\D/g, "");
      if (code.length < 6 || code.length > 8)
        throw new Error("Enter the complete code from your email.");
      const verified = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: "email",
      });
      if (verified.error) throw verified.error;
      const assignedBranches = await availableBranches();
      setBranches(assignedBranches);
      setCatalog(null);
      setShift(null);
      setLocked(false);
      await setPosLocked(false);
    } catch (e) {
      setAuthError(
        e instanceof Error ? e.message : "Login code could not be verified.",
      );
    } finally {
      setAuthBusy(false);
    }
  };
  const googleSignIn = async () => {
    setAuthError("");
    setAuthBusy(true);
    try {
      if (!window.desktopPOS)
        throw new Error(
          "Google sign-in is available in the installed desktop app.",
        );
      const startUrl = new URL(
        "/desktop-pos-auth",
        import.meta.env.VITE_CUSTOMER_APP_URL,
      );
      startUrl.searchParams.set("source", "qazipro-pos");
      await window.desktopPOS.openOAuth(startUrl.toString());
    } catch (e) {
      setAuthError(
        e instanceof Error ? e.message : "Google sign-in could not open.",
      );
    } finally {
      setAuthBusy(false);
    }
  };
  const logout = async () => {
    await setPosLocked(true);
    setLocked(true);
    setSession(false);
    setBranches([]);
    setCatalog(null);
    setShift(null);
    resetSale();
    if (navigator.onLine) await supabase.auth.signOut();
  };

  if (booting)
    return (
      <main className="login-shell">
        <div className="boot-loader">
          <RefreshCw className="spin" />
          <b>Opening your counter…</b>
        </div>
      </main>
    );
  if (loginRequired)
    return (
      <Login
        email={email}
        setEmail={setEmail}
        otp={otp}
        setOtp={setOtp}
        challenge={otpChallenge}
        busy={authBusy}
        error={authError}
        message={authMessage}
        requestOtp={requestOtp}
        verifyOtp={verifyOtp}
        google={googleSignIn}
      />
    );
  if (!catalog && session)
    return (
      <main className="login-shell">
        <section className="login-card">
          <h1>Choose restaurant</h1>
          <p>
            Only restaurants assigned to this invited POS account appear here.
            Download once, then the counter works offline.
          </p>
          {branches.map((b) => (
            <button
              key={b.id}
              onClick={() =>
                void downloadCatalog(b.id)
                  .then((v) => {
                    setCatalog(v);
                    setPaymentCode(v.paymentMethods[0]?.code ?? "CASH");
                    void refreshLocal(v.branchId);
                  })
                  .catch((e) =>
                    setAuthError(
                      e instanceof Error
                        ? e.message
                        : "Unable to connect this POS.",
                    ),
                  )
              }
            >
              {b.restaurant_name ?? b.name} · {b.city}
            </button>
          ))}
          {authError && <b>{authError}</b>}
          {!online && <b>Connect to the internet for first setup.</b>}
          <button className="logout-button" onClick={() => void logout()}>
            <LogOut />
            Sign out
          </button>
        </section>
      </main>
    );
  if (!catalog) return null;
  if (!shift)
    return (
      <main
        className="login-shell"
        style={{ "--brand": catalog.primaryColor } as React.CSSProperties}
      >
        <section className="login-card">
          <Brand catalog={catalog} />
          <h1>Open counter shift</h1>
          <p>This is stored locally and works without internet.</p>
          <label>
            Opening cash (PKR)
            <input
              type="number"
              min="0"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
            />
          </label>
          <button
            onClick={() =>
              void openShift(catalog.branchId, Number(openingCash)).then(
                setShift,
              )
            }
          >
            Open shift
          </button>
          <Connection online={online} />
          <button className="logout-button" onClick={() => void logout()}>
            <LogOut />
            Sign out
          </button>
        </section>
      </main>
    );

  return (
    <div
      className="pos-app premium-pos"
      style={
        {
          "--brand": catalog.primaryColor,
          "--accent": catalog.secondaryColor,
        } as React.CSSProperties
      }
    >
      <DesktopDialogs />
      <aside>
        <Brand catalog={catalog} />
        <nav>
          <button
            className={view === "sale" ? "active" : ""}
            onClick={() => setView("sale")}
          >
            <ShoppingCart />
            New sale
          </button>
          <button
            className={view === "orders" ? "active" : ""}
            onClick={() => setView("orders")}
          >
            <History />
            Orders{" "}
            <em>
              {orders.filter((o) => o.syncState !== "SYNCED").length +
                websiteOrders.filter(
                  (o) => !["DELIVERED", "CANCELLED"].includes(o.status),
                ).length}
            </em>
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings />
            Settings
          </button>
        </nav>
        <div className="sidebar-status">
          <Connection online={online} />
          <button onClick={() => void sync()} disabled={!online || syncing}>
            <RefreshCw className={syncing ? "spin" : ""} />
            Sync now
          </button>
          <small>
            Catalog {new Date(catalog.updatedAt).toLocaleString("en-PK")}
          </small>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <small>COUNTER · {catalog.city}</small>
            <strong>
              {view === "sale"
                ? replacing
                  ? `Replace ${replacing.localNumber}`
                  : "Point of sale"
                : view === "orders"
                  ? "Order control"
                  : "Desktop POS settings"}
            </strong>
          </div>
          <div className="workspace-header-actions">
            <Connection online={online} />
            <div className="desktop-notification-root">
              <button
                className="desktop-notification-button"
                type="button"
                aria-label={`${unreadWebsiteIds.size} unread website orders`}
                onClick={() => setNotificationOpen((value) => !value)}
              >
                <Bell />
                {unreadWebsiteIds.size > 0 && (
                  <b>
                    {unreadWebsiteIds.size > 99 ? "99+" : unreadWebsiteIds.size}
                  </b>
                )}
              </button>
              {notificationOpen && (
                <section className="desktop-notification-popover">
                  <header>
                    <span>
                      <strong>Website orders</strong>
                      <small>
                        {unreadWebsiteIds.size
                          ? `${unreadWebsiteIds.size} new`
                          : "No unread orders"}
                      </small>
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotificationOpen(false)}
                      aria-label="Close"
                    >
                      <X />
                    </button>
                  </header>
                  {unreadWebsiteIds.size > 0 && (
                    <button
                      className="desktop-mark-read"
                      type="button"
                      onClick={() => setUnreadWebsiteIds(new Set())}
                    >
                      <CheckCheck />
                      Mark all read
                    </button>
                  )}
                  <div>
                    {activeWebsiteNotifications.slice(0, 10).map((order) => (
                      <button
                        type="button"
                        className={
                          unreadWebsiteIds.has(order.id) ? "is-unread" : ""
                        }
                        key={order.id}
                        onClick={() => openWebsiteOrder(order.id)}
                      >
                        <span>
                          <strong>{order.order_number}</strong>
                          <small>
                            {order.service_mode} · Token{" "}
                            {String(order.token_number).padStart(3, "0")}
                          </small>
                        </span>
                        <b>{money(order.total)}</b>
                      </button>
                    ))}
                    {!activeWebsiteNotifications.length && (
                      <p>No active website orders.</p>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </header>
        {message && (
          <div className="notice" role="status">
            {message}
            <button onClick={() => setMessage("")}>×</button>
          </div>
        )}
        {view === "sale" && (
          <>
            <IncomingWebsiteOrders
              orders={pendingWebsiteOrders}
              online={online}
              actionId={websiteActionId}
              onConfirm={(order) => updateWebsiteStage(order, "CONFIRMED")}
              onCancel={(order) => updateWebsiteStage(order, "CANCELLED")}
            />
            <OrderFlow
              orders={activeOrders}
              replacementMinutes={catalog.replacementWindowMinutes}
              onStage={updateStage}
              onReplace={editReplacement}
              onCancel={cancelLocalOrder}
            />
            <div className="sale-layout">
              <main className="catalog">
                <label className="search">
                  <Search />
                  <input
                    ref={searchRef}
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search product or SKU"
                  />
                </label>
                <div className="categories">
                  <button
                    className={category === "all" ? "active" : ""}
                    onClick={() => setCategory("all")}
                  >
                    All
                  </button>
                  <button
                    className={category === "deals" ? "active" : ""}
                    onClick={() => setCategory("deals")}
                  >
                    Deals
                  </button>
                  {(Array.isArray(catalog.posSections)
                    ? catalog.posSections
                    : catalog.categories
                  )
                    .filter((x) => x.name.trim().toLowerCase() !== "deals")
                    .map((x) => (
                    <button
                      key={x.id}
                      className={category === x.id ? "active" : ""}
                      style={
                        "color" in x
                          ? category === x.id
                            ? {
                                background: String(x.color),
                                borderColor: String(x.color),
                                color: "#fff",
                              }
                            : { borderColor: String(x.color) }
                          : undefined
                      }
                      onClick={() => setCategory(x.id)}
                    >
                      {x.name}
                    </button>
                  ))}
                </div>
                <div className="product-grid">
                  {visible.map((x) => (
                    <button
                      className="product"
                      key={`${x.kind}-${x.id}`}
                      onClick={() =>
                        x.kind === "deal"
                          ? addLine(x, [], "deal")
                          : addProduct(x)
                      }
                    >
                      {x.imageDataUrl || x.imageUrl ? (
                        <img
                          src={x.imageDataUrl ?? x.imageUrl ?? ""}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span>{x.name.slice(0, 1)}</span>
                      )}
                      <strong>{x.name}</strong>
                      <b>{money(x.price)}</b>
                      <small>
                        {x.kind === "deal" ? "Deal" : (x.sku ?? "Add to order")}
                      </small>
                    </button>
                  ))}
                </div>
              </main>
              <Cart
                cart={cart}
                subtotal={subtotal}
                heldCount={held.length}
                replacing={replacing}
                setCart={setCart}
                onCheckout={() => setCheckoutOpen(true)}
                onHold={async () => {
                  const v: HeldOrder = {
                    id: localId(),
                    label: `Held ${held.length + 1}`,
                    createdAt: new Date().toISOString(),
                    customerName: customer,
                    customerPhone: phone,
                    notes,
                    orderType,
                    tableReference: table,
                    items: cart,
                  };
                  await db.held.add(v);
                  setCart([]);
                  await refreshLocal(catalog.branchId);
                }}
              />
            </div>
          </>
        )}
        {view === "orders" && (
          <Orders
            orders={orders}
            websiteOrders={websiteOrders}
            websiteBusy={websiteBusy}
            online={online}
            held={held}
            recent={recentDelivered}
            replacementMinutes={catalog.replacementWindowMinutes}
            onStage={updateStage}
            onReplace={editReplacement}
            onCancel={cancelLocalOrder}
            onWebsiteStage={updateWebsiteStage}
            refreshWebsite={() => refreshWebsite(catalog.branchId, false)}
            focusedWebsiteOrderId={focusedWebsiteOrderId}
            onResume={async (v) => {
              setCart(v.items);
              setCustomer(v.customerName);
              setPhone(v.customerPhone);
              setNotes(v.notes);
              setOrderType(v.orderType);
              setTable(v.tableReference);
              await db.held.delete(v.id);
              setView("sale");
              await refreshLocal(catalog.branchId);
            }}
          />
        )}
        {view === "settings" && (
          <SettingsView
            catalog={catalog}
            orders={orders}
            online={online}
            session={session}
            syncing={syncing}
            countedCash={countedCash}
            setCountedCash={setCountedCash}
            sync={sync}
            switchRestaurant={() => {
              setCatalog(null);
              setView("sale");
            }}
            logout={logout}
            close={() =>
              void closeShift(shift.id, Number(countedCash)).then(() =>
                setShift(null),
              )
            }
            deviceAlertsEnabled={deviceAlertsEnabled}
            setDeviceAlertsEnabled={async (value) => {
              setDeviceAlertsEnabled(value);
              await db.settings.put({
                key: "orderAlertsEnabled",
                value: String(value),
              });
              if (value && catalog.desktopOrderSound !== false)
                void playDesktopOrderSound(
                  deviceSoundDataUrl ??
                    catalog.orderNotificationSoundDataUrl ??
                    catalog.orderNotificationSoundUrl,
                );
            }}
            deviceSoundDataUrl={deviceSoundDataUrl}
            setDeviceSoundDataUrl={async (value) => {
              setDeviceSoundDataUrl(value);
              if (value)
                await db.settings.put({ key: "orderAlertSound", value });
              else await db.settings.delete("orderAlertSound");
            }}
          />
        )}
      </section>
      {checkoutOpen && (
        <Checkout
          subtotal={subtotal}
          cart={cart}
          customer={customer}
          phone={phone}
          notes={notes}
          orderType={orderType}
          table={table}
          setCustomer={setCustomer}
          setPhone={setPhone}
          setNotes={setNotes}
          setOrderType={setOrderType}
          setTable={setTable}
          methods={paymentMethods}
          selected={selectedPayment}
          setPayment={(code) => {
            setPaymentCode(code);
            setPaymentReference("");
            setCash("");
          }}
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          cash={cash}
          setCash={setCash}
          change={change}
          replacing={replacing}
          replacementReason={replacementReason}
          setReplacementReason={setReplacementReason}
          ready={paymentReady && (!isCash || change !== null)}
          close={() => setCheckoutOpen(false)}
          complete={complete}
        />
      )}
      {customizing && (
        <Customize
          product={customizing}
          chosen={chosen}
          setChosen={setChosen}
          chosenVariantId={chosenVariantId}
          setChosenVariantId={setChosenVariantId}
          close={() => setCustomizing(null)}
          confirm={confirmCustom}
        />
      )}
      {receipt && (
        <Receipt
          catalog={catalog}
          order={receipt}
          close={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

function Login({
  email,
  setEmail,
  otp,
  setOtp,
  challenge,
  busy,
  error,
  message,
  requestOtp,
  verifyOtp,
  google,
}: {
  email: string;
  setEmail: (v: string) => void;
  otp: string;
  setOtp: (v: string) => void;
  challenge: boolean;
  busy: boolean;
  error: string;
  message: string;
  requestOtp: (e?: React.FormEvent) => Promise<void>;
  verifyOtp: (e: React.FormEvent) => Promise<void>;
  google: () => Promise<void>;
}) {
  return (
    <main
      className="login-shell qazipro-login"
      style={
        {
          "--brand": "#050505",
          "--accent": "#050505",
          "--login-background": "#f4f4f4",
          "--login-header": "#fff",
          "--login-text": "#050505",
        } as React.CSSProperties
      }
    >
      <form
        className="login-card"
        onSubmit={challenge ? verifyOtp : requestOtp}
      >
        <img
          className="login-brand-logo qazipro-logo"
          src="/qazipro-logo.png"
          alt="QaziPRO logo"
        />
        <h1>QaziPRO</h1>
        <p className="qazipro-subtitle">POS ONLINE ORDERING SYSTEM</p>
        <p>
          First setup needs internet. Use the email invited from Staff & Roles;
          after setup, counter sales continue offline.
        </p>
        <button
          className="google-login"
          type="button"
          disabled={busy}
          onClick={() => void google()}
        >
          <img className="google-mark" src="https://developers.google.com/static/identity/images/g-logo.png" alt="" aria-hidden="true" />Continue with Google
        </button>
        <div className="login-divider">
          <span />
          or secure email OTP
          <span />
        </div>
        <label>
          Email
          <input
            type="email"
            required
            disabled={Boolean(challenge) || busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {challenge && (
          <label>
            Login code
            <input
              className="otp-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6,8}"
              maxLength={8}
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
          </label>
        )}
        <button disabled={busy}>
          {busy
            ? "Please wait…"
            : challenge
              ? "Verify code & connect"
              : "Email me a login code"}
        </button>
        <small className="password-note">
          No Gmail password is used. We send a one-time code to this email.
        </small>
        {challenge && (
          <div className="otp-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void requestOtp()}
            >
              Resend code
            </button>
          </div>
        )}
        {message && <strong className="auth-success">{message}</strong>}
        {error && <b>{error}</b>}
      </form>
    </main>
  );
}
function Brand({ catalog }: { catalog: CatalogSnapshot }) {
  return (
    <div className="brand">
      {catalog.faviconDataUrl || catalog.faviconUrl ? (
        <img
          src={catalog.faviconDataUrl ?? catalog.faviconUrl ?? ""}
          alt={`${catalog.businessName} icon`}
        />
      ) : (
        <i>POS</i>
      )}
      <span>
        <strong>{catalog.businessName}</strong>
        <small>ONLINE + OFFLINE COUNTER</small>
      </span>
    </div>
  );
}
function Connection({ online }: { online: boolean }) {
  return (
    <span className={`connection ${online ? "online" : "offline"}`}>
      {online ? <Wifi /> : <WifiOff />}
      {online ? "Online" : "Offline ready"}
    </span>
  );
}

function IncomingWebsiteOrders({
  orders,
  online,
  actionId,
  onConfirm,
  onCancel,
}: {
  orders: WebsiteOrder[];
  online: boolean;
  actionId: string | null;
  onConfirm: (order: WebsiteOrder) => Promise<void>;
  onCancel: (order: WebsiteOrder) => Promise<void>;
}) {
  if (!orders.length) return null;
  return (
    <section
      className="incoming-website-orders"
      aria-label="New website orders"
    >
      <header>
        <span>
          <Bell />
          <b>{orders.length}</b>
        </span>
        <div>
          <small>ACTION REQUIRED</small>
          <strong>New website order{orders.length === 1 ? "" : "s"}</strong>
        </div>
        {!online && <em>Connect to confirm or cancel</em>}
      </header>
      <div>
        {orders.map((order) => {
          const working = actionId === order.id;
          const itemCount = order.order_items.reduce(
            (total, item) => total + item.quantity,
            0,
          );
          return (
            <article key={order.id} data-incoming-website-order={order.id}>
              <span>
                <small>ORDER</small>
                <b>{order.order_number}</b>
              </span>
              <span>
                <small>TOKEN</small>
                <b>#{String(order.token_number).padStart(3, "0")}</b>
              </span>
              <span className="incoming-customer">
                <small>CUSTOMER</small>
                <b>{order.customer_name || "Website customer"}</b>
                <em>
                  {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
                  {order.service_mode}
                </em>
              </span>
              <strong>{money(order.total)}</strong>
              <div>
                <button
                  type="button"
                  className="website-cancel"
                  disabled={!online || Boolean(actionId)}
                  onClick={() => void onCancel(order)}
                >
                  <X />
                  {working ? "Working…" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="website-confirm"
                  disabled={!online || Boolean(actionId)}
                  onClick={() => void onConfirm(order)}
                >
                  <CheckCircle2 />
                  {working ? "Working…" : "Confirm order"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OrderFlow({
  orders,
  replacementMinutes,
  onStage,
  onReplace,
  onCancel,
}: {
  orders: LocalOrder[];
  replacementMinutes: number;
  onStage: (o: LocalOrder, s: Stage) => Promise<void>;
  onReplace: (o: LocalOrder) => void;
  onCancel: (o: LocalOrder) => Promise<void>;
}) {
  return (
    <section className="quick-flow">
      <header>
        <div>
          <small>ONE-TAP KITCHEN FLOW</small>
          <strong>
            {orders.length} active POS order{orders.length === 1 ? "" : "s"}
          </strong>
        </div>
      </header>
      {orders.length > 0 && (
        <div className="quick-flow-list">
          {orders.slice(0, 5).map((order) => {
            const current: Stage =
              order.operationalStatus === "CANCELLED"
                ? "CONFIRMED"
                : (order.operationalStatus ?? "CONFIRMED");
            const next: Stage =
              current === "CONFIRMED"
                ? "PREPARING"
                : current === "PREPARING"
                  ? "READY"
                  : "DELIVERED";
            return (
              <article key={order.id} data-pos-order-id={order.id}>
                <span>
                  <b>#{String(order.tokenNumber).padStart(3, "0")}</b>
                  <small>
                    {order.customerName} · {money(order.total)}
                  </small>
                </span>
                <div className="quick-order-actions">
                  <span
                    className={`current-stage stage-${current.toLowerCase()}`}
                  >
                    {current}
                  </span>
                  <button
                    data-stage={next}
                    className={`stage-action stage-${next.toLowerCase()}`}
                    onClick={() => void onStage(order, next)}
                  >
                    {next === "PREPARING" ? (
                      <ChefHat />
                    ) : next === "DELIVERED" ? (
                      <CheckCircle2 />
                    ) : (
                      <Check />
                    )}
                    {next === "PREPARING"
                      ? "Start preparing"
                      : next === "READY"
                        ? "Mark ready"
                        : "Mark delivered"}
                  </button>
                  {!order.replacement &&
                    current === "CONFIRMED" &&
                    Date.now() - new Date(order.soldAt).getTime() <=
                      replacementMinutes * 60_000 && (
                      <button
                        className="replacement-action"
                        onClick={() => onReplace(order)}
                      >
                        <RotateCcw />
                        Replacement
                      </button>
                    )}
                  <button
                    className="cancel-action"
                    onClick={() => void onCancel(order)}
                  >
                    <X />
                    Cancel
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Cart({
  cart,
  subtotal,
  heldCount,
  replacing,
  setCart,
  onCheckout,
  onHold,
}: {
  cart: CartLine[];
  subtotal: number;
  heldCount: number;
  replacing: LocalOrder | null;
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  onCheckout: () => void;
  onHold: () => Promise<void>;
}) {
  const adjustment = replacing
    ? replacementMoney(replacing.total, subtotal)
    : null;
  return (
    <aside className="cart">
      <header>
        <ShoppingCart />
        <strong>Current order</strong>
        <button onClick={() => setCart([])}>Clear</button>
      </header>
      <div className="cart-lines">
        {cart.map((line) => (
          <article key={line.lineId}>
            <div>
              <strong>{line.name}</strong>
              {line.variantName && <small>Variant: {line.variantName}</small>}
              {line.selections.length > 0 && (
                <small>
                  {line.selections.map((x) => x.optionName).join(" · ")}
                </small>
              )}
              <b>
                {money(
                  (line.unitBasePrice +
                    line.selections.reduce((sum, x) => sum + x.price, 0)) *
                    line.quantity,
                )}
              </b>
            </div>
            <span>
              <button
                onClick={() =>
                  setCart((current) =>
                    current.map((x) =>
                      x.lineId === line.lineId
                        ? { ...x, quantity: Math.max(1, x.quantity - 1) }
                        : x,
                    ),
                  )
                }
              >
                <Minus />
              </button>
              {line.quantity}
              <button
                onClick={() =>
                  setCart((current) =>
                    current.map((x) =>
                      x.lineId === line.lineId
                        ? { ...x, quantity: x.quantity + 1 }
                        : x,
                    ),
                  )
                }
              >
                <Plus />
              </button>
              <button
                onClick={() =>
                  setCart((current) =>
                    current.filter((x) => x.lineId !== line.lineId),
                  )
                }
              >
                <Trash2 />
              </button>
            </span>
          </article>
        ))}
        {!cart.length && (
          <div className="empty">
            <ShoppingCart />
            <p>Tap a product to start.</p>
          </div>
        )}
      </div>
      <div className="cart-summary">
        {replacing && adjustment && (
          <div className="replacement-money replacement-money-compact">
            <span>
              <small>Original order</small>
              <b>{money(replacing.total)}</b>
            </span>
            <span>
              <small>Replacement total</small>
              <b>{money(subtotal)}</b>
            </span>
            <span
              className={
                adjustment.difference === 0
                  ? "even"
                  : adjustment.difference > 0
                    ? "charge"
                    : "refund"
              }
            >
              <small>{adjustment.label}</small>
              <strong>{money(adjustment.amount)}</strong>
            </span>
          </div>
        )}
        <span>
          <small>{cart.reduce((sum, x) => sum + x.quantity, 0)} items</small>
          <strong>{money(subtotal)}</strong>
        </span>
        <div>
          <button onClick={() => void onHold()} disabled={!cart.length}>
            <Pause />
            Hold {heldCount ? `(${heldCount})` : ""}
          </button>
          <button
            className="primary"
            onClick={onCheckout}
            disabled={!cart.length}
          >
            <Check />
            {replacing ? "Review replacement" : "Checkout"}
          </button>
        </div>
      </div>
    </aside>
  );
}

type CheckoutProps = {
  subtotal: number;
  cart: CartLine[];
  customer: string;
  phone: string;
  notes: string;
  orderType: "TAKEAWAY" | "DINE_IN";
  table: string;
  setCustomer: (v: string) => void;
  setPhone: (v: string) => void;
  setNotes: (v: string) => void;
  setOrderType: (v: "TAKEAWAY" | "DINE_IN") => void;
  setTable: (v: string) => void;
  methods: PosPaymentMethod[];
  selected: PosPaymentMethod;
  setPayment: (v: string) => void;
  paymentReference: string;
  setPaymentReference: (v: string) => void;
  cash: string;
  setCash: (v: string) => void;
  change: number | null;
  replacing: LocalOrder | null;
  replacementReason: string;
  setReplacementReason: (v: string) => void;
  ready: boolean;
  close: () => void;
  complete: () => Promise<void>;
};
function Checkout(p: CheckoutProps) {
  const isCash = p.selected.kind === "CASH";
  const adjustment = p.replacing
    ? replacementMoney(p.replacing.total, p.subtotal)
    : null;
  return (
    <div className="modal checkout-modal">
      <section>
        <header>
          <div>
            <small>FINAL CHECK</small>
            <h2>{p.replacing ? "Confirm replacement" : "Checkout"}</h2>
          </div>
          <button onClick={p.close} aria-label="Close checkout">
            <X />
          </button>
        </header>
        <div className="checkout-grid">
          <div>
            <h3>Order details</h3>
            <div className="checkout-lines">
              {p.cart.map((line) => (
                <span key={line.lineId}>
                  <b>
                    {line.quantity}× {line.name}
                  </b>
                  <strong>
                    {money(
                      (line.unitBasePrice +
                        line.selections.reduce((sum, x) => sum + x.price, 0)) *
                        line.quantity,
                    )}
                  </strong>
                </span>
              ))}
            </div>
            <div className="segmented">
              <button
                className={p.orderType === "TAKEAWAY" ? "active" : ""}
                onClick={() => p.setOrderType("TAKEAWAY")}
              >
                Takeaway
              </button>
              <button
                className={p.orderType === "DINE_IN" ? "active" : ""}
                onClick={() => p.setOrderType("DINE_IN")}
              >
                Dine in
              </button>
            </div>
            {p.orderType === "DINE_IN" && (
              <label>
                Table
                <input
                  value={p.table}
                  onChange={(e) => p.setTable(e.target.value)}
                />
              </label>
            )}
            <label>
              Customer name
              <input
                value={p.customer}
                onChange={(e) => p.setCustomer(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Phone
              <input
                value={p.phone}
                onChange={(e) => p.setPhone(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Order notes
              <textarea
                value={p.notes}
                onChange={(e) => p.setNotes(e.target.value)}
              />
            </label>
            {p.replacing && (
              <label>
                Replacement reason
                <input
                  minLength={3}
                  value={p.replacementReason}
                  onChange={(e) => p.setReplacementReason(e.target.value)}
                />
              </label>
            )}
          </div>
          <div>
            <h3>How is the customer paying?</h3>
            {p.replacing && adjustment && (
              <div className="replacement-money">
                <span>
                  <small>Original paid</small>
                  <b>{money(p.replacing.total)}</b>
                </span>
                <span>
                  <small>New replacement total</small>
                  <b>{money(p.subtotal)}</b>
                </span>
                <span
                  className={
                    adjustment.difference === 0
                      ? "even"
                      : adjustment.difference > 0
                        ? "charge"
                        : "refund"
                  }
                >
                  <small>{adjustment.label}</small>
                  <strong>{money(adjustment.amount)}</strong>
                </span>
              </div>
            )}
            <div className="tender-grid">
              {p.methods.map((method) => (
                <button
                  key={method.id}
                  className={p.selected.code === method.code ? "active" : ""}
                  onClick={() => p.setPayment(method.code)}
                >
                  {method.kind === "CASH" ? (
                    <Banknote />
                  ) : method.kind === "CARD" ? (
                    <CreditCard />
                  ) : (
                    <CircleDollarSign />
                  )}
                  <span>
                    <b>{method.name}</b>
                    <small>{method.kind}</small>
                  </span>
                </button>
              ))}
            </div>
            {(!isCash || p.selected.requiresReference) && (
              <label>
                Sender / transaction reference{" "}
                {p.selected.requiresReference ? "(required)" : "(optional)"}
                <input
                  autoFocus={p.selected.requiresReference}
                  required={p.selected.requiresReference}
                  value={p.paymentReference}
                  onChange={(e) => p.setPaymentReference(e.target.value)}
                  placeholder={
                    p.selected.kind === "WALLET"
                      ? "Sender phone or transaction ID (optional)"
                      : "Terminal reference (optional)"
                  }
                />
              </label>
            )}
            {!isCash && (
              <div className="payment-received">
                <span>Amount received</span>
                <strong>{money(p.subtotal)}</strong>
              </div>
            )}
            {isCash && (
              <>
                <label>
                  {p.replacing ? "Total cash after replacement" : "Cash received"}
                  <input
                    autoFocus
                    type="number"
                    min={p.subtotal}
                    value={p.cash}
                    onChange={(e) => p.setCash(e.target.value)}
                  />
                </label>
                <button
                  className="exact-cash"
                  onClick={() => p.setCash(String(p.subtotal))}
                >
                  Exact cash
                </button>
                <p className="change">
                  {p.replacing && (adjustment?.difference ?? 0) < 0
                    ? "Refund due"
                    : "Change"}{" "}
                  <b>{p.change === null ? "—" : money(p.change)}</b>
                </p>
              </>
            )}
            <div className="checkout-total">
              <span>Total</span>
              <strong>{money(p.subtotal)}</strong>
            </div>
            <button
              className="primary place-order"
              disabled={
                !p.ready ||
                (Boolean(p.replacing) && p.replacementReason.trim().length < 3)
              }
              onClick={() => void p.complete()}
            >
              <Printer />
              {p.replacing
                ? "Save replacement & print"
                : "Place order & print receipt"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Customize({
  product,
  chosen,
  setChosen,
  chosenVariantId,
  setChosenVariantId,
  close,
  confirm,
}: {
  product: CatalogProduct;
  chosen: Record<string, string[]>;
  setChosen: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  chosenVariantId: string | null;
  setChosenVariantId: (value: string) => void;
  close: () => void;
  confirm: () => void;
}) {
  return (
    <div className="modal">
      <section>
        <header>
          <div>
            <small>CUSTOMIZE</small>
            <h2>{product.name}</h2>
          </div>
          <button onClick={close}>
            <X />
          </button>
        </header>
        {product.variants.length > 0 && <fieldset><legend>Variant <b>Required</b></legend>{product.variants.map((variant) => <label key={variant.id}><input type="radio" name="product-variant" checked={chosenVariantId === variant.id} onChange={() => setChosenVariantId(variant.id)} /><span>{variant.name}</span><b>{variant.price ? `+ ${money(variant.price)}` : "Base price"}</b></label>)}</fieldset>}
        {product.groups.map((group) => (
          <fieldset key={group.id}>
            <legend>
              {group.name} {group.required && <b>Required</b>}
            </legend>
            {group.options.map((option) => (
              <label key={option.id}>
                <input
                  type={group.selection === "SINGLE" ? "radio" : "checkbox"}
                  name={group.id}
                  checked={(chosen[group.id] ?? []).includes(option.id)}
                  onChange={(e) =>
                    setChosen((current) => {
                      const values = current[group.id] ?? [];
                      return {
                        ...current,
                        [group.id]:
                          group.selection === "SINGLE"
                            ? [option.id]
                            : e.target.checked
                              ? [...values, option.id]
                              : values.filter((id) => id !== option.id),
                      };
                    })
                  }
                />
                {(option.imageDataUrl || option.imageUrl) && (
                  <img
                    className="addon-thumbnail"
                    src={option.imageDataUrl ?? option.imageUrl ?? ""}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span>{option.name}</span>
                <b>{option.price ? `+ ${money(option.price)}` : "Included"}</b>
              </label>
            ))}
          </fieldset>
        ))}
        <button className="primary" onClick={confirm}>
          Add to order
        </button>
      </section>
    </div>
  );
}

function ReceiptDocument({
  catalog,
  order,
  kitchen = false,
}: {
  catalog: CatalogSnapshot;
  order: LocalOrder;
  kitchen?: boolean;
}) {
  const settings = catalog.receiptSettings;
  const headerAlignment = (
    settings?.headerAlignment ?? "CENTER"
  ).toLowerCase() as "left" | "center" | "right";
  const logoAlignment = settings?.logoAlignment ?? "CENTER";
  const orderNumber = order.serverOrderNumber ?? order.localNumber;
  return (
    <article
      className={`receipt receipt-${settings?.width ?? 80} ${kitchen ? "receipt-kitchen" : ""}`}
    >
      <header
        className="receipt-brand"
        style={{
          textAlign: headerAlignment,
          alignItems:
            headerAlignment === "left"
              ? "flex-start"
              : headerAlignment === "right"
                ? "flex-end"
                : "center",
        }}
      >
        {!kitchen &&
        settings?.showLogo !== false &&
        (catalog.logoDataUrl || catalog.logoUrl) ? (
          <img
            src={catalog.logoDataUrl ?? catalog.logoUrl ?? ""}
            alt={`${catalog.businessName} logo`}
            style={{
              width: `${Math.min(200, Math.max(24, settings?.logoSize ?? 72))}px`,
              alignSelf:
                logoAlignment === "LEFT"
                  ? "flex-start"
                  : logoAlignment === "RIGHT"
                    ? "flex-end"
                    : "center",
            }}
          />
        ) : null}
        <strong>{kitchen ? "KITCHEN TICKET" : catalog.businessName}</strong>
        {kitchen || settings?.showBranchName !== false ? (
          <span>{catalog.branchName}</span>
        ) : null}
        {!kitchen &&
        settings?.showAddress !== false &&
        catalog.businessAddress ? (
          <span>{catalog.businessAddress}</span>
        ) : null}
        {!kitchen && settings?.showPhone !== false && settings?.phone ? (
          <span>{settings.phone}</span>
        ) : null}
      </header>
      <div className="receipt-token">
        <small>TOKEN</small>
        <h1>{String(order.tokenNumber).padStart(3, "0")}</h1>
        {kitchen || settings?.showOrderType !== false ? (
          <b>{order.orderType.replaceAll("_", " ")}</b>
        ) : null}
        {order.orderType === "DINE_IN" && order.tableReference ? (
          <b>Table {order.tableReference}</b>
        ) : null}
      </div>
      <div className="receipt-meta">
        {kitchen || settings?.showOrderNumber !== false ? (
          <span>{orderNumber}</span>
        ) : null}
        {kitchen || settings?.showOrderDate !== false ? (
          <span>{new Date(order.soldAt).toLocaleString("en-PK")}</span>
        ) : null}
      </div>
      {(kitchen || settings?.showCustomerName !== false) &&
      order.customerName ? (
        <p>
          <strong>Customer:</strong> {order.customerName}
        </p>
      ) : null}
      {(kitchen || settings?.showCustomerPhone !== false) &&
      order.customerPhone &&
      order.customerPhone !== "Counter" ? (
        <p>{order.customerPhone}</p>
      ) : null}
      {order.notes ? (
        <p>
          <strong>NOTE:</strong> {order.notes}
        </p>
      ) : null}
      <div className="receipt-lines">
        {order.items.map((item) => (
          <div key={item.lineId}>
            <span>
              <strong>
                {item.quantity}× {item.name}
              </strong>
              {item.variantName && <small>Variant: {item.variantName}</small>}
              {item.selections.map((selection) => (
                <small key={`${selection.groupId}-${selection.optionId}`}>
                  {selection.groupName}: {selection.optionName}
                </small>
              ))}
            </span>
            {!kitchen || settings?.kitchenPrices ? (
              <b>
                {money(
                  (item.unitBasePrice +
                    item.selections.reduce((sum, x) => sum + x.price, 0)) *
                    item.quantity,
                )}
              </b>
            ) : null}
          </div>
        ))}
      </div>
      {!kitchen ? (
        <div className="receipt-totals">
          <div>
            <span>Total</span>
            <strong>{money(order.total)}</strong>
          </div>
          {settings?.showPaymentMethod !== false ? (
            <p>
              Paid via {order.paymentMethodName ?? "Cash"}
              {order.paymentReference ? ` · Ref ${order.paymentReference}` : ""}
              {order.paymentMethodCode === "CASH"
                ? ` · Change ${money(order.cashReceived - order.total)}`
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      <footer>
        {kitchen ? (
          "Preparation ticket"
        ) : (
          <>
            <span>
              {settings?.footer ||
                `Thank you for ordering from ${catalog.businessName}.`}
            </span>
            {settings?.note ? <small>{settings.note}</small> : null}
          </>
        )}
      </footer>
    </article>
  );
}

function Receipt({
  catalog,
  order,
  close,
}: {
  catalog: CatalogSnapshot;
  order: LocalOrder;
  close: () => void;
}) {
  const copies = Math.min(
    5,
    Math.max(1, Math.round(catalog.receiptSettings?.copies ?? 1)),
  );
  return (
    <div className="modal receipt-modal">
      <section>
        <header>
          <h2>Receipt ready</h2>
          <button onClick={close}>
            <X />
          </button>
        </header>
        <div className="desktop-receipt-batch">
          {Array.from({ length: copies }, (_, index) => (
            <div className="desktop-receipt-copy" key={index}>
              <small className="receipt-copy-label">
                Customer receipt{copies > 1 ? ` · Copy ${index + 1}` : ""}
              </small>
              <ReceiptDocument catalog={catalog} order={order} />
            </div>
          ))}
          {catalog.receiptSettings?.includeKitchen ? (
            <div className="desktop-receipt-copy desktop-receipt-copy--kitchen">
              <small className="receipt-copy-label">
                Kitchen preparation ticket
              </small>
              <ReceiptDocument catalog={catalog} order={order} kitchen />
            </div>
          ) : null}
        </div>
        <button
          className="primary"
          onClick={() => void window.desktopPOS?.print()}
        >
          <Printer />
          Print again
        </button>
      </section>
    </div>
  );
}

function Orders({
  orders,
  websiteOrders,
  websiteBusy,
  online,
  held,
  recent,
  replacementMinutes,
  onStage,
  onReplace,
  onCancel,
  onWebsiteStage,
  refreshWebsite,
  focusedWebsiteOrderId,
  onResume,
}: {
  orders: LocalOrder[];
  websiteOrders: WebsiteOrder[];
  websiteBusy: boolean;
  online: boolean;
  held: HeldOrder[];
  recent: LocalOrder[];
  replacementMinutes: number;
  onStage: (o: LocalOrder, s: Stage) => Promise<void>;
  onReplace: (o: LocalOrder) => void;
  onCancel: (o: LocalOrder) => Promise<void>;
  onWebsiteStage: (o: WebsiteOrder, s: WebsiteOrderStatus) => Promise<void>;
  refreshWebsite: () => void;
  focusedWebsiteOrderId: string | null;
  onResume: (o: HeldOrder) => Promise<void>;
}) {
  const active = orders.filter(
      (o) =>
        !["DELIVERED", "CANCELLED"].includes(
          o.operationalStatus ?? "CONFIRMED",
        ),
    ),
    render = (order: LocalOrder) => (
      <article key={order.id}>
        <div>
          <strong>{order.serverOrderNumber ?? order.localNumber}</strong>
          <small>
            Token {String(order.tokenNumber).padStart(3, "0")} ·{" "}
            {new Date(order.soldAt).toLocaleString("en-PK")}
          </small>
          <small>
            {order.items.map((x) => `${x.quantity}× ${x.name}`).join(" · ")}
          </small>
          {order.syncError && <b>{order.syncError}</b>}
        </div>
        <span>
          <em className={order.syncState.toLowerCase()}>{order.syncState}</em>
          <strong>{money(order.total)}</strong>
          {!["DELIVERED", "CANCELLED"].includes(
            order.operationalStatus ?? "CONFIRMED",
          ) && (
            <button
              className={`stage-action stage-${nextStage((order.operationalStatus ?? "CONFIRMED") as Stage)?.toLowerCase() ?? "delivered"}`}
              onClick={() => {
                const next = nextStage(
                  (order.operationalStatus ?? "CONFIRMED") as Stage,
                );
                if (next) void onStage(order, next);
              }}
            >
              {nextStage((order.operationalStatus ?? "CONFIRMED") as Stage)}
            </button>
          )}
          {!order.replacement &&
            Date.now() - new Date(order.soldAt).getTime() <=
              replacementMinutes * 60_000 &&
            (order.operationalStatus ?? "CONFIRMED") === "CONFIRMED" && (
              <button
                className="replacement-action"
                onClick={() => onReplace(order)}
              >
                <RotateCcw />
                Replace items
              </button>
            )}
          {!["DELIVERED", "CANCELLED"].includes(
            order.operationalStatus ?? "CONFIRMED",
          ) && (
            <button
              className="cancel-action"
              onClick={() => void onCancel(order)}
            >
              <X />
              Cancel
            </button>
          )}
        </span>
      </article>
    );
  return (
    <main className="orders-view">
      <div className="metrics">
        <article>
          <Cloud />
          <span>
            <small>Pending sync</small>
            <strong>
              {orders.filter((x) => x.syncState !== "SYNCED").length}
            </strong>
          </span>
        </article>
        <article>
          <ChefHat />
          <span>
            <small>Active</small>
            <strong>{active.length}</strong>
          </span>
        </article>
        <article>
          <Check />
          <span>
            <small>Recent delivered</small>
            <strong>{recent.length}</strong>
          </span>
        </article>
      </div>
      <section className="website-order-section">
        <header className="website-order-heading">
          <div>
            <small>LIVE ONLINE ORDERS</small>
            <h2>Website orders</h2>
            <p>
              {online
                ? "New delivery and pickup orders appear here automatically."
                : "Reconnect to receive and control website orders. Counter sales remain available offline."}
            </p>
          </div>
          <button disabled={!online || websiteBusy} onClick={refreshWebsite}>
            <RefreshCw className={websiteBusy ? "spin" : ""} />
            Refresh
          </button>
        </header>
        <div className="website-order-grid">
          {websiteOrders
            .filter(
              (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
            )
            .map((order) => {
              const next =
                order.status === "READY" && order.service_mode === "DELIVERY"
                  ? "OUT_FOR_DELIVERY"
                  : websiteNext[order.status];
              return (
                <article
                  data-website-order-id={order.id}
                  className={`website-order-card ${focusedWebsiteOrderId === order.id ? "is-focused" : ""}`}
                  key={order.id}
                >
                  <header>
                    <span>
                      <small>{order.service_mode} · TOKEN</small>
                      <strong>
                        #{String(order.token_number).padStart(3, "0")}
                      </strong>
                    </span>
                    <b>{money(order.total)}</b>
                  </header>
                  <div className="website-order-customer">
                    <strong>{order.customer_name}</strong>
                    <small>
                      {order.customer_phone} · {order.order_number}
                    </small>
                    {order.delivery_address && <p>{order.delivery_address}</p>}
                  </div>
                  <div className="website-order-items">
                    {order.order_items.map((item) => (
                      <span key={item.id}>
                        <b>
                          {item.quantity}× {item.product_name}
                        </b>
                        {item.order_item_modifiers.length > 0 && (
                          <small>
                            {item.order_item_modifiers
                              .map((option) => option.option_name)
                              .join(" · ")}
                          </small>
                        )}
                      </span>
                    ))}
                    {(order.order_notes || order.delivery_instructions) && (
                      <p>{order.order_notes || order.delivery_instructions}</p>
                    )}
                  </div>
                  <footer>
                    <span
                      className={`website-status status-${order.status.toLowerCase()}`}
                    >
                      {order.status.replaceAll("_", " ")}
                    </span>
                    <span className="website-payment">
                      {order.payment_status} ·{" "}
                      {order.payment_method.replaceAll("_", " ")}
                    </span>
                    {next && (
                      <button
                        className={`website-stage-action stage-${next.toLowerCase()}`}
                        onClick={() => void onWebsiteStage(order, next)}
                      >
                        {next === "CONFIRMED"
                          ? "Confirm"
                          : next === "PREPARING"
                            ? "Start preparing"
                            : next === "READY"
                              ? "Mark ready"
                              : next === "OUT_FOR_DELIVERY"
                                ? "Send for delivery"
                                : "Complete"}
                      </button>
                    )}
                    {!["DELIVERED", "CANCELLED"].includes(order.status) && (
                      <button
                        className="website-cancel"
                        onClick={() => void onWebsiteStage(order, "CANCELLED")}
                      >
                        <X /> Cancel
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          {!websiteOrders.some(
            (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
          ) && (
            <p className="empty">
              {websiteBusy
                ? "Loading website orders…"
                : online
                  ? "No active website orders."
                  : "Website orders need internet."}
            </p>
          )}
        </div>
      </section>
      {held.length > 0 && (
        <section>
          <h2>Held orders</h2>
          <div className="order-list">
            {held.map((x) => (
              <article key={x.id}>
                <div>
                  <strong>{x.label}</strong>
                  <small>
                    {x.items.length} lines ·{" "}
                    {new Date(x.createdAt).toLocaleTimeString("en-PK")}
                  </small>
                </div>
                <button onClick={() => void onResume(x)}>Resume</button>
              </article>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2>Active counter orders</h2>
        <div className="order-list">
          {active.map(render)}
          {!active.length && <p className="empty">No active counter orders.</p>}
        </div>
      </section>
      <section>
        <h2>Last {recent.length} delivered</h2>
        <div className="order-list">
          {recent.map(render)}
          {!recent.length && (
            <p className="empty">No delivered counter orders yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function SettingsView({
  catalog,
  orders,
  online,
  session,
  syncing,
  countedCash,
  setCountedCash,
  sync,
  switchRestaurant,
  logout,
  close,
  deviceAlertsEnabled,
  setDeviceAlertsEnabled,
  deviceSoundDataUrl,
  setDeviceSoundDataUrl,
}: {
  catalog: CatalogSnapshot;
  orders: LocalOrder[];
  online: boolean;
  session: boolean;
  syncing: boolean;
  countedCash: string;
  setCountedCash: (v: string) => void;
  sync: (silent?: boolean) => Promise<void>;
  switchRestaurant: () => void;
  logout: () => Promise<void>;
  close: () => void;
  deviceAlertsEnabled: boolean;
  setDeviceAlertsEnabled: (value: boolean) => Promise<void>;
  deviceSoundDataUrl: string | null;
  setDeviceSoundDataUrl: (value: string | null) => Promise<void>;
}) {
  return (
    <div className="settings-panel">
      <h2>Offline-first connection</h2>
      <p>
        Products, images, payment methods and branding update whenever internet
        returns. Sales remain in this Windows profile and retry until
        acknowledged.
      </p>
      <dl>
        <div>
          <dt>Restaurant</dt>
          <dd>{catalog.branchName}</dd>
        </div>
        <div>
          <dt>Cached products</dt>
          <dd>{catalog.products.length + catalog.deals.length}</dd>
        </div>
        <div>
          <dt>Pending sync</dt>
          <dd>{orders.filter((o) => o.syncState !== "SYNCED").length}</dd>
        </div>
        <div>
          <dt>Recent delivered shown</dt>
          <dd>{catalog.recentOrderLimit}</dd>
        </div>
      </dl>
      <div className="device-alert-setting">
        <span>
          {deviceAlertsEnabled && catalog.desktopOrderSound !== false ? (
            <Volume2 />
          ) : (
            <VolumeX />
          )}
          <span>
            <strong>Website order alerts on this device</strong>
            <small>
              {catalog.desktopOrderSound !== false
                ? "Uses the restaurant sound configured in Admin."
                : "The owner has centrally disabled Desktop POS sound."}
            </small>
          </span>
        </span>
        <button
          type="button"
          disabled={catalog.desktopOrderSound === false}
          className={
            deviceAlertsEnabled && catalog.desktopOrderSound !== false
              ? "is-on"
              : ""
          }
          aria-pressed={
            deviceAlertsEnabled && catalog.desktopOrderSound !== false
          }
          onClick={() => void setDeviceAlertsEnabled(!deviceAlertsEnabled)}
        >
          {deviceAlertsEnabled && catalog.desktopOrderSound !== false
            ? "On"
            : "Off"}
        </button>
      </div>
      <div className="device-sound-actions">
        <label className="setting-button">
          Upload device sound
          <input
            hidden
            type="file"
            accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void (async () => {
                const invalid = await desktopSoundFileError(file);
                if (invalid) {
                  window.alert(invalid);
                  return;
                }
                const reader = new FileReader();
                reader.onload = () =>
                  void setDeviceSoundDataUrl(String(reader.result));
                reader.readAsDataURL(file);
              })();
            }}
          />
        </label>
        <button
          className="setting-button"
          type="button"
          onClick={() =>
            void playDesktopOrderSound(
              deviceSoundDataUrl ??
                catalog.orderNotificationSoundDataUrl ??
                catalog.orderNotificationSoundUrl,
            )
          }
        >
          <Volume2 />
          Test sound
        </button>
        {deviceSoundDataUrl && (
          <button
            className="setting-button"
            type="button"
            onClick={() => void setDeviceSoundDataUrl(null)}
          >
            Use Admin sound
          </button>
        )}
      </div>
      <div className="settings-actions">
        <button
          className="primary setting-button"
          onClick={() => void sync()}
          disabled={!online || syncing}
        >
          <RefreshCw />
          Download latest & sync
        </button>
        <button
          className="setting-button"
          disabled={!online || !session}
          onClick={switchRestaurant}
        >
          Switch restaurant
        </button>
        <button
          className="logout-button setting-button"
          onClick={() => void logout()}
        >
          <LogOut />
          Lock & sign out
        </button>
      </div>
      <hr />
      <h2>Close shift</h2>
      <label>
        Counted cash
        <input
          type="number"
          min="0"
          value={countedCash}
          onChange={(e) => setCountedCash(e.target.value)}
        />
      </label>
      <button
        className="danger setting-button"
        disabled={!countedCash}
        onClick={close}
      >
        Close local shift
      </button>
    </div>
  );
}
