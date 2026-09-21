import type { Catalog, Deal, Product } from "@/contracts/types";

export type CatalogEntry =
  | { kind: "product"; item: Product }
  | { kind: "deal"; item: Deal };

export function catalogCategories(catalog: Catalog | null) {
  if (!catalog) return [];
  const ordered = catalog.menuSections
    .filter((section) => section.kind !== "deals" && section.productCategory)
    .map((section) => section.productCategory as string);
  const productCategories = catalog.products.map((product) => product.category);
  return [...new Set([...ordered, ...productCategories])];
}

export function visibleCatalogEntries(
  catalog: Catalog | null,
  category = "all",
  search = "",
): CatalogEntry[] {
  if (!catalog) return [];
  const needle = search.trim().toLocaleLowerCase();
  const matches = (name: string, description: string) =>
    !needle || `${name} ${description}`.toLocaleLowerCase().includes(needle);
  const products: CatalogEntry[] = catalog.products
    .filter(
      (product) =>
        (category === "all" || product.category === category) &&
        matches(product.name, product.description),
    )
    .map((item) => ({ kind: "product", item }));
  const deals: CatalogEntry[] =
    category === "all" || category === "deals"
      ? catalog.deals
          .filter((deal) => matches(deal.name, deal.description))
          .map((item) => ({ kind: "deal", item }))
      : [];
  return [...deals, ...products];
}
