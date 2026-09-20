"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "@/components/menu-image";
import { GripVertical, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Option = {
  id?: string;
  name: string;
  price_adjustment: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  linked_product_id?: string | null;
  image_url?: string | null;
};
type CatalogChoice = { id: string; name: string; base_price: number; sale_price: number | null; product_images: Array<{url: string; is_primary: boolean; sort_order: number}> };
type Group = {
  id: string;
  name: string;
  customer_instruction: string | null;
  selection_type: "SINGLE" | "MULTIPLE";
  is_required: boolean;
  min_selections: number;
  max_selections: number | null;
  is_active: boolean;
  sort_order: number;
  modifier_options: Option[];
};
type Usage = {
  modifier_group_id: string;
  products:
    { id: string; name: string } | Array<{ id: string; name: string }> | null;
};
type Draft = Omit<Group, "id"> & { id?: string };
const blank = (): Draft => ({
  name: "",
  customer_instruction: "",
  selection_type: "SINGLE",
  is_required: false,
  min_selections: 0,
  max_selections: 1,
  is_active: true,
  sort_order: 0,
  modifier_options: [
    {
      name: "",
      price_adjustment: 0,
      is_active: true,
      is_default: false,
      sort_order: 0,
    },
  ],
});
const money = (value: number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
    signDisplay: value > 0 ? "always" : "auto",
  }).format(value);

