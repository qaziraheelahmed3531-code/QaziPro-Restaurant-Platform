export type AppEnvironment = "development" | "staging" | "production";

export type PublicEnvironmentInput = {
  environment?: string;
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
  const apiBaseUrl = clean(input.apiBaseUrl);
  const supabaseUrl = clean(input.supabaseUrl);
  const supabasePublishableKey = clean(input.supabasePublishableKey);
  const restaurantKey = clean(input.restaurantKey);
  const linkDomain = clean(input.linkDomain);
  if (!apiBaseUrl || !supabaseUrl || !supabasePublishableKey || !restaurantKey)
    throw new Error("Mobile public environment is incomplete");
  if (/service.role|sb_secret_/i.test(supabasePublishableKey))
    throw new Error("A server credential cannot be used in the mobile app");

  const apiUrl = safeUrl(apiBaseUrl, "EXPO_PUBLIC_API_BASE_URL");
  const authUrl = safeUrl(supabaseUrl, "EXPO_PUBLIC_SUPABASE_URL");
  if (environment !== "development") {
    if (apiUrl.protocol !== "https:" || authUrl.protocol !== "https:")
      throw new Error("Staging and production mobile services must use HTTPS");
    if (localHostname(apiUrl.hostname) || localHostname(authUrl.hostname))
      throw new Error("A release build cannot use a local service URL");
    if (!linkDomain || /[:/\s]/.test(linkDomain))
      throw new Error(
        "A hostname-only link domain is required for release builds",
      );
  }
  if (
    environment === "production" &&
    (apiUrl.hostname.includes("staging") ||
      authUrl.hostname.includes("staging") ||
      linkDomain.includes(".staging."))
  )
    throw new Error("Production mobile configuration cannot target staging");

  return {
    environment,
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
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
