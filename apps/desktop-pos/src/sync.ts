import { createClient } from "@supabase/supabase-js";
import { db, deviceId } from "./db";
import { authStorage } from "./auth-storage";
import { drainOutbox } from "./outbox";
import { backfillCloudOrders, cachedCloudOrders, type OrderCursor } from "./cloud-orders";
import { saveOfflineAccess, clearOfflineAccess } from "./offline-access";
import type {
  CatalogSnapshot,
  LocalOrder,
  ModifierGroup,
  WebsiteOrder,
  WebsiteOrderStatus,
} from "./types";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
  {
    global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal??AbortSignal.timeout(12_000)})},
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      storage: authStorage,
    },
  },
);
const one = <T>(value: T | T[] | null | undefined) =>
  Array.isArray(value) ? value[0] : value;
export const absoluteAssetUrl = (url: string | null) =>
  url && url.startsWith("/")
    ? `${import.meta.env.VITE_CUSTOMER_APP_URL.replace(/\/$/, "")}${url}`
    : url;
export async function imageDataUrl(url: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let accessInFlight:ReturnType<typeof resolveBranches>|null=null;
export function availableBranches(){
  if(!accessInFlight)accessInFlight=resolveBranches().finally(()=>{accessInFlight=null;});
  return accessInFlight;
}
async function resolveBranches() {
  const { data: { user },error:userError } = await supabase.auth.getUser();
  if(userError)throw userError;
  if (!user) throw {code:"42501",message:"Sign in is required for POS access."};
  const claim = await supabase.rpc("claim_staff_invitations");
  if (claim.error) throw claim.error;
  const memberships = await supabase
    .from("staff_memberships")
    .select("business_id,branch_id,role,staff_membership_branches(branch_id)")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (memberships.error) throw memberships.error;
  if (!memberships.data?.length)
    throw {code:"42501",message:"No active POS restaurant access is assigned to this email."};
  const businessIds = [
    ...new Set(memberships.data.map((item) => item.business_id)),
  ];
  const grants = await Promise.all(
    businessIds.map(async (businessId) => {
      const result = await supabase.rpc("effective_permissions", {
        p_business_id: businessId,
      });
      if (result.error) throw result.error;
      const permissions = new Set((result.data ?? []) as string[]);
      return permissions.has("desktop_pos.use") &&
        permissions.has("pos.use") &&
        permissions.has("orders.read") &&
        permissions.has("orders.manage") &&
        permissions.has("receipts.print")
        ? businessId
        : null;
    }),
  );
  const allowedBusinesses = grants.filter((value): value is string =>
    Boolean(value),
  );
  if (!allowedBusinesses.length)
    throw {code:"42501",message:"This account does not have QaziPRO POS Desktop access. Ask the owner to assign it from Staff & Roles."};
  const result = await supabase
    .from("branches")
    .select(
      "id,business_id,name,restaurant_name,city,address,formatted_address",
    )
    .in("business_id", allowedBusinesses)
    .eq("is_active", true)
    .order("sort_order");
  if (result.error) throw result.error;
  const scoped = (result.data ?? []).filter((branch) =>
    memberships.data.some(
      (member) =>
        member.business_id === branch.business_id &&
        (member.role === "OWNER" || member.branch_id === branch.id || (member.staff_membership_branches ?? []).some((assignment:{branch_id:string})=>assignment.branch_id===branch.id)),
    ),
  );
  const device=await supabase.from("pos_offline_devices").select("business_id,branch_id,is_active").eq("id",await deviceId()).maybeSingle();
  if(device.error)throw device.error;
  if(device.data&&!device.data.is_active){await clearOfflineAccess();throw {code:"42501",message:"This desktop device was deauthorized. Saved sales are preserved for manager reconciliation."};}
  const boundDevice=device.data;
  const boundBranches=boundDevice?scoped.filter(branch=>branch.id===boundDevice.branch_id&&branch.business_id===boundDevice.business_id):scoped;
  const allowed = (await Promise.all(boundBranches.map(async branch=>{
    const gate=await supabase.rpc("resolve_runtime_entitlements",{p_business_id:branch.business_id,p_branch_id:branch.id,p_capability_keys:["pos.desktop"]}).abortSignal(AbortSignal.timeout(12_000));
    if(gate.error)throw gate.error;
    return gate.data?.["pos.desktop"]?.enabled===true ? branch : null;
  }))).filter((branch):branch is NonNullable<typeof branch>=>Boolean(branch));
  if(!allowed.length){await clearOfflineAccess();throw {code:"42501",message:"Desktop POS access is unavailable. Ask the owner to review this device and your permissions."};}
  await saveOfflineAccess(user.id,allowed.map(({id,business_id})=>({id,business_id})));
  return allowed;
}

async function desktopApi(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new Error("Your Desktop POS session has expired. Sign in again.");
  const baseUrl = import.meta.env.VITE_ADMIN_APP_URL.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(
      "Cloud orders are temporarily unavailable. Saved local sales are safe. Check your connection and retry.",
    );
  }
  const result = (await response.json().catch(() => ({}))) as {
    error?: string;
    orders?: WebsiteOrder[];
    cursor?:OrderCursor|null;
    hasMore?:boolean;
    status?: WebsiteOrderStatus;
    emailStatus?: string;
  };
  if (!response.ok)
    throw new Error(response.status === 401 ? "Your session has expired. Sign in again when online."
      : response.status === 403 ? "You do not have access to this action. Ask your manager to review your permissions."
      : response.status === 409 ? "This order changed on another device. Refresh its status before trying again."
      : "The cloud action could not be completed. Refresh the order status before retrying.");
  return result;
}

