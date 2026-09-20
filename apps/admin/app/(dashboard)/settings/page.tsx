import { ResourceScreen } from "@/components/resource-screen";
import { OrderNotificationSettings } from "@/components/order-notification-settings";
import { requirePermission } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export default async function Page() {
  const context = await requirePermission("settings.manage");
  const { data } = await (
    await createClient()
  )
    .from("business_operating_settings")
    .select("new_order_sound,desktop_order_sound,order_notification_sound_url")
    .eq("business_id", context.businessId)
    .maybeSingle();
  return (
    <>
      <OrderNotificationSettings
        businessId={context.businessId}
        initialEnabled={data?.new_order_sound ?? true}
        initialDesktopEnabled={data?.desktop_order_sound ?? true}
        initialUrl={data?.order_notification_sound_url ?? ""}
      />
      <div className="section-gap" />
      <ResourceScreen resource="operatingSettings" />
      <div className="section-gap" />
      <ResourceScreen resource="posSections" />
      <div className="section-gap" />
      <ResourceScreen resource="posPaymentMethods" />
      {(context.role === "OWNER" ||
        context.permissions.includes("content.manage")) && (
        <>
          <div className="section-gap" />
          <ResourceScreen resource="settings" />
        </>
      )}
    </>
  );
}
