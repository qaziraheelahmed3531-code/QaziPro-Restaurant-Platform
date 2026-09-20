"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { AppLoader } from "@italian-pizza/shared/app-loader";
import { MOTION_DURATION, MOTION_EASE } from "@italian-pizza/shared/motion";
import {
  ArchiveRestore,
  BadgePercent,
  BarChart3,
  Bell,
  Bike,
  BookImage,
  Boxes,
  Building2,
  Coins,
  ChefHat,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  ContactRound,
  CreditCard,
  FileBarChart,
  Gauge,
  History,
  LayoutDashboard,
  MapPinned,
  MonitorDown,
  PanelLeftClose,
  PanelLeftOpen,
  PackageOpen,
  PackageSearch,
  Palette,
  Printer,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Truck,
  Users,
  UtensilsCrossed,
  WalletCards,
  Warehouse,
  X,
} from "lucide-react";
import {
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AdminTopbar } from "@/components/admin-topbar";
import { DialogAccessibility } from "@/components/dialog-accessibility";
import type { AdminContext } from "@/lib/auth";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ "aria-hidden"?: boolean | "true" }>;
  permission?: string;
};
const groups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/",
        icon: LayoutDashboard,
        permission: "dashboard.view",
      },
    ],
  },
  {
    label: "Operations",
    items: [
      {
        label: "Web POS Counter",
        href: "/pos",
        icon: Store,
        permission: "pos.use",
      },
      {
        label: "Orders",
        href: "/orders",
        icon: ClipboardList,
        permission: "orders.read",
      },
      {
        label: "Kitchen",
        href: "/kitchen",
        icon: ChefHat,
        permission: "kds.use",
      },
      {
        label: "Register / Shifts",
        href: "/register",
        icon: WalletCards,
        permission: "register.manage",
      },
      {
        label: "Waiter Tablet",
        href: "/waiter",
        icon: UtensilsCrossed,
        permission: "waiter.use",
      },
      {
        label: "Rider Portal",
        href: "/rider",
        icon: Bike,
        permission: "rider.use",
      },
      {
        label: "QaziPRO POS Desktop",
        href: "/desktop-pos",
        icon: MonitorDown,
        permission: "desktop_pos.use",
      },
    ],
  },
  {
    label: "Menu",
    items: [
      {
        label: "Products",
        href: "/menu",
        icon: UtensilsCrossed,
        permission: "products.manage",
      },
      {
        label: "Branch Catalog",
        href: "/branch-catalog",
        icon: Store,
        permission: "products.manage",
      },
      {
        label: "Categories",
        href: "/categories",
        icon: Tags,
        permission: "categories.manage",
      },
      {
        label: "Options & Add-ons",
        href: "/modifiers",
        icon: Boxes,
        permission: "modifiers.manage",
      },
      {
        label: "Deals",
        href: "/deals",
        icon: BadgePercent,
        permission: "deals.manage",
      },
    ],
  },
  {
    label: "Inventory",
    items: [
      {
        label: "Stock",
        href: "/inventory",
        icon: Warehouse,
        permission: "inventory.read",
      },
      {
        label: "Ingredients",
        href: "/inventory/manage",
        icon: Boxes,
        permission: "ingredients.manage",
      },
      {
        label: "Recipes",
        href: "/recipes",
        icon: ArchiveRestore,
        permission: "recipes.manage",
      },
      {
        label: "Purchases",
        href: "/purchases",
        icon: PackageOpen,
        permission: "purchases.manage",
      },
      {
        label: "Suppliers",
        href: "/suppliers",
        icon: Truck,
        permission: "suppliers.manage",
      },
      {
        label: "Wastage",
        href: "/wastage",
        icon: History,
        permission: "wastage.manage",
      },
    ],
  },
  {
    label: "Customers",
    items: [
      {
        label: "Customers",
        href: "/customers",
        icon: PackageSearch,
        permission: "customers.read",
      },
      {
        label: "Loyalty & Wallet",
        href: "/loyalty",
        icon: Coins,
        permission: "loyalty.manage",
      },
      {
        label: "Promotions",
        href: "/promotions",
        icon: BadgePercent,
        permission: "promotions.manage",
      },
    ],
  },
  {
    label: "Website",
    items: [
      {
        label: "Hero Banners",
        href: "/banners",
        icon: BookImage,
        permission: "banners.manage",
      },
      {
        label: "Branding",
        href: "/appearance",
        icon: Palette,
        permission: "branding.manage",
      },
      {
        label: "Content & Social",
        href: "/content",
        icon: ContactRound,
        permission: "content.manage",
      },
      {
        label: "Reviews",
        href: "/integrations",
        icon: BarChart3,
        permission: "reviews.manage",
      },
    ],
  },
  {
    label: "Delivery",
    items: [
      {
        label: "Areas & Rules",
        href: "/delivery",
        icon: MapPinned,
        permission: "delivery.manage",
      },
      {
        label: "Branches",
        href: "/branches",
        icon: Building2,
        permission: "branches.manage",
      },
      {
        label: "Hours",
        href: "/hours",
        icon: Clock3,
        permission: "hours.manage",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Invoices / Billing",
        href: "/invoices",
        icon: ReceiptText,
        permission: "invoices.read",
      },
      {
        label: "Payments",
        href: "/payments",
        icon: CreditCard,
        permission: "payments.read",
      },
      {
        label: "Transactions",
        href: "/transactions",
        icon: CircleDollarSign,
        permission: "payments.read",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: FileBarChart,
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Management",
    items: [
      {
        label: "Staff & Roles",
        href: "/users",
        icon: Users,
        permission: "staff.manage",
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ShieldCheck,
        permission: "audit.read",
      },
      {
        label: "Notifications",
        href: "/notifications",
        icon: Bell,
        permission: "notifications.read",
      },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Business",
        href: "/business",
        icon: Building2,
        permission: "business.manage",
      },
      {
        label: "Invoice & Printing",
        href: "/printing",
        icon: Printer,
        permission: "printing.manage",
      },
      {
        label: "POS Sections",
        href: "/pos-sections",
        icon: Tags,
        permission: "settings.manage",
      },
      {
        label: "System Health",
        href: "/system-health",
        icon: Gauge,
        permission: "settings.manage",
      },
      {
        label: "Setup Wizard",
        href: "/setup",
        icon: ShoppingBag,
        permission: "settings.manage",
      },
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        permission: "settings.manage",
      },
      {
        label: "Receipts",
        href: "/receipts",
        icon: ReceiptText,
        permission: "receipts.print",
      },
    ],
  },
];

