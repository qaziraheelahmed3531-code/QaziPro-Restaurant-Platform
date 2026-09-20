export type AppEnvironment = "development" | "staging" | "production";

const read = (name: string) => process.env[name]?.trim() ?? "";
const environment = (read("EXPO_PUBLIC_APP_ENV") ||
  "development") as AppEnvironment;
if (!["development", "staging", "production"].includes(environment))
  throw new Error("EXPO_PUBLIC_APP_ENV is invalid");

const apiBaseUrl = read("EXPO_PUBLIC_API_BASE_URL");
const supabaseUrl = read("EXPO_PUBLIC_SUPABASE_URL");
const supabasePublishableKey = read("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const restaurantKey = read("EXPO_PUBLIC_RESTAURANT_KEY");
if (!apiBaseUrl || !supabaseUrl || !supabasePublishableKey || !restaurantKey)
  throw new Error("Mobile public environment is incomplete");
if (/service.role|sb_secret_/i.test(supabasePublishableKey))
  throw new Error("A server credential cannot be used in the mobile app");
if (environment === "production" && !apiBaseUrl.startsWith("https://"))
  throw new Error("Production mobile API must use HTTPS");

export const env = {
  environment,
  apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
  supabaseUrl,
  supabasePublishableKey,
  restaurantKey,
  linkDomain: read("EXPO_PUBLIC_LINK_DOMAIN"),
  pushEnabled: read("EXPO_PUBLIC_ENABLE_PUSH") === "true",
  debug: environment !== "production",
} as const;
