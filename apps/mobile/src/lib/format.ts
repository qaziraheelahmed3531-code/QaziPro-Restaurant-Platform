import { env } from "@/config/env";

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

export function resolveAssetUrl(value?: string | null) {
  if (!value) return "";
  if (/^(data:|https?:\/\/)/i.test(value)) return value;
  try {
    const origin = new URL(env.apiBaseUrl).origin;
    return new URL(value.startsWith("/") ? value : `/${value}`, origin).toString();
  } catch {
    return value;
  }
}
