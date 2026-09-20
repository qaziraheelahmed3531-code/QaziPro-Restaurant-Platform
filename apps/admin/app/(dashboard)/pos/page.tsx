import { PosShiftStart } from "@/components/pos-shift-start";
import {
  PosTerminal,
  type PosFlowOrder,
  type PosPaymentMethod,
  type PosReplacementOrder,
} from "@/components/pos-terminal";
import {
  WaiterPosQueue,
  type WaiterPosOrder,
} from "@/components/waiter-pos-queue";
import { mediaPreviewUrl } from "@/lib/media";
import { requirePermission } from "@/lib/auth";
import { getSelectedBranch } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ replace?: string }>;
}) {
  const context = await requirePermission("pos.use");
  const supabase = await createClient();
  const params = await searchParams;
  const branch = await getSelectedBranch(
    supabase,
    context.businessId,
    context.assignedBranchId,
  );
  if (!branch)
    return (
      <div className="state-box">
        Create an active branch before opening POS.
      </div>
    );
  const [
    posSections,
    productOverrides,
    products,
    deals,
    assignments,
    shift,
    printing,
    business,
    operating,
    waiterOrders,
    paymentMethods,
    posOrders,
    invoiceTemplate,
  ] = await Promise.all([
    supabase
      .from("pos_sections")
      .select("id,name,color")
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("branch_product_overrides")
      .select("product_id,is_available,price_override,pos_visible,stock_available,sort_order")
      .eq("business_id", context.businessId)
      .eq("branch_id", branch.id),
    supabase
      .from("products")
      .select(
        "id,name,sku,category_id,pos_section_id,base_price,sale_price,is_available,product_images(url,is_primary),product_variants(id,name,price_adjustment,is_default,is_active,sort_order)",
      )
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("deals")
      .select("id,name,deal_price,image_url,starts_at,ends_at")
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_modifier_groups")
      .select(
        "product_id,sort_order,modifier_groups(id,name,selection_type,is_required,min_selections,max_selections,modifier_options(id,name,price_adjustment,is_default,is_active,sort_order,image_url))",
      )
      .order("sort_order"),
    supabase
      .from("register_shifts")
      .select("id,opening_cash,opened_at")
      .eq("business_id", context.businessId)
      .eq("branch_id", branch.id)
      .eq("opened_by", context.userId)
      .eq("status", "OPEN")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("print_settings")
      .select("*")
      .eq("business_id", context.businessId)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("name,phone")
      .eq("id", context.businessId)
      .single(),
    supabase
      .from("business_operating_settings")
      .select("pos_replacement_window_minutes,pos_recent_order_limit")
      .eq("business_id", context.businessId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select(
        "id,order_number,token_number,table_reference,waiter_name,customer_name,order_notes,total,status,payment_status,created_at,order_items(id,product_name,quantity,line_total,order_item_modifiers(group_name,option_name))",
      )
      .eq("business_id", context.businessId)
      .eq("branch_id", branch.id)
      .not("waiter_id", "is", null)
      .eq("payment_status", "UNPAID")
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: true }),
    supabase
      .from("pos_payment_methods")
      .select("id,code,name,kind,requires_reference,sort_order")
      .eq("business_id", context.businessId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("orders")
      .select(
        "id,order_number,token_number,total,status,payment_status,payment_reference,operational_order_type,created_at,pos_order_replacements(id)",
      )
      .eq("business_id", context.businessId)
      .eq("branch_id", branch.id)
      .eq("channel", "POS")
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoice_settings")
      .select(
        "logo_url,thank_you,footer_text,show_logo,show_phone,show_address,show_tax,show_customer_address,show_payment_status,receipt_logo_size,receipt_logo_alignment,receipt_header_alignment,show_branch_name,show_order_number,show_order_date,show_order_type,show_customer_name,show_customer_phone,show_payment_method",
      )
      .eq("business_id", context.businessId)
      .maybeSingle(),
  ]);
  let replacementOrder: PosReplacementOrder | null = null;
  let replacementError = "";
  if (params.replace) {
    const [{ data, error }, eligibilityResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id,order_number,created_at,total,customer_name,customer_phone,order_notes,status,channel,branch_id,pos_order_replacements(id),order_items(id,product_id,deal_id,variant_id,variant_name,product_name,quantity,unit_base_price,order_item_modifiers(modifier_group_id,modifier_option_id,group_name,option_name,price_adjustment))",
        )
        .eq("id", params.replace)
        .eq("business_id", context.businessId)
        .eq("branch_id", branch.id)
        .maybeSingle(),
      supabase.rpc("pos_order_replacement_eligibility", {
        p_order_id: params.replace,
      }),
    ]);
    const alreadyReplaced = Boolean(data?.pos_order_replacements?.length);
    const replacementWindowMinutes =
      operating.data?.pos_replacement_window_minutes ?? 10;
    const eligibility = eligibilityResult.data as {
      withinWindow?: boolean;
    } | null;
    if (error || !data)
      replacementError = "That POS order could not be found for this branch.";
    else if (data.channel !== "POS")
      replacementError = "Website orders cannot use POS item replacement.";
    else if (data.status !== "CONFIRMED")
      replacementError =
        "This order has entered kitchen preparation and can no longer be replaced.";
    else if (alreadyReplaced)
      replacementError = "This POS order has already used its one replacement.";
    else if (eligibilityResult.error || !eligibility?.withinWindow)
      replacementError = `This order's ${replacementWindowMinutes}-minute replacement window has expired.`;
    else replacementOrder = data as unknown as PosReplacementOrder;
  }
  const overrides = new Map((productOverrides.data ?? []).map((row) => [row.product_id, row]));
  const branchProducts = (products.data ?? []).flatMap((product) => {
    const override = overrides.get(product.id);
    if (override?.pos_visible === false) return [];
    return [{
      ...product,
      is_available: (override?.is_available ?? product.is_available) && (override?.stock_available ?? true),
      sale_price: override?.price_override ?? product.sale_price,
      branch_sort_order: override?.sort_order ?? 2147483647,
    }];
  }).sort((first, second) => first.branch_sort_order - second.branch_sort_order);
  return (
    <>
      {replacementError && (
        <p className="inline-notice is-warning" role="alert">
          {replacementError}
        </p>
      )}
      {!shift.data && <PosShiftStart branchId={branch.id} />}
      <WaiterPosQueue
        key={(waiterOrders.data ?? []).map((order) => order.id).join(":")}
        branchId={branch.id}
        shift={shift.data}
        initialOrders={(waiterOrders.data ?? []) as WaiterPosOrder[]}
      />
      <PosTerminal
        canPrint={
          context.role === "OWNER" ||
          context.permissions.includes("receipts.print")
        }
        key={branch.id}
        businessId={context.businessId}
        userId={context.userId}
        businessName={
          branch.restaurant_name ??
          branch.name ??
          business.data?.name ??
          context.businessName
        }
        phone={business.data?.phone ?? null}
        branch={branch}
        posSections={posSections.data ?? []}
        products={branchProducts.map((product) => ({
          ...product,
          product_images: product.product_images.map((image) => ({
            ...image,
            url: mediaPreviewUrl(image.url, process.env.CUSTOMER_APP_URL),
          })),
        }))}
        deals={(deals.data ?? []).map((deal) => ({
          ...deal,
          image_url: deal.image_url
            ? mediaPreviewUrl(deal.image_url, process.env.CUSTOMER_APP_URL)
            : null,
        }))}
        assignments={assignments.data ?? []}
        shift={shift.data}
        printSettings={
          printing.data
            ? {
                ...printing.data,
                logo_url: invoiceTemplate.data?.show_logo
                  ? mediaPreviewUrl(
                      invoiceTemplate.data.logo_url ?? "",
                      process.env.CUSTOMER_APP_URL,
                    )
                  : null,
                receipt_logo_size:
                  invoiceTemplate.data?.receipt_logo_size ?? 72,
                receipt_logo_alignment:
                  invoiceTemplate.data?.receipt_logo_alignment ?? "CENTER",
                receipt_header_alignment:
                  invoiceTemplate.data?.receipt_header_alignment ?? "CENTER",
                receipt_footer:
                  invoiceTemplate.data?.thank_you ?? printing.data.receipt_footer,
                receipt_note: invoiceTemplate.data?.footer_text ?? null,
                show_logo: invoiceTemplate.data?.show_logo ?? true,
                show_phone: invoiceTemplate.data?.show_phone ?? true,
                show_address: invoiceTemplate.data?.show_address ?? true,
                show_tax: invoiceTemplate.data?.show_tax ?? true,
                show_customer_address:
                  invoiceTemplate.data?.show_customer_address ?? true,
                show_payment_status:
                  invoiceTemplate.data?.show_payment_status ?? true,
                show_branch_name:
                  invoiceTemplate.data?.show_branch_name ?? true,
                show_order_number:
                  invoiceTemplate.data?.show_order_number ?? true,
                show_order_date: invoiceTemplate.data?.show_order_date ?? true,
                show_order_type: invoiceTemplate.data?.show_order_type ?? true,
                show_customer_name:
                  invoiceTemplate.data?.show_customer_name ?? true,
                show_customer_phone:
                  invoiceTemplate.data?.show_customer_phone ?? true,
                show_payment_method:
                  invoiceTemplate.data?.show_payment_method ?? true,
              }
            : null
        }
        replacementOrder={replacementOrder}
        replacementWindowMinutes={
          operating.data?.pos_replacement_window_minutes ?? 10
        }
        paymentMethods={(paymentMethods.data ?? []) as PosPaymentMethod[]}
        initialPosOrders={(posOrders.data ?? []) as PosFlowOrder[]}
        recentOrderLimit={operating.data?.pos_recent_order_limit ?? 10}
      />
    </>
  );
}
