export type ThermalPaperWidth = "80mm" | "58mm"
export type PrintDocumentKind = "customer-receipt" | "kitchen-ticket" | "daily-summary" | "shift-summary" | "invoice"

export type PrintJob = {
  kind: PrintDocumentKind
  paperWidth: ThermalPaperWidth | "A4"
  copies: number
}

/**
 * Printer delivery boundary. Browser printing is the only enabled production
 * adapter. QZ Tray, PrintNode or a local WebUSB/WebSerial bridge can implement
 * this contract later without changing POS or receipt rendering.
 */
export interface PrinterAdapter {
  readonly name: string
  readonly supportsSilentPrinting: boolean
  print(job: PrintJob): Promise<void>
}

export class BrowserPrintAdapter implements PrinterAdapter {
  readonly name = "Browser / system print dialog"
  readonly supportsSilentPrinting = false

  async print(job: PrintJob) {
    if (typeof window === "undefined") throw new Error("Browser printing is only available in the browser.")
    document.documentElement.dataset.printKind = job.kind
    document.documentElement.dataset.receiptWidth = job.paperWidth
    // Wait for receipt logos/fonts, with a bounded fallback for unavailable assets.
    await Promise.race([
      Promise.all([document.fonts.ready, ...Array.from(document.querySelectorAll<HTMLImageElement>(".print-root img")).map(img => img.decode().catch(() => undefined))]),
      new Promise(resolve => window.setTimeout(resolve, 2500)),
    ])
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
    window.print()
  }
}

export function createBrowserPrintAdapter() {
  return new BrowserPrintAdapter()
}
