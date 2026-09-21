import { describe, expect, it } from "vitest";
import type { Catalog } from "@/contracts/types";
import { catalogCategories, visibleCatalogEntries } from "./catalog";

const catalog: Catalog = {
  restaurantKey: "restaurant-a",
  branchId: "branch-a1",
  heroSlides: [],
  heroSettings: { autoplay: true, intervalMs: 5500, transitionMs: 650 },
  menuSections: [
    { id: "pizza", title: "Pizza", productCategory: "Pizza" },
    { id: "deals", title: "Deals", kind: "deals" },
  ],
  products: [
    {
      id: "p1",
      name: "Chicken Pizza",
      description: "Spicy",
      price: 1000,
      category: "Pizza",
      available: true,
      image: "",
    },
  ],
  deals: [
    {
      id: "d1",
      name: "Family Deal",
      description: "Pizza combo",
      price: 1800,
      savings: 200,
      image: "",
    },
  ],
};

describe("mobile catalog parity", () => {
  it("preserves Admin category order", () =>
    expect(catalogCategories(catalog)).toEqual(["Pizza"]));
  it("includes products and deals in the all view", () =>
    expect(visibleCatalogEntries(catalog).map((entry) => entry.kind)).toEqual([
      "deal",
      "product",
    ]));
  it("searches names and descriptions across products and deals", () => {
    expect(visibleCatalogEntries(catalog, "all", "family")).toHaveLength(1);
    expect(visibleCatalogEntries(catalog, "all", "spicy")[0]?.kind).toBe(
      "product",
    );
  });
  it("keeps deals out of a product category", () =>
    expect(visibleCatalogEntries(catalog, "Pizza")).toHaveLength(1));
});
