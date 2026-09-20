import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";
import { secureStorage } from "./storage";

export const supabase = createClient(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);
let listening = false;
export function startAuthRefresh() {
  if (listening) return () => undefined;
  listening = true;
  const subscription = AppState.addEventListener("change", (state) =>
    state === "active"
      ? supabase.auth.startAutoRefresh()
      : supabase.auth.stopAutoRefresh(),
  );
  supabase.auth.startAutoRefresh();
  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
    listening = false;
  };
}
