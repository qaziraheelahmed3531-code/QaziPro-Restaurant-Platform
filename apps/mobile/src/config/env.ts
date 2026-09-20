import { validatePublicEnvironment } from "./public-environment";

// Expo guarantees native bundle substitution for direct dot-notation
// EXPO_PUBLIC_* reads. Keep these reads explicit and validation centralized.
export const env = validatePublicEnvironment({
  environment: process.env.EXPO_PUBLIC_APP_ENV,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  restaurantKey: process.env.EXPO_PUBLIC_RESTAURANT_KEY,
  linkDomain: process.env.EXPO_PUBLIC_LINK_DOMAIN,
  pushEnabled: process.env.EXPO_PUBLIC_ENABLE_PUSH,
  brandPrimary: process.env.EXPO_PUBLIC_BRAND_PRIMARY,
  brandSecondary: process.env.EXPO_PUBLIC_BRAND_SECONDARY,
  brandBackground: process.env.EXPO_PUBLIC_BRAND_BACKGROUND,
  brandText: process.env.EXPO_PUBLIC_BRAND_TEXT,
});
