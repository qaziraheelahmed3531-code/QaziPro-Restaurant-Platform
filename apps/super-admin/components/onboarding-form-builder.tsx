"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MutationForm } from "./mutation-form";
import { SubmitButton } from "./submit-button";
import { saveOnboardingFormAction } from "@/app/(platform)/website/actions";
import type { FormDefinition } from "@/lib/website-cms";

type Collection = "sections" | "fields" | "services" | "packages" | "terms";
const id = () => `custom-${crypto.randomUUID().slice(0, 8)}`;

export function OnboardingFormBuilder({
  id: formId,
  revision,
  definition,
}: {
  id: string;
  revision: number;
  definition: FormDefinition;
}) {
  const [draft, setDraft] = useState(definition);
  const replace = (
    collection: Collection,
    index: number,
    value: Record<string, unknown>,
  ) =>
    setDraft(
      (current) =>
        ({
          ...current,
          [collection]: current[collection].map((item, i) =>
            i === index ? { ...item, ...value } : item,
          ),
        }) as FormDefinition,
    );
  const remove = (collection: Collection, index: number) =>
    setDraft(
      (current) =>
        ({
          ...current,
          [collection]: current[collection].filter((_, i) => i !== index),
        }) as FormDefinition,
    );
  const move = (collection: Collection, index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const list = [...current[collection]],
        next = index + direction;
      if (next < 0 || next >= list.length) return current;
      [list[index], list[next]] = [list[next], list[index]];
      return {
        ...current,
        [collection]: list.map((item, order) => ({
          ...item,
          order: order + 1,
        })),
      } as FormDefinition;
    });
  const add = (collection: Collection) =>
    setDraft((current) => {
      const order = current[collection].length + 1;
      const item =
        collection === "sections"
          ? { id: id(), title: "New section", enabled: true, order }
          : collection === "fields"
            ? {
                id: id(),
                label: "New field",
                placeholder: "",
                type: "text" as const,
                required: false,
                system: false,
                enabled: true,
                order,
                options: [],
              }
            : collection === "services"
              ? {
                  id: id(),
                  name: "New service",
                  description: "",
                  monthlyFee: null,
                  setupFee: null,
                  perLocationFee: null,
                  percentageFee: null,
                  active: true,
                  order,
                }
              : collection === "packages"
                ? {
                    id: id(),
                    name: "New package",
                    description: "",
                    currency: "PKR",
                    monthlyFee: null,
                    setupFee: null,
                    perLocationFee: null,
                    serviceIds: [],
                    notes: "",
                    active: true,
                    order,
                  }
                : { id: id(), text: "New term", active: true, order };
      return {
        ...current,
        [collection]: [...current[collection], item],
      } as FormDefinition;
    });
  const money = (value: string) =>
    value.trim() === "" ? null : Math.max(0, Math.round(Number(value) || 0));
  const percent = (value: string) =>
    value.trim() === "" ? null : Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="builder-layout">
      <div className="builder-editor">
        <MutationForm
          action={saveOnboardingFormAction}
          className="builder-save-form"
        >
          <input type="hidden" name="id" value={formId} />
          <input type="hidden" name="revision" value={revision} />
          <input
            type="hidden"
            name="definition"
            value={JSON.stringify(draft)}
          />
          <label>
            Form title
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label>
            Introduction
            <textarea
              rows={3}
              value={draft.intro}
              onChange={(event) =>
                setDraft({ ...draft, intro: event.target.value })
              }
            />
          </label>
          <label>
            Consent text
            <textarea
              rows={3}
              value={draft.consentText}
              onChange={(event) =>
                setDraft({ ...draft, consentText: event.target.value })
              }
            />
          </label>
          <SubmitButton className="button" pendingLabel="Saving form…">
            Save form draft
          </SubmitButton>
        </MutationForm>
        <BuilderSection title="Sections" onAdd={() => add("sections")}>
          {draft.sections.map((item, index) => (
            <BuilderCard
              key={item.id}
              title={item.title}
              locked={["client", "signature"].includes(item.id)}
              onUp={() => move("sections", index, -1)}
              onDown={() => move("sections", index, 1)}
              onDelete={() => remove("sections", index)}
            >
              <input
                aria-label="Section title"
                value={item.title}
                onChange={(event) =>
                  replace("sections", index, { title: event.target.value })
                }
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled={["client", "signature"].includes(item.id)}
                  onChange={(event) =>
                    replace("sections", index, {
                      enabled: event.target.checked,
                    })
                  }
                />
                Visible
              </label>
            </BuilderCard>
          ))}
        </BuilderSection>
        <BuilderSection title="Fields" onAdd={() => add("fields")}>
          {draft.fields.map((item, index) => (
            <BuilderCard
              key={item.id}
              title={item.label}
              locked={item.system}
              onUp={() => move("fields", index, -1)}
              onDown={() => move("fields", index, 1)}
              onDelete={() => remove("fields", index)}
            >
              <input
                aria-label="Field label"
                value={item.label}
                onChange={(event) =>
                  replace("fields", index, { label: event.target.value })
                }
              />
              <input
                aria-label="Field placeholder"
                value={item.placeholder}
                placeholder="Placeholder"
                onChange={(event) =>
                  replace("fields", index, { placeholder: event.target.value })
                }
              />
              <select
                aria-label="Field type"
                value={item.type}
                onChange={(event) =>
                  replace("fields", index, { type: event.target.value })
                }
              >
                {[
                  "text",
                  "email",
                  "phone",
                  "number",
                  "textarea",
                  "select",
                  "radio",
                  "checkbox",
                  "date",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              {["select", "radio"].includes(item.type) ? (
                <input
                  aria-label="Field options"
                  value={item.options.join(", ")}
                  placeholder="Option one, Option two"
                  onChange={(event) =>
                    replace("fields", index, {
                      options: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              ) : null}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.required}
                  onChange={(event) =>
                    replace("fields", index, { required: event.target.checked })
                  }
                />
                Required
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) =>
                    replace("fields", index, { enabled: event.target.checked })
                  }
                />
                Enabled
              </label>
            </BuilderCard>
          ))}
        </BuilderSection>
        <BuilderSection title="Services" onAdd={() => add("services")}>
          {draft.services.map((item, index) => (
            <BuilderCard
              key={item.id}
              title={item.name}
              onUp={() => move("services", index, -1)}
              onDown={() => move("services", index, 1)}
              onDelete={() => remove("services", index)}
            >
              <input
                aria-label="Service name"
                value={item.name}
                onChange={(event) =>
                  replace("services", index, { name: event.target.value })
                }
              />
              <textarea
                aria-label="Service description"
                value={item.description}
                onChange={(event) =>
                  replace("services", index, {
                    description: event.target.value,
                  })
                }
              />
              <Fee
                label="Monthly"
                value={item.monthlyFee}
                onChange={(value) =>
                  replace("services", index, { monthlyFee: money(value) })
                }
              />
              <Fee
                label="Setup"
                value={item.setupFee}
                onChange={(value) =>
                  replace("services", index, { setupFee: money(value) })
                }
              />
              <Fee
                label="Per location"
                value={item.perLocationFee}
                onChange={(value) =>
                  replace("services", index, { perLocationFee: money(value) })
                }
              />
              <Fee
                label="Percentage fee"
                value={item.percentageFee}
                onChange={(value) =>
                  replace("services", index, { percentageFee: percent(value) })
                }
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    replace("services", index, { active: event.target.checked })
                  }
                />
                Active
              </label>
            </BuilderCard>
          ))}
        </BuilderSection>
        <BuilderSection title="Packages" onAdd={() => add("packages")}>
          {draft.packages.map((item, index) => (
            <BuilderCard
              key={item.id}
              title={item.name}
              onUp={() => move("packages", index, -1)}
              onDown={() => move("packages", index, 1)}
              onDelete={() => remove("packages", index)}
            >
              <input
                aria-label="Package name"
                value={item.name}
                onChange={(event) =>
                  replace("packages", index, { name: event.target.value })
                }
              />
              <textarea
                aria-label="Package description"
                value={item.description}
                onChange={(event) =>
                  replace("packages", index, {
                    description: event.target.value,
                  })
                }
              />
              <input
                aria-label="Package currency"
                maxLength={3}
                value={item.currency}
                onChange={(event) =>
                  replace("packages", index, {
                    currency: event.target.value.toUpperCase(),
                  })
                }
              />
              <Fee
                label="Monthly"
                value={item.monthlyFee}
                onChange={(value) =>
                  replace("packages", index, { monthlyFee: money(value) })
                }
              />
              <Fee
                label="Setup"
                value={item.setupFee}
                onChange={(value) =>
                  replace("packages", index, { setupFee: money(value) })
                }
              />
              <Fee
                label="Per location"
                value={item.perLocationFee}
                onChange={(value) =>
                  replace("packages", index, { perLocationFee: money(value) })
                }
              />
              <fieldset className="builder-service-picker">
                <legend>Included services</legend>
                {draft.services.map((service) => (
                  <label className="check-row" key={service.id}>
                    <input
                      type="checkbox"
                      checked={item.serviceIds.includes(service.id)}
                      onChange={(event) =>
                        replace("packages", index, {
                          serviceIds: event.target.checked
                            ? [...item.serviceIds, service.id]
                            : item.serviceIds.filter((id) => id !== service.id),
                        })
                      }
                    />
                    {service.name}
                  </label>
                ))}
              </fieldset>
              <textarea
                aria-label="Package notes"
                placeholder="Package notes"
                value={item.notes}
                onChange={(event) =>
                  replace("packages", index, { notes: event.target.value })
                }
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    replace("packages", index, { active: event.target.checked })
                  }
                />
                Active
              </label>
            </BuilderCard>
          ))}
        </BuilderSection>
        <BuilderSection title="Terms" onAdd={() => add("terms")}>
          {draft.terms.map((item, index) => (
            <BuilderCard
              key={item.id}
              title={`Term ${index + 1}`}
              onUp={() => move("terms", index, -1)}
              onDown={() => move("terms", index, 1)}
              onDelete={() => remove("terms", index)}
            >
              <textarea
                aria-label="Term text"
                value={item.text}
                onChange={(event) =>
                  replace("terms", index, { text: event.target.value })
                }
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    replace("terms", index, { active: event.target.checked })
                  }
                />
                Active
              </label>
            </BuilderCard>
          ))}
        </BuilderSection>
      </div>
      <aside className="builder-preview">
        <p className="eyebrow">LIVE DRAFT PREVIEW</p>
        <h2>{draft.title}</h2>
        <p>{draft.intro}</p>
        <div className="preview-section-index">
          {draft.sections
            .filter((item) => item.enabled)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((section) => (
              <span key={section.id}>{section.title}</span>
            ))}
        </div>
        <h3>Client information</h3>
        {draft.fields
          .filter((item) => item.enabled)
          .map((item) => (
            <label key={item.id}>
              {item.label}
              {item.required ? " *" : ""}
              <input disabled placeholder={item.placeholder} />
            </label>
          ))}
        <h3>Services</h3>
        <div>
          {draft.services
            .filter((item) => item.active)
            .map((item) => (
              <span key={item.id}>{item.name}</span>
            ))}
        </div>
        <h3>Packages</h3>
        {draft.packages
          .filter((item) => item.active)
          .map((item) => (
            <article key={item.id}>
              <strong>{item.name}</strong>
              <small>
                {item.monthlyFee == null
                  ? "Custom quote"
                  : `${item.currency} ${item.monthlyFee.toLocaleString()}/month`}
              </small>
            </article>
          ))}
      </aside>
    </div>
  );
}

function BuilderSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="builder-section">
      <header>
        <h3>{title}</h3>
        <button type="button" className="button button-small" onClick={onAdd}>
          <Plus /> Add
        </button>
      </header>
      <div>{children}</div>
    </section>
  );
}
function BuilderCard({
  title,
  locked,
  onUp,
  onDown,
  onDelete,
  children,
}: {
  title: string;
  locked?: boolean;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="builder-card">
      <header>
        <strong>{title}</strong>
        <span>
          <button type="button" onClick={onUp} aria-label={`Move ${title} up`}>
            <ArrowUp />
          </button>
          <button
            type="button"
            onClick={onDown}
            aria-label={`Move ${title} down`}
          >
            <ArrowDown />
          </button>
          {!locked ? (
            <button
              type="button"
              className="danger"
              onClick={onDelete}
              aria-label={`Delete ${title}`}
            >
              <Trash2 />
            </button>
          ) : (
            <small>System field</small>
          )}
        </span>
      </header>
      <div>{children}</div>
    </article>
  );
}
function Fee({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min="0"
        value={value ?? ""}
        placeholder="Custom quote"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
