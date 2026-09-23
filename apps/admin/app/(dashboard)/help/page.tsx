import { HelpCenter, type HelpTopic } from "@/components/help-center";
import { requireAdmin } from "@/lib/auth";

const guideCatalog: Array<HelpTopic & { permission?: string }> = [
  { title: "Order workflow", description: "Review incoming orders and their legal status changes.", href: "/orders", permission: "orders.read" },
  { title: "Walk-in POS", description: "Create counter orders, manage payments and print receipts.", href: "/pos", permission: "pos.use" },
  { title: "Kitchen preparation", description: "Track active tickets and move work through preparation.", href: "/kitchen", permission: "kds.use" },
  { title: "Menu setup", description: "Update products, variants, availability and images.", href: "/menu", permission: "products.manage" },
  { title: "Promotions", description: "Manage eligible offers and discount codes.", href: "/promotions", permission: "promotions.manage" },
  { title: "Branch operations", description: "Manage outlets, delivery options and branch details.", href: "/branches", permission: "branches.manage" },
  { title: "Reports", description: "Read sales, channel and product performance.", href: "/reports", permission: "reports.read" },
  { title: "Staff access", description: "Invite staff and review their role and branch scope.", href: "/users", permission: "staff.manage" },
  { title: "Website branding", description: "Update restaurant visuals shared with the storefront.", href: "/appearance", permission: "branding.manage" },
];

export default async function HelpPage() {
  const context = await requireAdmin();
  const topics = guideCatalog.filter(topic => !topic.permission || context.role === "OWNER" || context.permissions.includes(topic.permission));
  return <HelpCenter restaurantName={context.businessName} topics={topics} />;
}
