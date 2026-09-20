import { PrintingManager } from "@/components/printing-manager";
import { requirePermission } from "@/lib/auth";
import { getSelectedBranch } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
export default async function Page() {
  const context = await requirePermission("printing.manage");
  const supabase = await createClient();
  const branch = await getSelectedBranch(supabase, context.businessId);
  if (!branch)
    return (
      <div className="state-box">
        Select a real branch to configure printing.
      </div>
    );
  const [branchDetails, branding, template, printing] = await Promise.all([
    supabase
      .from("branches")
      .select("name,restaurant_name,formatted_address,address,phone,city")
      .eq("id", branch.id)
      .single(),
    supabase
      .from("business_branding")
      .select("logo_url")
      .eq("business_id", context.businessId)
      .maybeSingle(),
    supabase
      .from("invoice_settings")
      .select("*")
      .eq("business_id", context.businessId)
      .maybeSingle(),
    supabase
      .from("print_settings")
      .select("*")
      .eq("business_id", context.businessId)
      .maybeSingle(),
  ]);
  const details = branchDetails.data;
  const name =
    details?.restaurant_name || details?.name || context.businessName;
  return (
    <PrintingManager
      businessId={context.businessId}
      identity={{
        name,
        branchName: `${details?.name || name} — ${details?.city || ""}`,
        address: details?.formatted_address || details?.address || "",
        phone: details?.phone || null,
        logoUrl: branding.data?.logo_url || "",
      }}
      initialTemplate={
        (template.data ?? {
          logo_url: branding.data?.logo_url ?? null,
          show_logo: true,
          show_address: true,
          show_phone: true,
          show_tax: true,
          show_customer_address: true,
          show_payment_status: true,
          show_terms: true,
          thank_you: `Thank you for ordering from ${name}.`,
          terms: null,
          footer_text: null,
          invoice_prefix: "IP-INV",
          currency: "PKR",
          receipt_logo_size: 72,
          receipt_logo_alignment: "CENTER",
          receipt_header_alignment: "CENTER",
          show_branch_name: true,
          show_order_number: true,
          show_token: true,
          show_order_date: true,
          show_order_type: true,
          show_customer_name: true,
          show_customer_phone: true,
          show_payment_method: true,
        }) as never
      }
      initialPrint={
        (printing.data ?? {
          receipt_width_mm: 80,
          auto_print_receipt: false,
          print_kitchen_ticket: true,
          show_prices_on_kitchen_ticket: false,
          receipt_footer: `Thank you for ordering from ${name}.`,
          copies: 1,
        }) as never
      }
      assetOrigin={process.env.CUSTOMER_APP_URL}
    />
  );
}
