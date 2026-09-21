import { describe, expect, it } from "vitest";
import {
  addLine,
  cartEstimate,
  clearCart,
  emptyCart,
  reorderCart,
  replaceLine,
  restoreStoredCart,
  updateLine,
  validateCart,
} from "./cart";
import type { CartLine, Catalog, OrderDetail } from "@/contracts/types";
const line: CartLine = {
  lineId: "1",
  itemKind: "product",
  productId: "p1",
  variantId: "v1",
  name: "Pizza",
  image: "",
  unitEstimate: 1200,
  quantity: 1,
  modifiers: [
    { groupId: "g1", optionId: "o1", label: "Cheese", priceDelta: 100 },
  ],
};
const catalog: Catalog = {
  restaurantKey: "r",
  branchId: "b",
  heroSlides: [],
  heroSettings: { autoplay: true, intervalMs: 5500, transitionMs: 650 },
  menuSections: [],
  deals: [],
  products: [
    {
      id: "p1",
      name: "Pizza",
      description: "",
      price: 1000,
      category: "Pizza",
      available: true,
      image: "",
      variants: [{ id: "v1", name: "Large", priceDelta: 100, isDefault: true }],
      modifierGroups: [
        {
          id: "g1",
          label: "Extra",
          selection: "single",
          required: false,
          minSelections: 0,
          maxSelections: 1,
          options: [{ id: "o1", label: "Cheese", priceDelta: 100 }],
        },
      ],
    },
  ],
};
describe("cart", () => {
  it("restores a valid tenant-scoped cart", () => {
    const cart = addLine(emptyCart("r", "b"), line);
    expect(restoreStoredCart(cart, "r")).toEqual(cart);
  });
  it("rejects corrupt or cross-tenant persisted carts", () => {
    const cart = addLine(emptyCart("r", "b"), line);
    expect(
      restoreStoredCart({ ...cart, lines: [{ broken: true }] }, "r"),
    ).toBeNull();
    expect(restoreStoredCart(cart, "another-restaurant")).toBeNull();
  });
  it("replaces a customization without duplicating the line", () => {
    const cart = addLine(emptyCart("restaurant-a", "a1"), line);
    const next = replaceLine(cart, line.lineId, {
      ...line,
      quantity: 2,
      variantId: "variant-2",
    });
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0]).toMatchObject({
      lineId: line.lineId,
      quantity: 2,
      variantId: "variant-2",
    });
  });
  it("starts tenant and branch scoped", () =>
    expect(emptyCart("r", "b")).toMatchObject({
      restaurantKey: "r",
      branchId: "b",
      lines: [],
    }));
  it("adds a configured line", () =>
    expect(addLine(emptyCart("r", "b"), line).lines).toHaveLength(1));
  it("calculates display estimate", () =>
    expect(cartEstimate(addLine(emptyCart("r", "b"), line))).toBe(1200));
  it("updates quantity", () =>
    expect(
      updateLine(addLine(emptyCart("r", "b"), line), "1", 3).lines[0].quantity,
    ).toBe(3));
  it("removes zero quantity", () =>
    expect(
      updateLine(addLine(emptyCart("r", "b"), line), "1", 0).lines,
    ).toHaveLength(0));
  it("clears on branch switch", () =>
    expect(clearCart(addLine(emptyCart("r", "b"), line), "b2")).toMatchObject({
      branchId: "b2",
      lines: [],
    }));
  it("validates current identifiers", () =>
    expect(validateCart(addLine(emptyCart("r", "b"), line), catalog)).toBe(
      true,
    ));
  it("rejects unavailable product", () =>
    expect(
      validateCart(addLine(emptyCart("r", "b"), line), {
        ...catalog,
        products: [{ ...catalog.products[0], available: false }],
      }),
    ).toBe(false));
  it("rejects stale variant", () =>
    expect(
      validateCart(
        addLine(emptyCart("r", "b"), { ...line, variantId: "stale" }),
        catalog,
      ),
    ).toBe(false));
  it("rejects stale modifier", () =>
    expect(
      validateCart(
        addLine(emptyCart("r", "b"), {
          ...line,
          modifiers: [{ ...line.modifiers[0], optionId: "stale" }],
        }),
        catalog,
      ),
    ).toBe(false));
  it("rebuilds reorder with current prices", () => {
    const detail = {
      reorder: {
        branchId: "b",
        serviceMode: "PICKUP",
        items: [
          {
            itemKind: "product",
            productId: "p1",
            variantId: "v1",
            quantity: 2,
            modifiers: [{ groupId: "g1", optionId: "o1" }],
          },
        ],
      },
      order: {},
    } as OrderDetail;
    const result = reorderCart(emptyCart("r", "b"), detail, catalog);
    expect(result.cart.lines[0]).toMatchObject({
      unitEstimate: 1200,
      quantity: 2,
    });
    expect(result.skipped).toBe(0);
  });
  it("skips unavailable reorder items", () => {
    const detail = {
      reorder: {
        branchId: "b",
        serviceMode: "PICKUP",
        items: [
          {
            itemKind: "product",
            productId: "missing",
            quantity: 1,
            modifiers: [],
          },
        ],
      },
      order: {},
    } as OrderDetail;
    expect(reorderCart(emptyCart("r", "b"), detail, catalog).skipped).toBe(1);
  });
});
