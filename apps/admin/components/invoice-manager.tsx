"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPkr } from "@italian-pizza/shared";
import { createClient } from "@/lib/supabase/client";
import { createBrowserPrintAdapter } from "@/lib/printing";
import { adminError } from "@/lib/admin-errors";
import {
  invoiceDraft,
  invoiceTotals,
  type Invoice,
  type InvoiceTemplate,
} from "@/lib/invoices";
import { InvoiceDocument } from "@/components/invoice-document";

export function InvoiceManager({
  businessId,
  branches,
  template,
  canCreate,
  canEdit,
  initialOrder,
  assetOrigin,
}: {
  assetOrigin?: string;
  businessId: string;
  branches: Array<{ id: string; name: string }>;
  template: InvoiceTemplate;
  canCreate: boolean;
  canEdit: boolean;
  initialOrder?: string;
}) {
  const paymentAttempt = useRef<{ key: string; reference: string } | null>(
    null,
  );
  const printAfterSave = useRef(false);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<"order" | "manual">("order");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [width, setWidth] = useState<"A4" | "80mm" | "58mm">("A4");
  const [payment, setPayment] = useState({ amount: "", method: "CASH" });
  const visibleRows=rows.filter(row=>kind==="order"?Boolean(row.order_id):!row.order_id);
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("invoice_list", {
      p_business_id: businessId,
      p_search: query,
      p_status: status,
      p_from: from || null,
      p_to: to || null,
      p_offset: page * 50,
    });
    if (error)
      setMessage(
        adminError(
          error,
          "Could not load invoices. Check database migrations and retry.",
        ),
      );
    else setRows(data ?? []);
  }, [businessId, query, status, from, to, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  async function open(id: string) {
    const { data, error } = await createClient().rpc("invoice_document", {
      p_id: id,
    });
    if (error) setMessage(adminError(error, "Could not load this invoice."));
    else {
      setInvoice(data);
      setDraft(null);
    }
  }
  async function action(
    command: () => PromiseLike<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>,
    success: string,
    shouldPrint = false,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await command();
      if (error) {
        setMessage(adminError(error));
        return;
      }
      if (typeof data === "string") {
        printAfterSave.current = shouldPrint;
        await open(data);
      }
      setMessage(success);
      await load();
    } catch {
      setMessage(
        "Connection interrupted. Refresh before retrying to avoid duplicate records.",
      );
    } finally {
      setBusy(false);
    }
  }
  const createOrder = () =>
    action(
      () =>
        createClient().rpc("save_invoice", {
          p_business_id: businessId,
          p_draft: {},
          p_order_id: initialOrder,
        }),
      "Order invoice opened using authoritative order data.",
    );
  const preview = draft
    ? {
        ...draft,
        ...invoiceTotals(draft.lines, draft.discount, draft.tax, draft.charges),
        paid: 0,
        balance: undefined,
        template_snapshot: template,
      }
    : invoice;
  function newInvoice() {
    if (draft && !window.confirm("Discard unsaved invoice changes?")) return;
    setInvoice(null);
    setDraft({
      client_reference: crypto.randomUUID(),
      invoice_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Karachi",
      }).format(new Date()),
      due_date: "",
      branch_id: branches[0]?.id ?? "",
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      billing_address: "",
      status: "DRAFT",
      discount: 0,
      tax: 0,
      charges: 0,
      notes: "",
      terms: template.terms ?? "",
      lines: [
        { description: "", quantity: 1, unit_price: 0, discount: 0, tax: 0 },
      ],
    });
  }
  const print = useCallback(async () => {
    // Wait for actual logo decoding, never a guessed render delay.
    const logo = document.querySelector<HTMLImageElement>(
      ".invoice-document .invoice-logo",
    );
    if (logo) await logo.decode().catch(() => undefined);
    await createBrowserPrintAdapter().print({
      kind: "invoice",
      paperWidth: width,
      copies: 1,
    });
  }, [width]);
  useEffect(() => {
    if (!invoice || !printAfterSave.current) return;
    printAfterSave.current = false;
    const frame = window.requestAnimationFrame(() => void print());
    return () => window.cancelAnimationFrame(frame);
  }, [invoice, print]);
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <h1>Invoices</h1>
          <p>View invoices created from orders or create a manual invoice for catering and offline customers.</p>
        </div>
        {canCreate && (
          <button className="button" disabled={busy} onClick={newInvoice}>
            New manual invoice
          </button>
        )}
      </div>
      {initialOrder && canCreate && (
        <div className="panel no-print">
          <p>Create or open the invoice for the selected order.</p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void createOrder()}
          >
            Create / view order invoice
          </button>
        </div>
      )}
      <div className="settings-tabs no-print" aria-label="Invoice type"><button className={kind==="order"?"is-active":""} onClick={()=>setKind("order")}>Order invoices</button><button className={kind==="manual"?"is-active":""} onClick={()=>setKind("manual")}>Manual invoices</button></div>
      <div className="resource-toolbar invoice-filters no-print">
        <input
          aria-label="Search invoices"
          placeholder="Invoice, order or customer"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Invoice status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          {[
            "DRAFT",
            "FINALIZED",
            "VOID",
            "UNPAID",
            "PARTIALLY_PAID",
            "PAID",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <div className="data-table-wrap no-print">
        <table className="data-table">
          <thead>
            <tr>
              {[
                "Invoice / order",
                "Customer",
                "Date",
                "Total",
                "Paid",
                "Balance",
                "Status",
                "",
              ].map((label, i) => (
                <th key={i}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.slice(0, 50).map((row) => (
              <tr key={row.id}>
                <td>
                  {row.invoice_number}
                  <br />
                  {row.order_number}
                </td>
                <td>{row.customer_name}</td>
                <td>{row.invoice_date}</td>
                <td>{formatPkr(row.total ?? 0)}</td>
                <td>{formatPkr(row.paid ?? 0)}</td>
                <td>{formatPkr(row.balance ?? 0)}</td>
                <td>
                  {row.status}
                  <br />
                  {row.payment_status}
                </td>
                <td>
                  <button
                    className="button button--outline"
                    onClick={() => {
                      if (
                        !draft ||
                        window.confirm("Discard unsaved invoice changes?")
                      )
                        void open(row.id!);
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="heading-actions section-gap no-print">
        <button
          className="button button--outline"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button
          className="button button--outline"
          disabled={rows.length < 51}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
        <button className="button button--outline" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <p className="inline-notice no-print" role="status">
        {message}
      </p>
      {draft && (<div className="drawer-backdrop invoice-drawer">
        <form
          className="editor invoice-manual-editor no-print"
          onSubmit={(e) => {
            e.preventDefault();
            const submitter = (e.nativeEvent as SubmitEvent)
              .submitter as HTMLButtonElement | null;
            void action(
              () =>
                createClient().rpc("save_invoice", {
                  p_business_id: businessId,
                  p_id: draft.id ?? null,
                  p_draft: draft,
                }),
              "Invoice draft saved.",
              submitter?.value === "save-print",
            );
          }}
        >
          <header><div><span className="eyebrow">MANUAL BILLING</span><h2>{draft.id ? "Edit draft" : "New manual invoice"}</h2></div><button type="button" className="icon-action" aria-label="Close" onClick={()=>setDraft(null)}>×</button></header><div className="invoice-manual-body">
          <div className="editor-form">
            <label>
              Branch
              <select
                required
                value={draft.branch_id}
                onChange={(e) =>
                  setDraft({ ...draft, branch_id: e.target.value })
                }
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["customer_name", "Customer name", "text"],
                ["customer_phone", "Phone", "tel"],
                ["customer_email", "Email (optional)", "email"],
                ["invoice_date", "Invoice date", "date"],
                ["due_date", "Due date (optional)", "date"],
                ["billing_address", "Billing address (optional)", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type}
                  required={key === "customer_name" || key === "invoice_date"}
                  value={draft[key] ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <p>Line discounts and taxes are amounts, not percentages.</p>
          <div className="invoice-line-editor">
            {draft.lines.map((line, i) => (
              <fieldset key={i}>
                <legend>Item {i + 1}</legend>
                <label>
                  Description
                  <input
                    required
                    maxLength={1000}
                    value={line.description}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lines: draft.lines.map((v, n) =>
                          n === i ? { ...v, description: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                {(["quantity", "unit_price", "discount", "tax"] as const).map(
                  (key) => (
                    <label key={key}>
                      {key.replaceAll("_", " ")}
                      <input
                        type="number"
                        required
                        step={key === "quantity" ? ".001" : "1"}
                        min={key === "quantity" ? ".001" : "0"}
                        value={line[key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.map((v, n) =>
                              n === i
                                ? { ...v, [key]: Number(e.target.value) }
                                : v,
                            ),
                          })
                        }
                      />
                    </label>
                  ),
                )}
                <button
                  type="button"
                  className="button button--outline"
                  disabled={draft.lines.length === 1}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      lines: draft.lines.filter((_, n) => n !== i),
                    })
                  }
                >
                  Remove item
                </button>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            className="button button--outline"
            disabled={draft.lines.length >= 100}
            onClick={() =>
              setDraft({
                ...draft,
                lines: [
                  ...draft.lines,
                  {
                    description: "",
                    quantity: 1,
                    unit_price: 0,
                    discount: 0,
                    tax: 0,
                  },
                ],
              })
            }
          >
            Add item
          </button>
          <div className="editor-form">
            {(["discount", "tax", "charges"] as const).map((key) => (
              <label key={key}>
                {key === "charges"
                  ? "Delivery / service charges"
                  : `Additional ${key}`}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            {(["notes", "terms"] as const).map((key) => (
              <label key={key} className="is-wide">
                {key}
                <textarea
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
          <div className="heading-actions">
            <button className="button" value="save" disabled={busy}>
              Save invoice
            </button>
            <button
              className="button button--outline"
              value="save-print"
              disabled={busy}
            >
              Save &amp; print
            </button>
            <button
              type="button"
              className="button button--outline"
              onClick={() => {
                if (window.confirm("Discard unsaved invoice changes?"))
                  setDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
          </div></form></div>
      )}
      {preview && (
        <section className="invoice-preview section-gap">
          <div className="panel no-print">
            <h2>{draft ? "Live preview" : preview.invoice_number}</h2>
            <div className="heading-actions">
              <label>
                Paper
                <select
                  value={width}
                  onChange={(e) => setWidth(e.target.value as typeof width)}
                >
                  <option>A4</option>
                  <option>80mm</option>
                  <option>58mm</option>
                </select>
              </label>
              <button className="button" onClick={() => void print()}>
                Print / Save PDF
              </button>
              {!draft && invoice && canEdit && (
                <>
                  {invoice.status === "DRAFT" && (
                    <>
                      <button
                        className="button button--outline"
                        onClick={() => setDraft(invoiceDraft(invoice))}
                      >
                        Edit draft
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              createClient().rpc("transition_invoice", {
                                p_id: invoice.id,
                                p_action: "FINALIZE",
                              }),
                            "Invoice finalized. Accounting fields are locked.",
                          )
                        }
                      >
                        Finalize
                      </button>
                    </>
                  )}
                  {invoice.status !== "VOID" && (
                    <button
                      className="button button--outline"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(
                          "Why is this invoice being voided?",
                        );
                        if (reason)
                          void action(
                            () =>
                              createClient().rpc("transition_invoice", {
                                p_id: invoice.id,
                                p_action: "VOID",
                                p_reason: reason,
                              }),
                            "Invoice voided.",
                          );
                      }}
                    >
                      Void
                    </button>
                  )}
                  {invoice.status === "VOID" && canCreate && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () =>
                            createClient().rpc("transition_invoice", {
                              p_id: invoice.id,
                              p_action: "REISSUE",
                            }),
                          "Replacement invoice created.",
                        )
                      }
                    >
                      Reissue
                    </button>
                  )}
                </>
              )}
            </div>
            <p>
              Choose the matching printer paper size in the system dialog. Save
              as PDF is available there. Silent printing is not enabled.
            </p>
            {!draft &&
              invoice?.status === "FINALIZED" &&
              !invoice.order_id &&
              canEdit &&
              (invoice.balance ?? 0) > 0 && (
                <form
                  className="invoice-payment"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const key = JSON.stringify([
                      invoice.id,
                      payment.amount,
                      payment.method,
                    ]);
                    if (paymentAttempt.current?.key !== key)
                      paymentAttempt.current = {
                        key,
                        reference: crypto.randomUUID(),
                      };
                    const reference = paymentAttempt.current.reference;
                    void action(async () => {
                      const result = await createClient().rpc(
                        "record_invoice_payment",
                        {
                          p_id: invoice.id,
                          p_amount: Number(payment.amount),
                          p_method: payment.method,
                          p_reference: reference,
                        },
                      );
                      if (!result.error) paymentAttempt.current = null;
                      return {
                        ...result,
                        data: result.error ? null : invoice.id,
                      };
                    }, "Payment recorded in the existing ledger.");
                  }}
                >
                  <label>
                    Paid amount
                    <input
                      type="number"
                      min="1"
                      max={invoice.balance}
                      step="1"
                      required
                      value={payment.amount}
                      onChange={(e) =>
                        setPayment({ ...payment, amount: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Payment method
                    <select
                      value={payment.method}
                      onChange={(e) =>
                        setPayment({ ...payment, method: e.target.value })
                      }
                    >
                      {["CASH", "BANK_TRANSFER", "CARD"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  <button className="button" disabled={busy}>
                    Record received payment
                  </button>
                  <small>
                    Record only money actually received. Cash requires your open
                    branch register.
                  </small>
                </form>
              )}
          </div>
          <InvoiceDocument
            invoice={preview}
            width={width}
            assetOrigin={assetOrigin}
          />
        </section>
      )}
    </>
  );
}
