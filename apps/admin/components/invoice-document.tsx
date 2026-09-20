import { mediaPreviewUrl } from "@/lib/media"
import { formatPkr } from "@italian-pizza/shared"
import type { Invoice } from "@/lib/invoices"

export function InvoiceDocument({ invoice, width, assetOrigin }: { assetOrigin?: string; invoice: Invoice; width: "A4" | "80mm" | "58mm" }) {
  const template = invoice.template_snapshot ?? {}
  return <article className={`invoice-document print-root invoice-${width}`}>
    <header>
      {template.show_logo && template.logo_url && /* eslint-disable-next-line @next/next/no-img-element */
        <img className="invoice-logo" src={mediaPreviewUrl(template.logo_url, assetOrigin)} alt={`${template.business_name ?? "Restaurant"} logo`}/>}
      <h1>{template.business_name ?? "Restaurant"}</h1>
      {template.show_address && template.address && <p>{template.address}</p>}
      {template.show_phone && template.phone && <p>{template.phone}</p>}
      {template.email && <p>{template.email}</p>}
      {template.show_tax && template.tax_number && <p>Tax / Registration: {template.tax_number}</p>}
    </header>
    <div className="invoice-meta"><div><h2>INVOICE {invoice.invoice_number ?? "DRAFT — number assigned on save"}</h2>{invoice.order_number && <p>Order {invoice.order_number}</p>}<strong>{invoice.customer_name || "Customer name"}</strong><p>{invoice.customer_phone} {invoice.customer_email}</p>{template.show_customer_address && <p>{invoice.billing_address}</p>}</div><div><p>Date: {invoice.invoice_date}</p>{invoice.due_date && <p>Due: {invoice.due_date}</p>}<strong>{invoice.status}</strong>{template.show_payment_status && <p>{(invoice.payment_status ?? "UNPAID").replaceAll("_", " ")}</p>}</div></div>
    <table><thead><tr><th>Qty</th><th>Description</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{invoice.lines.map((line, index) => <tr key={line.id ?? index}><td>{line.quantity}</td><td>{line.description}{(line.discount > 0 || (line.tax > 0 && template.show_tax !== false)) && <small>{line.discount > 0 && <>Discount {formatPkr(line.discount)}</>}{line.discount > 0 && line.tax > 0 && template.show_tax !== false && " · "}{line.tax > 0 && template.show_tax !== false && <>Tax {formatPkr(line.tax)}</>}</small>}</td><td>{formatPkr(line.unit_price)}</td><td>{formatPkr(line.line_total ?? Math.round(line.quantity * line.unit_price) - line.discount + line.tax)}</td></tr>)}</tbody></table>
    <dl className="invoice-totals">{[["Subtotal", invoice.subtotal ?? 0], ["Discount", -(invoice.discount ?? 0)], ["Tax", invoice.tax], ["Delivery / service", invoice.charges], ["Grand total", invoice.total ?? 0], ["Paid", invoice.paid ?? 0], ["Balance due", invoice.balance ?? invoice.total ?? 0]].filter(([label]) => label !== "Tax" || template.show_tax !== false).map(([label, value]) => <div key={label} className={label === "Grand total" ? "invoice-grand-total" : undefined}><dt>{label}</dt><dd>{formatPkr(Number(value))}</dd></div>)}</dl>
    {invoice.notes && <section><strong>Notes</strong><p>{invoice.notes}</p></section>}
    {template.show_terms && invoice.terms && <section><strong>Terms</strong><p>{invoice.terms}</p></section>}
    <footer><strong>{template.thank_you}</strong><p>{template.footer_text}</p></footer>
  </article>
}
