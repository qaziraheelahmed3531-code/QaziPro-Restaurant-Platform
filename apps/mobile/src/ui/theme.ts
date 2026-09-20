import { env } from "@/config/env";

export const colors = {
  background: env.brand.background,
  surface: "#ffffff",
  ink: env.brand.text,
  muted: "#726861",
  border: "#eadfd6",
  primary: env.brand.primary,
  primaryDark: "#7f180f",
  gold: env.brand.secondary,
  green: "#237a42",
  danger: "#ba1a1a",
  blue: "#2563eb",
};
export const shadow = {
  shadowColor: "#3a2317",
  shadowOpacity: 0.09,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 7 },
  elevation: 3,
};
