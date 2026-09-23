"use client";

/* eslint-disable @next/next/no-img-element -- owner-configured product URLs cannot use a fixed Next image allowlist */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CollectionOrder } from "@/components/collection-order";
import { MediaField } from "@/components/media-field";
import { ProductAvailability } from "@/components/product-availability";
import { createClient } from "@/lib/supabase/client";
import { mediaPreviewUrl } from "@/lib/media";

type Category = { id: string; name: string; sort_order: number };
type PosSection = { id: string; name: string; sort_order: number };
type Group = {
  id: string;
  name: string;
  selection_type: "SINGLE" | "MULTIPLE";
  is_required: boolean;
  min_selections: number;
  max_selections: number | null;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  category_id: string;
  pos_section_id: string | null;
  description: string;
  base_price: number;
  sale_price: number | null;
  badge: string | null;
  is_available: boolean;
  is_featured: boolean;
  is_active: boolean;
  sort_order: number;
  product_images: Array<{
    id: string;
    url: string;
    alt_text: string;
    is_primary: boolean;
  }>;
  product_modifier_groups: Array<{ modifier_group_id: string }>;
};
type Draft = {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  category_id: string;
  pos_section_id: string;
  description: string;
  base_price: string;
  sale_price: string;
  badge: string;
  is_available: boolean;
  is_featured: boolean;
  is_active: boolean;
  image: string;
  imageAlt: string;
  groups: string[];
};

