type ScrollDriver = (top: number) => void
let driver: ScrollDriver | null = null

// Presentation only; never holds restaurant/customer data.
export function registerScrollDriver(next: ScrollDriver) {
  driver = next
  return () => { if (driver === next) driver = null }
}
export function scrollWindowTo(top: number, reduced = false) {
  if (driver && !reduced) driver(top)
  else window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" })
}
