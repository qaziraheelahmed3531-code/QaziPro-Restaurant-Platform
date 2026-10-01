export const site = {
  name: "QaziPro",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://qazipro.com",
  email: "qazipro3531@gmail.com",
  phone: "+923075008055",
  whatsapp: "https://wa.me/923075008055",
  // Client applications and restaurant staff are separate auth audiences.
  clientPortal: "/client-portal",
  superAdmin: process.env.NEXT_PUBLIC_SUPER_ADMIN_URL || "https://admin.qazipro.com",
  demoPortal: process.env.NEXT_PUBLIC_DEMO_PORTAL_URL || "",
};

export const restaurantServices = [
  { title: "Restaurant POS", href: "/restaurant-pos", description: "Fast counter sales, connected to the rest of your operation." },
  { title: "Online ordering", href: "/online-ordering", description: "A direct ordering experience under your restaurant brand." },
  { title: "Restaurant mobile apps", href: "/restaurant-mobile-apps", description: "Branded Android and iOS experiences from one product foundation." },
  { title: "Multi-branch operations", href: "/multi-branch", description: "One view of menus, orders and teams across locations." },
];

export const developmentServices = [
  { title: "Shopify development", href: "/shopify-development", description: "Thoughtful storefronts built for real commerce workflows." },
  { title: "Custom Shopify themes", href: "/shopify-custom-themes", description: "Distinctive themes shaped around your products and brand." },
  { title: "Websites & full-stack apps", href: "/full-stack-development", description: "Frontend, backend, APIs and data engineered as one dependable product." },
  { title: "Business software & SaaS", href: "/full-stack-development#business-software", description: "Custom portals, dashboards, workflows and multi-tenant platforms." },
];

export const allServices = [...restaurantServices, ...developmentServices];

export function whatsappLink(subject = "a QaziPro project") {
  return `${site.whatsapp}?text=${encodeURIComponent(`Assalam-o-Alaikum QaziPro, I'd like to discuss ${subject}.`)}`;
}
