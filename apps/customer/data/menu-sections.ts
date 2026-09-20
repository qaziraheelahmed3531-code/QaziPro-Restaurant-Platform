import type { MenuSection } from "@/types"

export const menuSections: MenuSection[] = [
  { id: "deals", title: "Deals", description: "Easy bundles for solo orders and family tables.", bannerImage: "/images/section-banners/deals-placeholder.svg", categoryImage: "/images/categories/deals-placeholder.svg", kind: "deals" },
  { id: "pizzas", title: "Pizzas", description: "Stone-baked signatures with your choice of size, crust and extras.", bannerImage: "/images/section-banners/pizzas-placeholder.svg", categoryImage: "/images/categories/pizza-placeholder.svg", productCategory: "Pizza" },
  { id: "burgers", title: "Burgers", description: "Crispy, satisfying favorites made for a quick order.", bannerImage: "/images/section-banners/burgers-placeholder.svg", categoryImage: "/images/categories/burgers-placeholder.svg", productCategory: "Burgers" },
  { id: "beverages", title: "Beverages", description: "Cold drinks to complete your meal.", bannerImage: "/images/section-banners/beverages-placeholder.svg", categoryImage: "/images/categories/beverages-placeholder.svg", productCategory: "Beverages" },
  { id: "addons", title: "Add-ons", description: "Chutney, salad, sauces, cheese, toppings and dips will live here.", bannerImage: "/images/section-banners/addons-placeholder.svg", categoryImage: "/images/categories/addons-placeholder.svg", productCategory: "Add-ons" },
  { id: "fries", title: "Fries", description: "Crisp sides prepared for sharing—or keeping.", bannerImage: "/images/section-banners/fries-placeholder.svg", categoryImage: "/images/categories/fries-placeholder.svg", productCategory: "Fries" },
  { id: "bbq", title: "BBQ / Chicken", description: "Chicken pieces and barbecue selections prepared for this menu slot.", bannerImage: "/images/section-banners/bbq-placeholder.svg", categoryImage: "/images/categories/bbq-placeholder.svg", productCategory: "BBQ" },
  { id: "sides", title: "Sides", description: "Simple extras that round out every order.", bannerImage: "/images/section-banners/sides-placeholder.svg", categoryImage: "/images/categories/sides-placeholder.svg", productCategory: "Sides" },
]
