import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "@/state/AppProvider";
import { parseDeepLink } from "@/domain/deep-links";
import { supabase } from "@/lib/supabase";
import { env } from "@/config/env";
import { Button, Screen } from "@/ui/components";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function LinkHandler() {
  const router = useRouter();
  useEffect(() => {
    const handle = async (value: string | null) => {
      if (!value) return;
      const link = parseDeepLink(value, env.linkDomain || undefined);
      if (link.kind === "order") router.push(`/order/${link.orderNumber}`);
      if (link.kind === "auth") {
        if (link.code) await supabase.auth.exchangeCodeForSession(link.code);
        else if (link.accessToken && link.refreshToken)
          await supabase.auth.setSession({
            access_token: link.accessToken,
            refresh_token: link.refreshToken,
          });
        router.replace(
          link.type === "recovery" ? "/auth/reset" : "/(tabs)/account",
        );
      }
    };
    void Linking.getInitialURL().then(handle);
    const linking = Linking.addEventListener(
      "url",
      (event) => void handle(event.url),
    );
    const notification = Notifications.addNotificationResponseReceivedListener(
      (event) => {
        const orderNumber =
          event.notification.request.content.data?.orderNumber;
        if (typeof orderNumber === "string") {
          const link = parseDeepLink(
            `qazipro-restaurant://orders/${orderNumber}`,
          );
          if (link.kind === "order") router.push(`/order/${link.orderNumber}`);
        }
      },
    );
    return () => {
      linking.remove();
      notification.remove();
    };
  }, [router]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", () => undefined);
    return () => listener.remove();
  }, []);
  return null;
}
export default function Layout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <LinkHandler />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerTintColor: "#a92114",
          headerStyle: { backgroundColor: "#fff8f1" },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="branch"
          options={{ title: "Choose branch", presentation: "modal" }}
        />
        <Stack.Screen
          name="product/[id]"
          options={{ title: "Customize item" }}
        />
        <Stack.Screen name="cart" options={{ title: "Your cart" }} />
        <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
        <Stack.Screen name="order/[id]" options={{ title: "Order details" }} />
        <Stack.Screen name="auth/index" options={{ title: "Sign in" }} />
        <Stack.Screen
          name="auth/reset"
          options={{ title: "Set new password" }}
        />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
        <Stack.Screen
          name="addresses"
          options={{ title: "Delivery addresses" }}
        />
        <Stack.Screen name="rewards" options={{ title: "Rewards" }} />
        <Stack.Screen name="favourites" options={{ title: "Favourites" }} />
      </Stack>
    </AppProvider>
  );
}

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <AppProvider>
      <Screen>
        <View
          style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}
        >
          <Text
            accessibilityRole="header"
            style={{ fontSize: 24, fontWeight: "800" }}
          >
            Something went wrong
          </Text>
          <Text>
            The app could not display this screen safely. Your cart has not
            been cleared.
          </Text>
          <Button title="Try again" onPress={retry} />
          {env.debug ? <Text selectable>{error.message}</Text> : null}
        </View>
      </Screen>
    </AppProvider>
  );
}
