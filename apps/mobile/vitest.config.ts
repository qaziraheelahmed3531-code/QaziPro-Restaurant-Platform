import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      EXPO_PUBLIC_APP_ENV: "staging",
      EXPO_PUBLIC_API_BASE_URL: "https://staging.example/api/v1",
      EXPO_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
      EXPO_PUBLIC_RESTAURANT_KEY: "restaurant-a",
    },
  },
});