export function OptionsManager({
  businessId,
  initialGroups,
  usage,
  products,
}: {
  businessId: string;
  initialGroups: Group[];
  usage: Usage[];
  products: CatalogChoice[];
}) {
  const router = useRouter();
  const groups = initialGroups;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<Group | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const usageMap = useMemo(
    () =>
      new Map(
        groups.map((group) => [
          group.id,
          usage
            .filter((row) => row.modifier_group_id === group.id)
            .map((row) =>
              Array.isArray(row.products)
                ? row.products[0]?.name
                : row.products?.name,
            )
            .filter(Boolean) as string[],
        ]),
      ),
    [groups, usage],
  );
  const save = async () => {
    if (!draft) return;
    if (
      !draft.name.trim() ||
      draft.modifier_options.some((row) => !row.name.trim())
    ) {
      setMessage("Add a group name and complete every option name.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await createClient().rpc("save_modifier_group", { p_business_id: businessId, p_group: draft });
      if (error) throw error;
      await fetch("/api/revalidate-customer", { method: "POST" });
      setDraft(null); router.refresh(); setMessage("Option group saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : (error as {message?: string})?.message || "Unable to save. Please try again."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const {error} = await createClient().rpc("remove_modifier_group", {p_business_id: businessId, p_group_id: removing.id});
      if (error) throw error;
      await fetch("/api/revalidate-customer", {method:"POST"});
      setRemoving(null); router.refresh(); setMessage("Option group removed from the menu. Past orders are preserved.");
    } catch { setMessage("Unable to remove this group. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MENU CUSTOMIZATION</span>
          <h1>Options &amp; Add-ons</h1>
          <p>
            Create reusable choices such as pizza size, crust and extra
            toppings.
          </p>
        </div>
        <button className="button" onClick={() => setDraft(blank())}>
          <Plus />
          Add option group
        </button>
      </div>
      {message && !draft && !removing && <p className="inline-notice" role="status">{message}</p>}
      <section className="options-explainer">
        <article>
          <b>SIZE</b>
          <span>Customer must choose one</span>
          <small>Small · Medium · Large</small>
        </article>
        <article>
          <b>CRUST</b>
          <span>Customer must choose one</span>
          <small>Thin · Pan · Stuffed</small>
        </article>
        <article>
          <b>EXTRAS</b>
          <span>Customer can choose several</span>
          <small>Cheese · Jalapeños · Chicken</small>
        </article>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Your reusable choices</h2>
            <p>Attach these groups inside any product editor.</p>
          </div>
        </div>
        <div className="option-group-list">
          {groups.map((group) => {
            const used = usageMap.get(group.id) ?? [];
            return (
              <article key={group.id}>
                <div>
                  <h3>{group.name}</h3>
                  <p>
                    {group.customer_instruction ||
                      `${group.is_required ? "Required" : "Optional"} · ${group.selection_type === "SINGLE" ? "Choose one" : `Choose up to ${group.max_selections ?? "several"}`}`}
                  </p>
                  <small>
                    Used by: {used.length ? used.join(", ") : "No products yet"}
                  </small>
                </div>
                <div className="option-pills">
                  {group.modifier_options
                    .filter((row) => row.is_active)
                    .map((row) => (
                      <span key={row.id}>
                        {row.name}{" "}
                        {row.price_adjustment
                          ? money(row.price_adjustment)
                          : ""}
                      </span>
                    ))}
                </div>
                <div className="option-group-actions"><button
                  className="button button--outline"
                  onClick={() =>
                    setDraft({
                      ...group,
                      modifier_options: group.modifier_options.filter(row => row.is_active).map((row) => ({
                        ...row,
                      })),
                    })
                  }
                >
                  <Pencil />
                  Edit
                </button>
                <button className="button button--outline" onClick={() => {setMessage("");setRemoving(group)}} aria-label={`Remove ${group.name}`}><Trash2/>Remove</button></div>
              </article>
            );
          })}
          {!groups.length && (
            <div className="state-box">No option groups yet.</div>
          )}
        </div>
      </section>
      {draft && (
        <div className="drawer-backdrop">
          <section
            className="editor option-editor"
            role="dialog"
            aria-modal="true"
          >
            <header>
              <div>
                <span className="eyebrow">OPTION GROUP</span>
                <h2>{draft.id ? `Edit ${draft.name}` : "Add option group"}</h2>
              </div>
              <button
                className="icon-action"
                aria-label="Close"
                onClick={() => setDraft(null)}
              >
                <X />
              </button>
            </header>
            <div className="editor-form">
              <label>
                <span>Group name *</span>
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Choose size"
                />
              </label>
              <label>
                <span>Customer instruction</span>
                <input
                  value={draft.customer_instruction ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      customer_instruction: event.target.value,
                    })
                  }
                  placeholder="Choose your pizza size"
                />
              </label>
              <fieldset className="is-wide">
                <legend>Selection type</legend>
                <label className="switch-row">
                  <input
                    type="radio"
                    checked={draft.selection_type === "SINGLE"}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        selection_type: "SINGLE",
                        max_selections: 1,
                      })
                    }
                  />
                  Choose one
                </label>
                <label className="switch-row">
                  <input
                    type="radio"
                    checked={draft.selection_type === "MULTIPLE"}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        selection_type: "MULTIPLE",
                        max_selections: Math.max(2, draft.max_selections ?? 2),
                      })
                    }
                  />
                  Choose multiple
                </label>
              </fieldset>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={draft.is_required}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      is_required: event.target.checked,
                      min_selections: event.target.checked
                        ? Math.max(1, draft.min_selections)
                        : 0,
                    })
                  }
                />
                <span>Required</span>
              </label>
              <label>
                <span>Minimum selections</span>
                <input
                  type="number"
                  min="0"
                  value={draft.min_selections}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      min_selections: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <span>Maximum selections</span>
                <input
                  type="number"
                  min="1"
                  disabled={draft.selection_type === "SINGLE"}
                  value={draft.max_selections ?? ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      max_selections: Number(event.target.value),
                    })
                  }
                />
              </label>
              <div className="is-wide linked-addon-picker">
                <h3>Add an existing product</h3>
                <p>Choose a drink, side or other item. Its base price, name and picture stay in sync with Products. Choices within that product are not included.</p>
                <input type="search" aria-label="Search products for add-ons" placeholder="Search drinks, sides or products" value={productQuery} onChange={event=>setProductQuery(event.target.value)}/>
                <div>{products.filter(product=>product.name.toLowerCase().includes(productQuery.trim().toLowerCase())).slice(0,30).map(product=>{
                  const image=[...product.product_images].sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order)[0]?.url;
                  const added=draft.modifier_options.some(option=>option.linked_product_id===product.id);
                  return <button type="button" key={product.id} disabled={added} onClick={()=>setDraft({...draft,modifier_options:[...draft.modifier_options.filter(row=>row.name.trim()||row.id),{name:product.name,price_adjustment:Number(product.sale_price??product.base_price),linked_product_id:product.id,image_url:image,is_active:true,is_default:false,sort_order:draft.modifier_options.length}]})}>{image&&<Image src={image} alt="" width={42} height={42} unoptimized/>}<span>{product.name}<small>{money(Number(product.sale_price??product.base_price))}</small></span><b>{added?"Added":"Add"}</b></button>
                })}</div>
              </div>
              <div className="is-wide option-lines">
                <h3>Options</h3>
                {draft.modifier_options.map((row, index) => (
                  <div key={row.id ?? index}>
                    <GripVertical />
                    <input
                      aria-label={`Option ${index + 1} name`}
                      readOnly={Boolean(row.linked_product_id)}
                      title={row.linked_product_id ? "Linked product: edit its name in Products" : undefined}
                      value={row.name}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          modifier_options: draft.modifier_options.map(
                            (item, i) =>
                              i === index
                                ? { ...item, name: event.target.value }
                                : item,
                          ),
                        })
                      }
                      placeholder="Option name"
                    />
                    <input
                      aria-label={`Option ${index + 1} extra price`}
                      readOnly={Boolean(row.linked_product_id)}
                      title={row.linked_product_id ? "Linked product: edit its price in Products" : undefined}
                      type="number"
                      value={row.price_adjustment}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          modifier_options: draft.modifier_options.map(
                            (item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    price_adjustment: Number(
                                      event.target.value,
                                    ),
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                    <label className="switch-row">
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            modifier_options: draft.modifier_options.map(
                              (item, i) =>
                                i === index
                                  ? { ...item, is_active: event.target.checked }
                                  : item,
                            ),
                          })
                        }
                      />
                      Active
                    </label>
                    <button
                      className="icon-action"
                      aria-label="Remove option"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          modifier_options: draft.modifier_options.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <X />
                    </button>
                  </div>
                ))}
                <button
                  className="button button--outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      modifier_options: [
                        ...draft.modifier_options,
                        {
                          name: "",
                          price_adjustment: 0,
                          is_active: true,
                          is_default: false,
                          sort_order: draft.modifier_options.length,
                        },
                      ],
                    })
                  }
                >
                  <Plus />
                  Add custom option
                </button>
              </div>
              {message && (
                <p className="inline-notice is-error is-wide">{message}</p>
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
                disabled={busy || !draft.modifier_options.length}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save option group"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {removing && <div className="drawer-backdrop"><section className="editor option-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-option-title"><header><h2 id="remove-option-title">Remove {removing.name}?</h2><button className="icon-action" aria-label="Close" disabled={busy} onClick={()=>setRemoving(null)}><X/></button></header><p>This removes the group from all attached products. Previous orders and their selected options are preserved.</p>{message && <p role="alert">{message}</p>}<footer className="editor-footer"><button className="button button--outline" disabled={busy} onClick={()=>setRemoving(null)}>Keep group</button><button className="button" disabled={busy} onClick={()=>void remove()}>{busy?"Removing…":"Remove group"}</button></footer></section></div>}
    </>
  );
}
