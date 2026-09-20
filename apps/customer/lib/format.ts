const rupeeFormatter = new Intl.NumberFormat("en-PK", {
  maximumFractionDigits: 0,
})

export function formatRupees(value: number) {
  return `Rs ${rupeeFormatter.format(value)}`
}
