import { env } from "@/config/env";
import type { Bootstrap } from "@/contracts/types";

export type ThemeColors = {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  border: string;
  primary: string;
  primaryDark: string;
  gold: string;
  green: string;
  danger: string;
  blue: string;
};

export const colors: ThemeColors = {
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

const validColor = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : fallback;

export function themeColors(
  branding?: Bootstrap["colors"] | null,
): ThemeColors {
  if (!branding) return colors;
  return {
    ...colors,
    primary: validColor(branding.primary, colors.primary),
    gold: validColor(branding.secondary, colors.gold),
    background: validColor(branding.background, colors.background),
    ink: validColor(branding.text, colors.ink),
  };
}
export const shadow = {
  shadowColor: "#3a2317",
  shadowOpacity: 0.09,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 7 },
  elevation: 3,
};
