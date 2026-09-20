"use client";

/* eslint-disable @next/next/no-img-element -- print layouts must render the exact configured external logo URL */

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { MediaField } from "@/components/media-field";
import { ReceiptBatch } from "@/components/receipt-batch";
import type { ReceiptData } from "@/components/receipt-document";
import { createBrowserPrintAdapter } from "@/lib/printing";
import { createClient } from "@/lib/supabase/client";

type Identity = {
  name: string;
  branchName: string;
  address: string;
  phone: string | null;
  logoUrl: string;
};
type Template = {
  logo_url: string | null;
  show_logo: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_tax: boolean;
  show_customer_address: boolean;
  show_payment_status: boolean;
  show_terms: boolean;
  thank_you: string;
  terms: string | null;
  footer_text: string | null;
  invoice_prefix: string;
  currency: string;
  receipt_logo_size: number;
  receipt_logo_alignment: "LEFT" | "CENTER" | "RIGHT";
  receipt_header_alignment: "LEFT" | "CENTER" | "RIGHT";
  show_branch_name: boolean;
  show_order_number: boolean;
  show_token: boolean;
  show_order_date: boolean;
  show_order_type: boolean;
  show_customer_name: boolean;
  show_customer_phone: boolean;
  show_payment_method: boolean;
};
type Print = {
  receipt_width_mm: number;
  auto_print_receipt: boolean;
  print_kitchen_ticket: boolean;
  show_prices_on_kitchen_ticket: boolean;
  receipt_footer: string;
  copies: number;
};
const printer = createBrowserPrintAdapter();
export function PrintingManager({
  businessId,
  identity,
  initialTemplate,
  initialPrint,
  assetOrigin,
}: {
  businessId: string;
  identity: Identity;
  initialTemplate: Template;
  initialPrint: Print;
  assetOrigin?: string;
}) {
  const [tab, setTab] = useState<"design" | "printer">("design");
  const [size, setSize] = useState<58 | 80 | "A4">(
    initialPrint.receipt_width_mm === 58 ? 58 : 80,
  );
  const [template, setTemplate] = useState({
    ...initialTemplate,
    business_name: identity.name,
    address: identity.address,
    phone: identity.phone ?? "",
    logo_url: initialTemplate.logo_url || identity.logoUrl,
  });
  const [print, setPrint] = useState(initialPrint);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const receipt = useMemo<ReceiptData>(
    () => ({
      businessName: identity.name,
      branchName: identity.branchName,
      businessAddress: identity.address,
      logoUrl: template.show_logo ? template.logo_url : null,
      phone: template.show_phone ? identity.phone : null,
      orderNumber: "KC-20260909-000005",
      tokenNumber: 1,
      createdAt: "2026-09-09T10:45:00.000Z",
      orderType: "DELIVERY",
      customerName: "Sample customer",
      deliveryAddress: template.show_customer_address
        ? "H-11, Islamabad"
        : undefined,
      subtotal: 2049,
      discount: 100,
      deliveryFee: 0,
      tax: 0,
      total: 1949,
      paymentMethod: "CASH",
      paymentStatus: "UNPAID",
      lines: [
        {
          name: "Chicken Fajita Pizza",
          quantity: 1,
          unitPrice: 1249,
          options: ["Size: Large + Rs 500", "Crust: Stuffed + Rs 300"],
        },
      ],
      footer:
        template.thank_you || `Thank you for ordering from ${identity.name}.`,
      footerNote: template.footer_text,
      width: size === "A4" ? 80 : size,
      design: {
        logoSize: template.receipt_logo_size,
        logoAlignment: template.receipt_logo_alignment,
        headerAlignment: template.receipt_header_alignment,
        showLogo: template.show_logo,
        showPhone: template.show_phone,
        showAddress: template.show_address,
        showTax: template.show_tax,
        showCustomerAddress: template.show_customer_address,
        showPaymentStatus: template.show_payment_status,
        showBranchName: template.show_branch_name,
        showOrderNumber: template.show_order_number,
        showOrderDate: template.show_order_date,
        showOrderType: template.show_order_type,
        showCustomerName: template.show_customer_name,
        showCustomerPhone: template.show_customer_phone,
        showPaymentMethod: template.show_payment_method,
      },
    }),
    [identity, size, template],
  );
  const save = async () => {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const [templateResult, printResult] = await Promise.all([
      supabase.from("invoice_settings").upsert({
        business_id: businessId,
        ...template,
        business_name: identity.name,
        address: identity.address,
        phone: identity.phone,
      }),
      supabase.from("print_settings").upsert({
        business_id: businessId,
        ...print,
        receipt_width_mm: size === "A4" ? print.receipt_width_mm : size,
        receipt_footer:
          template.thank_you || `Thank you for ordering from ${identity.name}.`,
      }),
    ]);
    if (templateResult.error || printResult.error)
      setMessage("Unable to save printing settings. Please try again.");
    else {
      setMessage("Invoice and printing settings saved.");
      await fetch("/api/revalidate-customer", { method: "POST" });
    }
    setBusy(false);
  };
  const test = async () => {
    document.documentElement.dataset.printKind =
      size === "A4" ? "invoice" : "customer-receipt";
    await printer.print({
      kind: size === "A4" ? "invoice" : "customer-receipt",
      paperWidth: size === "A4" ? "A4" : `${size}mm`,
      copies: print.copies,
    });
  };
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>Invoice &amp; Printing</h1>
          <p>
            Design receipts with the active branch identity and keep one clear
            printer configuration.
          </p>
        </div>
        <button className="button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
      <div className="settings-tabs no-print">
        <button
          className={tab === "design" ? "is-active" : ""}
          onClick={() => setTab("design")}
        >
          Receipt Design
        </button>
        <button
          className={tab === "printer" ? "is-active" : ""}
          onClick={() => setTab("printer")}
        >
          Printer Settings
        </button>
      </div>
      {message && (
        <p className="inline-notice no-print" role="status">
          {message}
        </p>
      )}
      {tab === "design" ? (
        <div className="printing-layout no-print">
          <section className="panel printing-controls">
            <h2>Receipt design</h2>
            <label>
              Receipt size
              <div className="segmented">
                {([80, 58, "A4"] as const).map((value) => (
                  <button
                    key={value}
                    className={size === value ? "is-active" : ""}
                    onClick={() => setSize(value)}
                  >
                    {value === "A4" ? "A4 Invoice" : `${value}mm`}
                  </button>
                ))}
              </div>
            </label>
            <div className="identity-card">
              <strong>{identity.name}</strong>
              <span>{identity.branchName}</span>
              <small>{identity.address}</small>
              <small>{identity.phone || "Phone not configured"}</small>
            </div>
            <MediaField
              value={template.logo_url ?? ""}
              onChange={(logo_url) => setTemplate({ ...template, logo_url })}
              label="Logo"
              bucket="business-logos"
              folder="receipt"
              assetOrigin={assetOrigin}
            />
            <label>
              Receipt logo size: {template.receipt_logo_size}px
              <input
                type="range"
                min="24"
                max="200"
                step="4"
                value={template.receipt_logo_size}
                onChange={(event) =>
                  setTemplate({
                    ...template,
                    receipt_logo_size: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Logo alignment
              <select
                value={template.receipt_logo_alignment}
                onChange={(event) =>
                  setTemplate({
                    ...template,
                    receipt_logo_alignment: event.target
                      .value as Template["receipt_logo_alignment"],
                  })
                }
              >
                <option value="LEFT">Left</option>
                <option value="CENTER">Center</option>
                <option value="RIGHT">Right</option>
              </select>
            </label>
            <label>
              Header alignment
              <select
                value={template.receipt_header_alignment}
                onChange={(event) =>
                  setTemplate({
                    ...template,
                    receipt_header_alignment: event.target
                      .value as Template["receipt_header_alignment"],
                  })
                }
              >
                <option value="LEFT">Left</option>
                <option value="CENTER">Center</option>
                <option value="RIGHT">Right</option>
              </select>
            </label>
            <h3>Business identity</h3>
            {[
              ["show_logo", "Show logo"],
              ["show_address", "Show address"],
              ["show_phone", "Show phone"],
              ["show_branch_name", "Show branch name"],
            ].map(([key, label]) => (
              <label className="switch-row" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(template[key as keyof typeof template])}
                  onChange={(event) =>
                    setTemplate({ ...template, [key]: event.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
            <h3>Order information &amp; pricing</h3>
            {[
              ["show_order_number", "Show order number"],
              ["show_order_date", "Show date and time"],
              ["show_order_type", "Show order type"],
              ["show_customer_name", "Show customer name"],
              ["show_customer_phone", "Show customer phone"],
              ["show_customer_address", "Show delivery address"],
              ["show_tax", "Show tax when charged"],
              ["show_payment_method", "Show payment method"],
              ["show_payment_status", "Show payment status"],
            ].map(([key, label]) => (
              <label className="switch-row" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(template[key as keyof typeof template])}
                  onChange={(event) =>
                    setTemplate({ ...template, [key]: event.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
            <p className="settings-help">
              Token number, sold items and final total always remain on the
              receipt.
            </p>
            <label>
              Receipt thank-you text
              <textarea
                value={template.thank_you}
                onChange={(event) =>
                  setTemplate({ ...template, thank_you: event.target.value })
                }
              />
            </label>
            <label>
              Optional note
              <textarea
                value={template.footer_text ?? ""}
                onChange={(event) =>
                  setTemplate({ ...template, footer_text: event.target.value })
                }
              />
            </label>
            <button
              className="button button--outline"
              onClick={() => void test()}
            >
              <Printer />
              Print test receipt
            </button>
          </section>
          <section className={`panel live-receipt-preview preview-${size}`}>
            <span className="eyebrow">LIVE PREVIEW</span>
            <div
              className="receipt-preview-paper"
              style={{
                textAlign: template.receipt_header_alignment.toLowerCase() as
                  "left" | "center" | "right",
              }}
            >
              {template.show_logo && template.logo_url && (
                <img
                  src={template.logo_url}
                  alt=""
                  style={{
                    width: `${template.receipt_logo_size}px`,
                    marginLeft:
                      template.receipt_logo_alignment === "RIGHT"
                        ? "auto"
                        : template.receipt_logo_alignment === "CENTER"
                          ? "auto"
                          : 0,
                    marginRight:
                      template.receipt_logo_alignment === "LEFT"
                        ? "auto"
                        : template.receipt_logo_alignment === "CENTER"
                          ? "auto"
                          : 0,
                  }}
                />
              )}
              <h2>{identity.name}</h2>
              {template.show_branch_name && <p>{identity.branchName}</p>}
              {template.show_address && <p>{identity.address}</p>}
              {template.show_phone && identity.phone && (
                <p>Phone: {identity.phone}</p>
              )}
              <hr />
              {template.show_order_number && <b>Order #KC-20260909-000005</b>}
              <strong>Token 001</strong>
              {(template.show_order_date || template.show_order_type) && (
                <small>
                  {template.show_order_date && "09 Sep 2026 · 03:45 PM"}
                  {template.show_order_date &&
                    template.show_order_type &&
                    " · "}
                  {template.show_order_type && "Delivery"}
                </small>
              )}
              <hr />
              <div>
                <span>
                  1 × Chicken Fajita Pizza
                  <br />
                  <small>Large · Stuffed Crust</small>
                </span>
                <b>Rs 2,049</b>
              </div>
              <hr />
              <div>
                <span>Subtotal</span>
                <b>Rs 2,049</b>
              </div>
              <div>
                <span>Discount</span>
                <b>− Rs 100</b>
              </div>
              <div className="preview-total">
                <span>TOTAL</span>
                <b>Rs 1,949</b>
              </div>
              <hr />
              <p>{template.thank_you}</p>
              {template.footer_text && <small>{template.footer_text}</small>}
            </div>
          </section>
        </div>
      ) : (
        <section className="panel print-settings-form no-print">
          <h2>Printer settings</h2>
          <label>
            Default receipt width
            <select
              value={print.receipt_width_mm}
              onChange={(event) =>
                setPrint({
                  ...print,
                  receipt_width_mm: Number(event.target.value),
                })
              }
            >
              <option value="80">80mm</option>
              <option value="58">58mm</option>
            </select>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={print.auto_print_receipt}
              onChange={(event) =>
                setPrint({ ...print, auto_print_receipt: event.target.checked })
              }
            />
            <span>Auto-open print after POS sale</span>
          </label>
          <label>
            Checkout print mode
            <select
              value={print.print_kitchen_ticket ? "BOTH" : "RECEIPT"}
              onChange={(event) =>
                setPrint({
                  ...print,
                  print_kitchen_ticket: event.target.value === "BOTH",
                })
              }
            >
              <option value="RECEIPT">Customer receipt only</option>
              <option value="BOTH">Customer receipt + kitchen ticket</option>
            </select>
            <small>
              The customer token receipt is always printed. Choose whether a
              separate kitchen ticket prints with it.
            </small>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={print.show_prices_on_kitchen_ticket}
              onChange={(event) =>
                setPrint({
                  ...print,
                  show_prices_on_kitchen_ticket: event.target.checked,
                })
              }
            />
            <span>Show prices on kitchen ticket</span>
          </label>
          <label>
            Number of copies
            <input
              type="number"
              min="1"
              max="5"
              value={print.copies}
              onChange={(event) =>
                setPrint({ ...print, copies: Number(event.target.value) })
              }
            />
          </label>
          <p className="settings-help">
            Browser/system print dialog is supported. Silent printing requires
            compatible printer middleware.
          </p>
        </section>
      )}
      <div className="printing-test-document">
        {size === "A4" ? (
          <section className="print-root invoice-test-a4">
            <h1>{identity.name}</h1>
            <p>{identity.address}</p>
            <h2>TEST INVOICE</h2>
            <p>Order KC-20260909-000005 · Token 001</p>
            <p>Total: PKR 1,949</p>
            <footer>
              {template.thank_you}
              {template.footer_text && <small>{template.footer_text}</small>}
            </footer>
          </section>
        ) : (
          <ReceiptBatch
            receipt={receipt}
            copies={print.copies}
            includeKitchen={print.print_kitchen_ticket}
            kitchenPrices={print.show_prices_on_kitchen_ticket}
          />
        )}
      </div>
    </>
  );
}