type AdminBranding = {
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
};

function readableTextOn(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
    (value) => Number.parseInt(value, 16) / 255,
  );
  const luminance = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] > 0.43
    ? "#15110d"
    : "#ffffff";
}

const compactNavigationQuery = "(max-width: 1023px)";
const subscribeCompactNavigation = (notify: () => void) => {
  const query = window.matchMedia(compactNavigationQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function AdminShell({
  context,
  branding,
  children,
}: {
  context: AdminContext;
  branding: AdminBranding;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedPreference, setSidebarCollapsed] = useState(false);
  const compactNavigation = useSyncExternalStore(subscribeCompactNavigation, () => window.matchMedia(compactNavigationQuery).matches, () => false);
  const sidebarCollapsed = collapsedPreference && !compactNavigation;
  const [pendingPath, setPendingPath] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.label,
        ["Overview", "Operations"].includes(group.label),
      ]),
    ),
  );
  const allowed = (permission?: string) =>
    !permission ||
    context.role === "OWNER" ||
    context.permissions.includes(permission) ||
    (permission === "content.manage" &&
      context.permissions.includes("social.manage"));
  const theme = {
    "--brand": branding.primaryColor,
    "--brand-dark": `color-mix(in srgb, ${branding.primaryColor} 82%, black)`,
    "--brand-contrast": readableTextOn(branding.primaryColor),
    "--gold": branding.secondaryColor,
    "--ink": branding.textColor,
  } as CSSProperties;
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`admin-shell${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
        style={theme}
      >
        <DialogAccessibility />
        <AnimatePresence>
          {menuOpen && (
            <motion.button
              className="sidebar-scrim"
              type="button"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION_DURATION.normal }}
            />
          )}
        </AnimatePresence>
        <aside className={menuOpen ? "admin-sidebar is-open" : "admin-sidebar"} inert={compactNavigation && !menuOpen} aria-hidden={compactNavigation && !menuOpen ? true : undefined}>
          <div className="admin-brand">
            {branding.faviconUrl ? (
              <i className="admin-brand__logo">
                <Image
                  src={branding.faviconUrl}
                  alt={`${context.businessName} icon`}
                  width={44}
                  height={44}
                  unoptimized
                />
              </i>
            ) : (
              <i>IP</i>
            )}
            <span>
              <strong>{context.businessName}</strong>
              <small>RESTAURANT OS</small>
            </span>
            <button
              className="sidebar-collapse"
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={
                sidebarCollapsed ? "Expand navigation" : "Collapse navigation"
              }
              aria-pressed={sidebarCollapsed}
              title={
                sidebarCollapsed ? "Expand navigation" : "Collapse navigation"
              }
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
            <button
              className="sidebar-close"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </button>
          </div>
          <nav className="admin-nav" aria-label="Administration">
            {groups.map((group) => {
              const items = group.items.filter((item) =>
                allowed(item.permission),
              );
              if (!items.length) return null;
              const activeGroup = items.some((item) =>
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href),
              );
              const open =
                sidebarCollapsed ||
                Boolean(expanded[group.label]) ||
                activeGroup;
              return (
                <section
                  className={open ? "nav-group is-open" : "nav-group"}
                  key={group.label}
                >
                  <button
                    type="button"
                    className="nav-group__toggle"
                    aria-expanded={open}
                    tabIndex={sidebarCollapsed ? -1 : 0}
                    onClick={() => {
                      if (!sidebarCollapsed)
                        setExpanded((current) => ({
                          ...current,
                          [group.label]: !open,
                        }));
                    }}
                  >
                    <span>{group.label}</span>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  <motion.div
                    className="nav-group__items"
                    initial={false}
                    animate={{
                      height: open ? "auto" : 0,
                      opacity: open ? 1 : 0,
                    }}
                    transition={{
                      duration: MOTION_DURATION.normal,
                      ease: MOTION_EASE,
                    }}
                    aria-hidden={!open}
                  >
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active =
                        item.href === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.href);
                      const priority = [
                        "/",
                        "/pos",
                        "/orders",
                        "/kitchen",
                        "/menu",
                        "/customers",
                      ].includes(item.href);
                      const pending =
                        pendingPath === item.href && pathname !== item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={sidebarCollapsed ? item.label : undefined}
                          aria-label={sidebarCollapsed ? item.label : undefined}
                          prefetch={priority ? true : false}
                          aria-current={active ? "page" : undefined}
                          data-pending={pending || undefined}
                          onPointerEnter={() => router.prefetch(item.href)}
                          onFocus={() => router.prefetch(item.href)}
                          onClick={() => {
                            if (!active) setPendingPath(item.href);
                            setMenuOpen(false);
                          }}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                          {pending && (
                            <AppLoader active label={`Opening ${item.label}`} />
                          )}
                        </Link>
                      );
                    })}
                  </motion.div>
                </section>
              );
            })}
          </nav>
        </aside>
        <div className="admin-main">
          <AdminTopbar
            context={context}
            onMenu={() => setMenuOpen((value) => !value)}
            menuOpen={menuOpen}
          />
          <main
            className="admin-content"
            key={pathname}
          >
            {children}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
