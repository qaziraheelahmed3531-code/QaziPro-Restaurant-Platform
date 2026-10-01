export type AppEnvironment = "development" | "staging" | "production";
export type MobileSurface = "customer" | "operations";
export type MobileRoleHint = "auto" | "admin" | "waiter" | "rider";

export type PublicEnvironmentInput = {
  environment?: string;
  surface?: string;
  roleHint?: string;
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  restaurantKey?: string;
  linkDomain?: string;
  pushEnabled?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  brandBackground?: string;
  brandText?: string;
};

const clean = (value?: string) => value?.trim() ?? "";
const localHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "10.0.2.2" ||
  hostname === "0.0.0.0";
const safeUrl = (raw: string, label: string) => {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
};
const color = (raw: string, fallback: string, name: string) => {
  const selected = raw || fallback;
  if (!/^#[0-9A-Fa-f]{6}$/.test(selected))
    throw new Error(`${name} must use a six-digit hex value`);
  return selected;
};

export function validatePublicEnvironment(input: PublicEnvironmentInput) {
  const rawEnvironment = clean(input.environment) || "development";
  if (
    !(["development", "staging", "production"] as const).includes(
      rawEnvironment as AppEnvironment,
    )
  )
    throw new Error("EXPO_PUBLIC_APP_ENV is invalid");
  const environment = rawEnvironment as AppEnvironment;
  const rawSurface = clean(input.surface) || "customer";
  if (!(rawSurface === "customer" || rawSurface === "operations"))
    throw new Error("EXPO_PUBLIC_MOBILE_SURFACE is invalid");
  const surface = rawSurface as MobileSurface;
  const rawRoleHint = clean(input.roleHint) || "auto";
  if (!(rawRoleHint === "auto" || rawRoleHint === "admin" || rawRoleHint === "waiter" || rawRoleHint === "rider"))
    throw new Error("EXPO_PUBLIC_MOBILE_ROLE_HINT is invalid");
  const roleHint = rawRoleHint as MobileRoleHint;
  const apiBaseUrl = clean(input.apiBaseUrl);
  const supabaseUrl = clean(input.supabaseUrl);
  const supabasePublishableKey = clean(input.supabasePublishableKey);
  const restaurantKey = clean(input.restaurantKey);
  const linkDomain = clean(input.linkDomain);
  if (!supabaseUrl || !supabasePublishableKey || (surface === "customer" && (!apiBaseUrl || !restaurantKey)))
    throw new Error("Mobile public environment is incomplete");
  if (/service.role|sb_secret_/i.test(supabasePublishableKey))
    throw new Error("A server credential cannot be used in the mobile app");

  const apiUrl = apiBaseUrl ? safeUrl(apiBaseUrl, "EXPO_PUBLIC_API_BASE_URL") : null;
  const authUrl = safeUrl(supabaseUrl, "EXPO_PUBLIC_SUPABASE_URL");
  if (environment !== "development") {
    if ((apiUrl && apiUrl.protocol !== "https:") || authUrl.protocol !== "https:")
      throw new Error("Staging and production mobile services must use HTTPS");
    if ((apiUrl && localHostname(apiUrl.hostname)) || localHostname(authUrl.hostname))
      throw new Error("A release build cannot use a local service URL");
    if (!linkDomain || /[:/\s]/.test(linkDomain))
      throw new Error(
        "A hostname-only link domain is required for release builds",
      );
  }
  if (
    environment === "production" &&
    ((apiUrl?.hostname.includes("staging") ?? false) ||
      authUrl.hostname.includes("staging") ||
      linkDomain.includes(".staging."))
  )
    throw new Error("Production mobile configuration cannot target staging");

  return {
    environment,
    surface,
    roleHint,
    apiBaseUrl: apiBaseUrl?.replace(/\/$/, "") ?? "",
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabasePublishableKey,
    restaurantKey,
    linkDomain,
    pushEnabled: clean(input.pushEnabled) === "true",
    debug: environment !== "production",
    brand: {
      primary: color(
        clean(input.brandPrimary),
        "#a92114",
        "Brand primary",
      ),
      secondary: color(
        clean(input.brandSecondary),
        "#e7a81a",
        "Brand secondary",
      ),
      background: color(
        clean(input.brandBackground),
        "#fff8f1",
        "Brand background",
      ),
      text: color(clean(input.brandText), "#211b18", "Brand text"),
    },
  } as const;
}
