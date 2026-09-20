import type { ExpoConfig } from "expo/config";

const env = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const androidId =
  process.env.EXPO_PUBLIC_ANDROID_APPLICATION_ID ??
  "com.qazipro.restaurant.staging";
const iosId =
  process.env.EXPO_PUBLIC_IOS_BUNDLE_ID ?? "com.qazipro.restaurant.staging";
const linkDomain =
  process.env.EXPO_PUBLIC_LINK_DOMAIN ?? "restaurant-a.staging.qazipro.com";

const config: ExpoConfig = {
  name: "QaziPro Restaurant",
  slug: "qazipro-restaurant-customer",
  version: "0.1.0",
  orientation: "portrait",
  icon: "../customer/public/qazipro-logo.png",
  scheme: "qazipro-restaurant",
  userInterfaceStyle: "light",
  experiments: { typedRoutes: true },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow this restaurant app to use your location for delivery validation.",
      },
    ],
  ],
  android: {
    package: androidId,
    adaptiveIcon: {
      foregroundImage: "../customer/public/qazipro-logo.png",
      backgroundColor: "#fff8f1",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: linkDomain, pathPrefix: "/app" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  ios: {
    bundleIdentifier: iosId,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    associatedDomains: [`applinks:${linkDomain}`],
  },
  extra: { environment: env, router: { origin: false } },
};
export default config;
