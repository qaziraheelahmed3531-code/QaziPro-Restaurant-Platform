import { useEffect } from "react";
import { AppState, Platform, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/state/AppProvider";
import { OperationsProvider } from "@/operations/OperationsProvider";
import { OpsButton, OpsScreen } from "@/operations/ui";
import { parseDeepLink } from "@/domain/deep-links";
import { supabase } from "@/lib/supabase";
import { env } from "@/config/env";
import { Button, Screen } from "@/ui/components";
import { themeColors } from "@/ui/theme";

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
    const notification =
      Platform.OS === "web"
        ? null
        : Notifications.addNotificationResponseReceivedListener((event) => {
            const orderNumber =
              event.notification.request.content.data?.orderNumber;
            if (typeof orderNumber === "string") {
              const link = parseDeepLink(
                `qazipro-restaurant://orders/${orderNumber}`,
              );
              if (link.kind === "order")
                router.push(`/order/${link.orderNumber}`);
            }
          });
    return () => {
      linking.remove();
      notification?.remove();
    };
  }, [router]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", () => undefined);
    return () => listener.remove();
  }, []);
  return null;
}
function AppStack() {
  const palette = themeColors(useApp().bootstrap?.colors);
  return (
    <>
      <StatusBar style="dark" />
      <LinkHandler />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerTintColor: palette.primary,
          headerStyle: { backgroundColor: palette.background },
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
    </>
  );
}
function OperationsStack() {
  return (
    <OperationsProvider>
      <StatusBar style="dark" />
      <OperationsLinkHandler />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="ops/index" />
        <Stack.Screen name="ops/login" />
        <Stack.Screen name="ops/admin" />
        <Stack.Screen name="ops/waiter" />
        <Stack.Screen name="ops/rider" />
      </Stack>
    </OperationsProvider>
  );
}
function OperationsLinkHandler() {
  const router = useRouter();
  useEffect(() => {
    const open = (screen: unknown) => {
      if (screen === "admin") router.replace("/ops/admin" as never);
      else if (screen === "waiter") router.replace("/ops/waiter" as never);
      else if (screen === "rider") router.replace("/ops/rider" as never);
      else router.replace("/ops" as never);
    };
    const handleUrl = (raw: string | null) => {
      if (!raw) return;
      const parsed = Linking.parse(raw);
      const segment = parsed.path?.split("/").filter(Boolean)[0];
      open(segment);
    };
    void Linking.getInitialURL().then(handleUrl);
    if (Platform.OS !== "web")
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response) open(response.notification.request.content.data?.screen);
      });
    const link = Linking.addEventListener("url", (event) => handleUrl(event.url));
    const notification =
      Platform.OS === "web"
        ? null
        : Notifications.addNotificationResponseReceivedListener((event) =>
            open(event.notification.request.content.data?.screen),
          );
    return () => { link.remove(); notification?.remove(); };
  }, [router]);
  return null;
}
export default function Layout() {
  if (env.surface === "operations") return <OperationsStack />;
  return (
    <AppProvider>
      <AppStack />
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
  if (env.surface === "operations") {
    return (
      <OperationsProvider>
        <OpsScreen scroll={false}><View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "800" }}>Operations could not open</Text><Text>Your saved local work has not been cleared.</Text><OpsButton title="Try again" onPress={retry} />{env.debug ? <Text selectable>{error.message}</Text> : null}</View></OpsScreen>
      </OperationsProvider>
    );
  }
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