const empty = (category = ""): Draft => ({
  name: "",
  slug: "",
  sku: "",
  category_id: category,
  pos_section_id: "",
  description: "",
  base_price: "",
  sale_price: "",
  badge: "",
  is_available: true,
  is_featured: false,
  is_active: true,
  image: "",
  imageAlt: "",
  groups: [],
});
const money = (value: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(value);
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export function ProductsManager({
  businessId,
  categories,
  posSections,
  initialProducts,
  groups,
  canManageOptions,
  initialOpen = false,
  assetOrigin,
}: {
  businessId: string;
  categories: Category[];
  posSections: PosSection[];
  initialProducts: Product[];
  groups: Group[];
  canManageOptions: boolean;
  initialOpen?: boolean;
  assetOrigin?: string;
}) {
  const products = initialProducts;
  const router = useRouter();
  const [removing, setRemoving] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() => initialOpen ? empty(categories[0]?.id) : null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const removeProduct = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const { error } = await createClient()
        .from("products")
        .update({ is_active: false, is_available: false })
        .eq("business_id", businessId)
        .eq("id", removing.id);
      if (error) throw error;
      await fetch("/api/revalidate-customer", { method: "POST" });
      setRemoving(null);
      router.refresh();
      setMessage(
        "Product removed from the menu. You can restore it by editing the inactive product.",
      );
    } catch {
      setMessage("Unable to remove this product. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const visible = useMemo(
    () =>
      products.filter((product) => {
        const needle = query.trim().toLowerCase();
        if (
          needle &&
          !`${product.name} ${product.sku ?? ""}`.toLowerCase().includes(needle)
        )
          return false;
        if (category && product.category_id !== category) return false;
        if (status === "ACTIVE" && !product.is_active) return false;
        if (status === "INACTIVE" && product.is_active) return false;
        if (status === "FEATURED" && !product.is_featured) return false;
        if (status === "OUT" && product.is_available) return false;
        return true;
      }),
    [products, query, status, category],
  );
  const edit = (product: Product) => {
    const image =
      product.product_images.find((row) => row.is_primary) ??
      product.product_images[0];
    setDraft({
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku ?? "",
      category_id: product.category_id,
      pos_section_id: product.pos_section_id ?? "",
      description: product.description,
      base_price: String(product.base_price),
      sale_price: product.sale_price === null ? "" : String(product.sale_price),
      badge: product.badge ?? "",
      is_available: product.is_available,
      is_featured: product.is_featured,
      is_active: product.is_active,
      image: image?.url ?? "",
      imageAlt: image?.alt_text ?? product.name,
      groups: product.product_modifier_groups.map(
        (row) => row.modifier_group_id,
      ),
    });
    setMessage("");
  };
  const save = async () => {
    if (!draft) return;
    const regular = Math.round(Number(draft.base_price)),
      sale =
        draft.sale_price === "" ? null : Math.round(Number(draft.sale_price));
    if (
      !draft.name.trim() ||
      !draft.category_id ||
      !Number.isFinite(regular) ||
      regular < 0
    ) {
      setMessage("Complete product name, category and a valid regular price.");
      return;
    }
    if (sale !== null && (sale < 0 || sale >= regular)) {
      setMessage("Sale price must be lower than the regular price.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const payload = {
      business_id: businessId,
      name: draft.name.trim(),
      slug: draft.slug.trim() || slugify(draft.name),
      sku: draft.sku.trim() || null,
      category_id: draft.category_id,
      pos_section_id: draft.pos_section_id || null,
      description: draft.description.trim(),
      base_price: regular,
      sale_price: sale,
      badge: draft.badge.trim() || null,
      is_available: draft.is_available,
      is_featured: draft.is_featured,
      is_active: draft.is_active,
    };
    let productId = draft.id;
    const productResult = productId
      ? await supabase
          .from("products")
          .update(payload)
          .eq("id", productId)
          .eq("business_id", businessId)
          .select("id")
          .single()
      : await supabase.from("products").insert(payload).select("id").single();
    if (productResult.error || !productResult.data) {
      setMessage("Unable to save product. Please try again.");
      setBusy(false);
      return;
    }
    productId = productResult.data.id;
    const current = products.find((row) => row.id === productId);
    const primary =
      current?.product_images.find((row) => row.is_primary) ??
      current?.product_images[0];
    if (draft.image) {
      if (primary)
        await supabase
          .from("product_images")
          .update({
            url: draft.image,
            alt_text: draft.imageAlt.trim() || draft.name,
            is_primary: true,
          })
          .eq("id", primary.id);
      else
        await supabase.from("product_images").insert({
          product_id: productId,
          url: draft.image,
          alt_text: draft.imageAlt.trim() || draft.name,
          is_primary: true,
          sort_order: 0,
        });
    } else if (primary)
      await supabase.from("product_images").delete().eq("id", primary.id);
    if (canManageOptions) {
      await supabase
        .from("product_modifier_groups")
        .delete()
        .eq("product_id", productId);
      if (draft.groups.length)
        await supabase.from("product_modifier_groups").insert(
          draft.groups.map((modifier_group_id, index) => ({
            product_id: productId,
            modifier_group_id,
            sort_order: index,
          })),
        );
    }
    await fetch("/api/revalidate-customer", { method: "POST" });
    window.location.reload();
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MENU OPERATIONS</span>
          <h1>Products</h1>
          <p>
            Manage menu items, pricing, availability, images and customer
            options in one place.
          </p>
        </div>
        <button
          className="button"
          onClick={() => setDraft(empty(categories[0]?.id))}
        >
          <Plus />
          Add product
        </button>
      </div>
      <ProductAvailability businessId={businessId} />
      {message && !draft && !removing && (
        <p className="inline-notice" role="status">
          {message}
        </p>
      )}
      <div className="section-gap" />
      <div className="resource-toolbar">
        <label className="search-field">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search product or SKU"
          />
        </label>
        <select
          aria-label="Product status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="ALL">All products</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="FEATURED">Featured</option>
          <option value="OUT">Out of stock</option>
        </select>
        <select
          aria-label="Product category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </div>
      <div className="product-sections">
        {categories.map((section) => {
          const rows = visible.filter((row) => row.category_id === section.id);
          if (!rows.length) return null;
          const closed = collapsed.includes(section.id);
          return (
            <section className="panel product-section" key={section.id}>
              <button
                className="product-section__heading"
                onClick={() =>
                  setCollapsed((current) =>
                    current.includes(section.id)
                      ? current.filter((id) => id !== section.id)
                      : [...current, section.id],
                  )
                }
              >
                {closed ? <ChevronRight /> : <ChevronDown />}
                <span>{section.name}</span>
                <b>{rows.length}</b>
              </button>
              {!closed && (
                <div className="product-admin-grid">
                  {rows.map((product) => {
                    const image =
                      product.product_images.find((row) => row.is_primary) ??
                      product.product_images[0];
                    return (
                      <article className="product-admin-card" key={product.id}>
                        {image ? (
                          <img
                            src={mediaPreviewUrl(image.url, assetOrigin)}
                            alt=""
                          />
                        ) : (
                          <span className="product-admin-card__image">
                            <ImageIcon />
                          </span>
                        )}
                        <div>
                          <h3>{product.name}</h3>
                          <p>{product.sku || section.name}</p>
                          <strong>
                            {product.sale_price !== null ? (
                              <>
                                <s>{money(product.base_price)}</s>{" "}
                                {money(product.sale_price)}
                              </>
                            ) : (
                              money(product.base_price)
                            )}
                          </strong>
                          <div className="product-flags">
                            <span
                              className={
                                product.is_available ? "is-good" : "is-bad"
                              }
                            >
                              {product.is_available
                                ? "In stock"
                                : "Out of stock"}
                            </span>
                            {product.is_featured && <span>Featured</span>}
                            {!product.is_active && <span>Inactive</span>}
                          </div>
                        </div>
                        <button
                          className="button button--outline"
                          onClick={() => edit(product)}
                        >
                          <Pencil />
                          Edit
                        </button>
                        {product.is_active && (
                          <button
                            className="button button--outline"
                            aria-label={`Remove ${product.name}`}
                            onClick={() => {
                              setMessage("");
                              setRemoving(product);
                            }}
                          >
                            <Trash2 />
                            Remove
                          </button>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {!visible.length && (
          <div className="state-box">No products match these filters.</div>
        )}
      </div>
      <div className="product-ordering">
        <CollectionOrder
          businessId={businessId}
          collection="categories"
          onSaved={() => window.location.reload()}
        />
        <CollectionOrder
          businessId={businessId}
          collection="products"
          onSaved={() => window.location.reload()}
        />
      </div>
      {draft && (
        <div className="drawer-backdrop">
          <section
            className="editor product-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-editor-title"
          >
            <header>
              <div>
                <span className="eyebrow">PRODUCT EDITOR</span>
                <h2 id="product-editor-title">
                  {draft.id ? `Edit ${draft.name}` : "Add product"}
                </h2>
              </div>
              <button
                className="icon-action"
                aria-label="Close"
                onClick={() => setDraft(null)}
              >
                <X />
              </button>
            </header>
            <div className="editor-form product-editor__body">
              <fieldset>
                <legend>1. Basic details</legend>
                <label>
                  <span>Product name *</span>
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        name: event.target.value,
                        slug: draft.id
                          ? draft.slug
                          : slugify(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Category / section *</span>
                  <select
                    value={draft.category_id}
                    onChange={(event) =>
                      setDraft({ ...draft, category_id: event.target.value })
                    }
                  >
                    {categories.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>POS section</span>
                  <select
                    value={draft.pos_section_id}
                    onChange={(event) =>
                      setDraft({ ...draft, pos_section_id: event.target.value })
                    }
                  >
                    <option value="">Unassigned on POS</option>
                    {posSections.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    This controls the counter tab and section sales report. It
                    does not change the website category.
                  </small>
                </label>
                <label>
                  <span>Short description</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>2. Pricing</legend>
                <label>
                  <span>Regular price (PKR) *</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.base_price}
                    onChange={(event) =>
                      setDraft({ ...draft, base_price: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Sale price (PKR)</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.sale_price}
                    onChange={(event) =>
                      setDraft({ ...draft, sale_price: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>3. Product image</legend>
                <MediaField
                  value={draft.image}
                  onChange={(image) => setDraft({ ...draft, image })}
                  label="Upload image or paste image URL"
                  bucket="product-images"
                  folder={`products/${draft.id ?? "new"}`}
                  assetOrigin={assetOrigin}
                />
                <label>
                  <span>Image alt text</span>
                  <input
                    value={draft.imageAlt}
                    onChange={(event) =>
                      setDraft({ ...draft, imageAlt: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <fieldset>
                <legend>4. Availability</legend>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={draft.is_active}
                    onChange={(event) =>
                      setDraft({ ...draft, is_active: event.target.checked })
                    }
                  />
                  <span>Active / show on website</span>
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={draft.is_available}
                    onChange={(event) =>
                      setDraft({ ...draft, is_available: event.target.checked })
                    }
                  />
                  <span>In stock</span>
                </label>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={draft.is_featured}
                    onChange={(event) =>
                      setDraft({ ...draft, is_featured: event.target.checked })
                    }
                  />
                  <span>Featured</span>
                </label>
              </fieldset>
              <fieldset>
                <legend>5. Customize this product</legend>
                <p>
                  Attach reusable choices. Required groups are enforced by the
                  same server pricing used by website and POS.
                </p>
                {groups.map((group) => (
                  <label className="option-attachment" key={group.id}>
                    <input
                      type="checkbox"
                      disabled={!canManageOptions}
                      checked={draft.groups.includes(group.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          groups: event.target.checked
                            ? [...draft.groups, group.id]
                            : draft.groups.filter((id) => id !== group.id),
                        })
                      }
                    />
                    <span>
                      <b>{group.name}</b>
                      <small>
                        {group.is_required ? "Required" : "Optional"} ·{" "}
                        {group.selection_type === "SINGLE"
                          ? "Choose one"
                          : `Choose up to ${group.max_selections ?? "several"}`}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>6. Website display</legend>
                <label>
                  <span>Badge text</span>
                  <input
                    value={draft.badge}
                    onChange={(event) =>
                      setDraft({ ...draft, badge: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              <details>
                <summary>7. Advanced</summary>
                <label>
                  <span>SKU / internal code</span>
                  <input
                    value={draft.sku}
                    onChange={(event) =>
                      setDraft({ ...draft, sku: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Slug</span>
                  <input
                    value={draft.slug}
                    onChange={(event) =>
                      setDraft({ ...draft, slug: event.target.value })
                    }
                  />
                </label>
              </details>
              {message && (
                <p className="inline-notice is-error" role="alert">
                  {message}
                </p>
              )}
            </div>
            <footer className="editor-footer">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Cancel
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save product"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {removing && (
        <div className="drawer-backdrop">
          <section
            className="editor option-remove-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-product-title"
          >
            <header>
              <h2 id="remove-product-title">Remove {removing.name}?</h2>
              <button
                className="icon-action"
                disabled={busy}
                aria-label="Close"
                onClick={() => setRemoving(null)}
              >
                <X />
              </button>
            </header>
            <p>
              The product will be removed from the live menu and linked add-ons.
              Previous orders and reports are preserved.
            </p>
            {message && <p role="alert">{message}</p>}
            <footer className="editor-footer">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >
                Keep product
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void removeProduct()}
              >
                {busy ? "Removing…" : "Remove product"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