export async function loadWebsiteOrders(branchId: string) {
  if (!navigator.onLine) return cachedCloudOrders(branchId);
  return backfillCloudOrders(branchId,async cursor=>{
    const params=new URLSearchParams({branch:branchId,sync:"1"});
    if(cursor){params.set("after",cursor.updatedAt);params.set("afterId",cursor.id);}
    const result=await desktopApi(`/api/desktop-pos/orders?${params}`);
    return {...result,orders:result.orders??[]};
  });
}

export async function updateWebsiteOrderStatus(
  branchId: string,
  orderId: string,
  status: WebsiteOrderStatus,
) {
  return desktopApi("/api/desktop-pos/orders", {
    method: "POST",
    body: JSON.stringify({ branchId, orderId, status }),
  });
}
export async function downloadCatalog(branchId: string) {
  const previous = await db.catalogs.get(branchId);
  const branchResult = await supabase
    .from("branches")
    .select(
      "id,business_id,name,restaurant_name,city,address,formatted_address",
    )
    .eq("id", branchId)
    .single();
  if (branchResult.error) throw branchResult.error;
  const branch = branchResult.data,
    businessId = branch.business_id;
  const [
    business,
    branding,
    categories,
    posSections,
    products,
    productOverrides,
    deals,
    assignments,
    settings,
    paymentMethods,
    printSettings,
    invoiceSettings,
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("name,phone")
      .eq("id", businessId)
      .single(),
    supabase
      .from("business_branding")
      .select("display_name,logo_url,favicon_url,primary_color,secondary_color")
      .eq("business_id", businessId)
      .single(),
    supabase
      .from("categories")
      .select("id,name")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("pos_sections")
      .select("id,name,color")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("products")
      .select(
        "id,name,sku,category_id,pos_section_id,base_price,sale_price,is_available,product_images(url,is_primary,sort_order),product_variants(id,name,price_adjustment,is_default,is_active,sort_order)",
      )
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("branch_product_overrides").select("product_id,is_available,price_override,pos_visible,stock_available,sort_order").eq("business_id",businessId).eq("branch_id",branchId),
    supabase
      .from("deals")
      .select("id,name,deal_price,image_url,starts_at,ends_at")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_modifier_groups")
      .select(
        "product_id,modifier_groups(id,name,selection_type,is_required,min_selections,max_selections,modifier_options(id,name,price_adjustment,is_default,is_active,sort_order,image_url))",
      )
      .order("sort_order"),
    supabase
      .from("business_operating_settings")
      .select(
        "pos_replacement_window_minutes,pos_recent_order_limit,desktop_order_sound,order_notification_sound_url",
      )
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("pos_payment_methods")
      .select("id,code,name,kind,requires_reference,sort_order")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("print_settings")
      .select(
        "receipt_width_mm,copies,print_kitchen_ticket,show_prices_on_kitchen_ticket,receipt_footer",
      )
      .eq("business_id", businessId)
      .maybeSingle(),
    supabase
      .from("invoice_settings")
      .select(
        "thank_you,footer_text,show_logo,show_phone,show_address,show_tax,show_customer_address,show_payment_status,receipt_logo_size,receipt_logo_alignment,receipt_header_alignment,show_branch_name,show_order_number,show_token,show_order_date,show_order_type,show_customer_name,show_customer_phone,show_payment_method",
      )
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);
  for (const result of [
    business,
    branding,
    categories,
    posSections,
    products,
    productOverrides,
    deals,
    assignments,
    paymentMethods,
  ])
    if (result.error) throw result.error;
  const now = Date.now(),
    groupsByProduct = new Map<string, ModifierGroup[]>();
  for (const row of assignments.data ?? []) {
    const raw = one(row.modifier_groups) as
      | {
          id: string;
          name: string;
          selection_type: "SINGLE" | "MULTIPLE";
          is_required: boolean;
          min_selections: number;
          max_selections: number | null;
          modifier_options: Array<{
            id: string;
            name: string;
            price_adjustment: number;
            image_url?: string | null;
            is_default: boolean;
            is_active: boolean;
            sort_order: number;
          }>;
        }
      | undefined;
    if (!raw) continue;
    const list = groupsByProduct.get(row.product_id) ?? [];
    list.push({
      id: raw.id,
      name: raw.name,
      selection: raw.selection_type,
      required: raw.is_required,
      min: raw.min_selections,
      max: raw.max_selections,
      options: (raw.modifier_options ?? [])
        .filter((option) => option.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((option) => ({
          id: option.id,
          name: option.name,
          price: Number(option.price_adjustment),
          imageUrl: absoluteAssetUrl(option.image_url ?? null),
          isDefault: option.is_default,
        })),
    });
    groupsByProduct.set(row.product_id, list);
  }
  const cachedOptionImages = new Map<string, Promise<string | null>>(
    (previous?.products ?? [])
      .flatMap((product) => product.groups.flatMap((group) => group.options))
      .filter((option) => option.imageUrl && option.imageDataUrl)
      .map((option) => [
        option.imageUrl!,
        Promise.resolve(option.imageDataUrl!),
      ]),
  );
  await Promise.all(
    [...groupsByProduct.values()]
      .flat()
      .flatMap((group) => group.options)
      .map(async (option) => {
        if (!option.imageUrl) return;
        if (!cachedOptionImages.has(option.imageUrl))
          cachedOptionImages.set(
            option.imageUrl,
            imageDataUrl(option.imageUrl),
          );
        option.imageDataUrl = await cachedOptionImages.get(option.imageUrl);
      }),
  );
  const activeDeals = (deals.data ?? []).filter(
    (deal) =>
      (!deal.starts_at || new Date(deal.starts_at).getTime() <= now) &&
      (!deal.ends_at || new Date(deal.ends_at).getTime() > now),
  );
  const localDeviceId = await deviceId(),
    meta = await window.desktopPOS?.meta(),
    registration = await supabase.rpc("register_desktop_pos_catalog", {
      p_branch_id: branchId,
      p_device_id: localDeviceId,
      p_device_name: meta?.deviceName ?? "Offline counter",
      p_app_version: meta?.version ?? "0.1.0",
    });
  if (registration.error) throw registration.error;
  const proof=await supabase.from("pos_catalog_snapshots").select("rules").eq("id",String(registration.data)).eq("business_id",businessId).eq("branch_id",branchId).single();
  if(proof.error)throw proof.error;
  const logo = absoluteAssetUrl(branding.data?.logo_url ?? null);
  const favicon = absoluteAssetUrl(branding.data?.favicon_url ?? null);
  const oldProducts = new Map(
    (previous?.products ?? []).map((item) => [item.id, item]),
  );
  const oldDeals = new Map(
    (previous?.deals ?? []).map((item) => [item.id, item]),
  );
  const overrides=new Map((productOverrides.data??[]).map(row=>[row.product_id,row]));
  const visibleProducts=(products.data??[]).flatMap(product=>{const override=overrides.get(product.id);if(override?.pos_visible===false)return [];const available=(override?.is_available??product.is_available)&&(override?.stock_available??true);if(!available)return [];return [{...product,sale_price:override?.price_override??product.sale_price,branchSortOrder:override?.sort_order??2147483647}]}).sort((a,b)=>a.branchSortOrder-b.branchSortOrder);
  const productRows = await Promise.all(
    visibleProducts.map(async (product) => {
      const pictures = (product.product_images ?? [])
        .slice()
        .sort(
          (a, b) =>
            Number(b.is_primary) - Number(a.is_primary) ||
            Number(a.sort_order) - Number(b.sort_order),
        );
      const imageUrl = absoluteAssetUrl(pictures[0]?.url ?? null),
        old = oldProducts.get(product.id);
      return {
        id: product.id,
        categoryId: product.category_id,
        posSectionId: product.pos_section_id,
        name: product.name,
        sku: product.sku,
        price: Number(product.sale_price ?? product.base_price),
        imageUrl,
        imageDataUrl:
          old && old.imageUrl === imageUrl
            ? old.imageDataUrl
            : await imageDataUrl(imageUrl),
        groups: groupsByProduct.get(product.id) ?? [],
        variants:(product.product_variants??[]).filter(variant=>variant.is_active).sort((a,b)=>a.sort_order-b.sort_order).map(variant=>({id:variant.id,name:variant.name,price:Number(variant.price_adjustment),isDefault:variant.is_default})),
      };
    }),
  );
  const dealRows = await Promise.all(
    activeDeals.map(async (deal) => {
      const imageUrl = absoluteAssetUrl(deal.image_url ?? null),
        old = oldDeals.get(deal.id);
      return {
        id: deal.id,
        name: deal.name,
        price: Number(deal.deal_price),
        imageUrl,
        imageDataUrl:
          old && old.imageUrl === imageUrl
            ? old.imageDataUrl
            : await imageDataUrl(imageUrl),
      };
    }),
  );
  const logoDataUrl =
    previous && previous.logoUrl === logo
      ? previous.logoDataUrl
      : await imageDataUrl(logo);
  // Refresh the tiny favicon on every online catalog sync. Admin uploads can
  // replace an object at the same URL, so URL equality alone is not freshness.
  const faviconDataUrl =
    (await imageDataUrl(favicon)) ?? previous?.faviconDataUrl ?? null;
  const notificationSoundUrl = absoluteAssetUrl(
    settings.data?.order_notification_sound_url ?? null,
  );
  const orderNotificationSoundDataUrl =
    previous && previous.orderNotificationSoundUrl === notificationSoundUrl
      ? previous.orderNotificationSoundDataUrl
      : await imageDataUrl(notificationSoundUrl);
  const catalog: CatalogSnapshot = {
    branchId,
    businessId,
    catalogVersionId: String(registration.data),
    taxRateBps:Number(proof.data.rules?.taxRateBps??0),
    branchName: branch.restaurant_name ?? branch.name,
    city: branch.city,
    businessAddress: branch.formatted_address ?? branch.address ?? null,
    businessName:
      branding.data?.display_name ?? business.data?.name ?? branch.name,
    logoUrl: logo,
    logoDataUrl,
    faviconUrl: favicon,
    faviconDataUrl,
    primaryColor: branding.data?.primary_color ?? "#a92114",
    secondaryColor: branding.data?.secondary_color ?? "#e7a81a",
    replacementWindowMinutes: Number(
      settings.data?.pos_replacement_window_minutes ?? 10,
    ),
    recentOrderLimit: Number(settings.data?.pos_recent_order_limit ?? 10),
    desktopOrderSound: settings.data?.desktop_order_sound ?? true,
    orderNotificationSoundUrl: notificationSoundUrl,
    orderNotificationSoundDataUrl,
    paymentMethods: (paymentMethods.data ?? []).map((method) => ({
      id: method.id,
      code: method.code,
      name: method.name,
      kind: method.kind as "CASH" | "WALLET" | "CARD" | "OTHER",
      requiresReference: method.requires_reference,
      sortOrder: method.sort_order,
    })),
    posSections: posSections.data ?? [],
    categories: categories.data ?? [],
    products: productRows,
    deals: dealRows,
    receiptSettings: {
      width: printSettings.data?.receipt_width_mm === 58 ? 58 : 80,
      copies: Math.min(5, Math.max(1, Number(printSettings.data?.copies ?? 1))),
      includeKitchen: printSettings.data?.print_kitchen_ticket ?? true,
      kitchenPrices: printSettings.data?.show_prices_on_kitchen_ticket ?? false,
      footer:
        invoiceSettings.data?.thank_you ??
        printSettings.data?.receipt_footer ??
        `Thank you for ordering from ${branding.data?.display_name ?? business.data?.name ?? branch.name}.`,
      note: invoiceSettings.data?.footer_text ?? null,
      phone: business.data?.phone ?? null,
      logoSize: Number(invoiceSettings.data?.receipt_logo_size ?? 72),
      logoAlignment: invoiceSettings.data?.receipt_logo_alignment ?? "CENTER",
      headerAlignment:
        invoiceSettings.data?.receipt_header_alignment ?? "CENTER",
      showLogo: invoiceSettings.data?.show_logo ?? true,
      showPhone: invoiceSettings.data?.show_phone ?? true,
      showAddress: invoiceSettings.data?.show_address ?? true,
      showTax: invoiceSettings.data?.show_tax ?? true,
      showCustomerAddress: invoiceSettings.data?.show_customer_address ?? true,
      showPaymentStatus: invoiceSettings.data?.show_payment_status ?? true,
      showBranchName: invoiceSettings.data?.show_branch_name ?? true,
      showOrderNumber: invoiceSettings.data?.show_order_number ?? true,
      showToken: invoiceSettings.data?.show_token ?? true,
      showOrderDate: invoiceSettings.data?.show_order_date ?? true,
      showOrderType: invoiceSettings.data?.show_order_type ?? true,
      showCustomerName: invoiceSettings.data?.show_customer_name ?? true,
      showCustomerPhone: invoiceSettings.data?.show_customer_phone ?? true,
      showPaymentMethod: invoiceSettings.data?.show_payment_method ?? true,
    },
    updatedAt: new Date().toISOString(),
  };
  await db.catalogs.put(catalog);
  return catalog;
}

function payload(
  order: LocalOrder,
  device: string,
  catalogVersionId: string,
  shift: {
    openingCash: number;
    openedAt: string;
    closedAt: string | null;
    countedCash: number | null;
  },
) {
  return {
    deviceId: device,
    catalogVersionId,
    offlineOrderId: order.id,
    offlineShiftId: order.shiftId,
    soldAt: order.soldAt,
    branchId: order.branchId,
    openingCash: shift.openingCash,
    shiftOpenedAt: shift.openedAt,
    shiftClosedAt: shift.closedAt,
    countedCash: shift.countedCash,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes,
    orderType: order.orderType,
    tableReference: order.tableReference,
    cashReceived: order.cashReceived,
    tax:order.tax??0,
    total:order.total,
    paymentMethodCode: order.paymentMethodCode ?? "CASH",
    paymentReference: order.paymentReference ?? "",
    operationalStatus: order.operationalStatus ?? "CONFIRMED",
    items: order.items.map((line) => ({
      itemKind: line.itemKind,
      productId: line.productId,
      variantId: line.variantId,
      variantName: line.variantName,
      name: line.name,
      quantity: line.quantity,
      unitBasePrice: line.unitBasePrice,
      unitModifierPrice: line.selections.reduce(
        (sum, item) => sum + item.price,
        0,
      ),
      unitPrice:
        line.unitBasePrice +
        line.selections.reduce((sum, item) => sum + item.price, 0),
      modifiers: line.selections,
    })),
    replacement: order.replacement,
  };
}
export async function syncPendingOrders(retryAttention = false) {
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  // Resolve the authenticated staff's allowed branches before reading/sending
  // any device outbox. Another login must not flush a previous tenant's sales.
  const branches = await availableBranches();
  const id = await deviceId();
  return drainOutbox({branchIds:branches.map(branch=>branch.id),retryAttention,send:async(order)=>{
    const shift = await db.shifts.get(order.shiftId),
      catalog = await db.catalogs.get(order.branchId);
    if (!shift || !catalog) throw {code:"LOCAL_CONTEXT_MISSING"};
    const { data, error } = await supabase.rpc("sync_offline_pos_order", {
      p_payload: payload(
        order,
        id,
        order.catalogVersionId ?? catalog.catalogVersionId,
        shift,
      ),
    }).abortSignal(AbortSignal.timeout(30_000));
    if (error) throw error;
      const result = data as {
        id: string;
        orderNumber: string;
        status?: LocalOrder["operationalStatus"];
      };
      if (order.operationalStatus === "CANCELLED") {
        const cancellation = await supabase.rpc("cancel_pos_order", {
          p_order_id: result.id,
          p_reason: "Cancelled from Desktop POS",
        }).abortSignal(AbortSignal.timeout(30_000));
        if (cancellation.error) throw cancellation.error;
        result.status = "CANCELLED";
      }
      return result;
  }});
}
