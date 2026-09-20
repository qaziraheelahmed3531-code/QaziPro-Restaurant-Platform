export type InvoiceLine = { id?: string; description: string; quantity: number; unit_price: number; discount: number; tax: number; line_total?: number }
export type InvoiceTemplate = { logo_url?: string; business_name?: string; address?: string; phone?: string; email?: string; tax_number?: string; show_logo?: boolean; show_address?: boolean; show_phone?: boolean; show_tax?: boolean; show_customer_address?: boolean; show_payment_status?: boolean; show_terms?: boolean; thank_you?: string; terms?: string; footer_text?: string; currency?: string }
export type Invoice = { id?: string; client_reference?: string; invoice_number?: string; invoice_date: string; due_date?: string; branch_id: string; order_id?: string; order_number?: string; customer_name: string; customer_phone: string; customer_email: string; billing_address: string; status: string; subtotal?: number; discount: number; tax: number; charges: number; total?: number; paid?: number; balance?: number; payment_status?: string; notes: string; terms: string; lines: InvoiceLine[]; template_snapshot?: InvoiceTemplate; payments?: Array<{ id: string; amount: number; method: string; status: string; created_at: string }> }

/** Existing order/payment ledger uses whole PKR. Round each extended line once. */
export function invoiceTotals(lines: InvoiceLine[], discount = 0, tax = 0, charges = 0) {
  const subtotal = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price), 0)
  const discounts = discount + lines.reduce((sum, line) => sum + line.discount, 0)
  const taxes = tax + lines.reduce((sum, line) => sum + line.tax, 0)
  return { subtotal, discount: discounts, tax: taxes, charges, total: subtotal - discounts + taxes + charges }
}
export function invoiceDraft(inv: Invoice): Invoice {
  return { ...inv, discount: inv.discount - inv.lines.reduce((sum, line) => sum + line.discount, 0), tax: inv.tax - inv.lines.reduce((sum, line) => sum + line.tax, 0) }
}
