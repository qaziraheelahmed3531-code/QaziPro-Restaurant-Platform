import type { Deal, Product, ProductOption } from "@/types"

export const products: Product[] = [
  {
    id: "chicken-fajita",
    name: "Chicken Fajita Pizza",
    description: "Stone-baked with mozzarella, peppers and our signature sauce.",
    price: 1249,
    category: "Pizza",
    badge: "Popular",
    available: true,
    customizable: true,
    image: "/images/products/pizza-placeholder.svg",
  },
  {
    id: "chicken-tikka",
    name: "Chicken Tikka Pizza",
    description: "Smoky tikka chicken, mozzarella and a bright tomato base.",
    price: 1299,
    category: "Pizza",
    badge: "Popular",
    available: true,
    customizable: true,
    image: "/images/products/pizza-placeholder.svg",
  },
  {
    id: "italian-special",
    name: "Italian Special Pizza",
    description: "A generous signature pizza with chicken, vegetables and cheese.",
    price: 1399,
    oldPrice: 1749,
    category: "Pizza",
    badge: "20% OFF",
    available: true,
    customizable: true,
    image: "/images/products/pizza-placeholder.svg",
  },
  {
    id: "zinger-burger",
    name: "Zinger Burger",
    description: "Crispy chicken, fresh slaw and our house sauce.",
    price: 699,
    category: "Burgers",
    available: true,
    image: "/images/products/burger-placeholder.svg",
  },
  {
    id: "solo-pizza-meal",
    name: "Solo Pizza Meal",
    description: "Small pizza, fries and a drink for an easy solo order.",
    price: 899,
    oldPrice: 1090,
    category: "Deals",
    badge: "Deal",
    available: true,
    customizable: true,
    image: "/images/products/deal-placeholder.svg",
  },
  {
    id: "creamy-chicken-pasta",
    name: "Creamy Chicken Pasta",
    description: "Creamy sauce, tender chicken and herbs.",
    price: 849,
    category: "Pasta",
    badge: "New",
    available: false,
    image: "/images/products/pasta-placeholder.svg",
  },
]

export const deals: Deal[] = [
  {
    id: "family-feast",
    name: "Family Feast",
    description: "2 Large Pizzas + Drink",
    price: 2499,
    savings: 700,
    image: "/images/products/deal-placeholder.svg",
  },
  {
    id: "pizza-duo",
    name: "Pizza Duo",
    description: "2 Medium Pizzas",
    price: 1799,
    savings: 450,
    image: "/images/products/deal-placeholder.svg",
  },
  {
    id: "solo-meal",
    name: "Solo Meal",
    description: "Small Pizza + Fries + Drink",
    price: 899,
    savings: 240,
    image: "/images/products/deal-placeholder.svg",
  },
]

export const pizzaSizes: ProductOption[] = [
  { id: "small", label: "Small", priceDelta: 0 },
  { id: "medium", label: "Medium", priceDelta: 300 },
  { id: "large", label: "Large", priceDelta: 650 },
  { id: "family", label: "Family", priceDelta: 1050 },
]

export const pizzaCrusts: ProductOption[] = [
  { id: "regular", label: "Regular", priceDelta: 0 },
  { id: "thin", label: "Thin", priceDelta: 0 },
  { id: "stuffed", label: "Stuffed", priceDelta: 250 },
  { id: "crown", label: "Crown", priceDelta: 350 },
]

export const pizzaExtras: ProductOption[] = [
  { id: "extra-cheese", label: "Extra cheese", priceDelta: 180 },
  { id: "olives", label: "Olives", priceDelta: 90 },
  { id: "jalapenos", label: "Jalapeños", priceDelta: 80 },
  { id: "extra-chicken", label: "Extra chicken", priceDelta: 220 },
]

export function getProduct(id: string) {
  return products.find((product) => product.id === id)
}
