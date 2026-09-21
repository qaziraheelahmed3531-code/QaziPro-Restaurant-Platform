export function formatMoney(value: number, currency = "PKR") {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}
