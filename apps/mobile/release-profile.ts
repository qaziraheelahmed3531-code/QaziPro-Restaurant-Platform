import type { ExpoConfig } from "expo/config";

export type MobileReleaseEnvironment = "development" | "staging" | "production";
export type MobileAppVariant = "customer" | "operations";

type ReleaseProfile = {
  environment: MobileReleaseEnvironment;
  variant: MobileAppVariant;
  name: string;
  slug: string;
  scheme: string;
  version: string;
  androidPackage: string;
  androidVersionCode: number;
  iosBundleIdentifier: string;
  iosBuildNumber: string;
  linkDomain: string;
  icon: string;
  adaptiveIcon: string;
  splashImage: string;
  backgroundColor: string;
  primaryColor: string;
  googleServicesFile?: string;
  easProjectId?: string;
};

type EnvironmentValues = Record<string, string | undefined>;

const value = (source: EnvironmentValues, name: string) =>
  source[name]?.trim() ?? "";
const validIdentifier = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/;
const validScheme = /^[a-z][a-z0-9+.-]*$/;
const validVersion = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const validColor = /^#[0-9A-Fa-f]{6}$/;

export function resolveReleaseProfile(
  source: EnvironmentValues = process.env,
): ReleaseProfile {
  const rawEnvironment = value(source, "EXPO_PUBLIC_APP_ENV") || "development";
  if (
    !(["development", "staging", "production"] as const).includes(
      rawEnvironment as MobileReleaseEnvironment,
    )
  )
    throw new Error(
      "EXPO_PUBLIC_APP_ENV must be development, staging or production",
    );
  const environment = rawEnvironment as MobileReleaseEnvironment;
  const rawVariant = value(source, "MOBILE_APP_VARIANT") || value(source, "EXPO_PUBLIC_MOBILE_SURFACE") || "customer";
  if (!(rawVariant === "customer" || rawVariant === "operations"))
    throw new Error("MOBILE_APP_VARIANT must be customer or operations");
  const variant = rawVariant as MobileAppVariant;
  const isProduction = environment === "production";
  const fallbackId = variant === "operations" ? "com.qazipro.operations.staging" : "com.qazipro.restaurant.staging";
  const androidPackage =
    value(source, "MOBILE_ANDROID_APPLICATION_ID") ||
    value(source, "EXPO_PUBLIC_ANDROID_APPLICATION_ID") ||
    (isProduction ? "" : fallbackId);
  const iosBundleIdentifier =
    value(source, "MOBILE_IOS_BUNDLE_ID") ||
    value(source, "EXPO_PUBLIC_IOS_BUNDLE_ID") ||
    (isProduction ? "" : fallbackId);
  if (!validIdentifier.test(androidPackage))
    throw new Error("A valid MOBILE_ANDROID_APPLICATION_ID is required");
  if (!validIdentifier.test(iosBundleIdentifier))
    throw new Error("A valid MOBILE_IOS_BUNDLE_ID is required");
  if (
    isProduction &&
    (androidPackage.endsWith(".staging") ||
      iosBundleIdentifier.endsWith(".staging"))
  )
    throw new Error("Production builds cannot use staging identifiers");

  const version = value(source, "MOBILE_APP_VERSION") || "0.1.0";
  const versionCode = Number(
    value(source, "MOBILE_ANDROID_VERSION_CODE") || "1",
  );
  const buildNumber = value(source, "MOBILE_IOS_BUILD_NUMBER") || "1";
  if (!validVersion.test(version))
    throw new Error("MOBILE_APP_VERSION is invalid");
  if (!Number.isSafeInteger(versionCode) || versionCode < 1)
    throw new Error("MOBILE_ANDROID_VERSION_CODE must be a positive integer");
  if (!/^\d+$/.test(buildNumber) || Number(buildNumber) < 1)
    throw new Error("MOBILE_IOS_BUILD_NUMBER must be a positive integer");

  const scheme = value(source, "MOBILE_APP_SCHEME") || (variant === "operations" ? "qazipro-ops" : "qazipro-restaurant");
  if (!validScheme.test(scheme))
    throw new Error("MOBILE_APP_SCHEME is invalid");
  const linkDomain =
    value(source, "MOBILE_LINK_DOMAIN") ||
    value(source, "EXPO_PUBLIC_LINK_DOMAIN") ||
    (isProduction ? "" : "restaurant-a.staging.qazipro.com");
  if (!linkDomain || /[:/\s]/.test(linkDomain))
    throw new Error("A hostname-only MOBILE_LINK_DOMAIN is required");
  if (isProduction && linkDomain.includes(".staging."))
    throw new Error("Production builds cannot use a staging link domain");

  const backgroundColor =
    value(source, "MOBILE_BRAND_BACKGROUND_COLOR") || "#fff8f1";
  const primaryColor =
    value(source, "MOBILE_BRAND_PRIMARY_COLOR") || "#a92114";
  if (!validColor.test(backgroundColor) || !validColor.test(primaryColor))
    throw new Error("Mobile brand colors must use six-digit hex values");

  return {
    environment,
    variant,
    name:
      value(source, "MOBILE_APP_NAME") ||
      (variant === "operations"
        ? environment === "production" ? "QaziPro Operations" : environment === "staging" ? "QaziPro Operations Staging" : "QaziPro Operations Dev"
        : environment === "production"
        ? "QaziPro Restaurant"
        : environment === "staging"
          ? "QaziPro Restaurant Staging"
          : "QaziPro Restaurant Dev"),
    slug:
      value(source, "MOBILE_APP_SLUG") || (variant === "operations" ? "qazipro-operations" : "qazipro-restaurant-customer"),
    scheme,
    version,
    androidPackage,
    androidVersionCode: versionCode,
    iosBundleIdentifier,
    iosBuildNumber: buildNumber,
    linkDomain,
    icon:
      value(source, "MOBILE_ICON_PATH") ||
      "../customer/public/qazipro-logo.png",
    adaptiveIcon:
      value(source, "MOBILE_ADAPTIVE_ICON_PATH") ||
      "../customer/public/qazipro-logo.png",
    splashImage:
      value(source, "MOBILE_SPLASH_IMAGE_PATH") ||
      "../customer/public/qazipro-logo.png",
    backgroundColor,
    primaryColor,
    googleServicesFile:
      value(source, "MOBILE_GOOGLE_SERVICES_FILE") || undefined,
    easProjectId: value(source, "EAS_PROJECT_ID") || undefined,
  };
}

export function createExpoConfig(
  source: EnvironmentValues = process.env,
): ExpoConfig {
  const profile = resolveReleaseProfile(source);
  return {
    name: profile.name,
    slug: profile.slug,
    version: profile.version,
    orientation: "portrait",
    icon: profile.icon,
    scheme: profile.scheme,
    userInterfaceStyle: "light",
    runtimeVersion: { policy: "appVersion" },
    experiments: { typedRoutes: true },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-notifications",
        { color: profile.primaryColor, defaultChannel: "orders" },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            profile.variant === "operations"
              ? "Allow QaziPro Operations to use your location while handling an assigned delivery."
              : "Allow this restaurant app to use your location for delivery validation.",
        },
      ],
      [
        "expo-splash-screen",
        {
          image: profile.splashImage,
          imageWidth: 220,
          resizeMode: "contain",
          backgroundColor: profile.backgroundColor,
          dark: {
            image: profile.splashImage,
            backgroundColor: profile.backgroundColor,
          },
        },
      ],
    ],
    android: {
      package: profile.androidPackage,
      versionCode: profile.androidVersionCode,
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
      ],
      adaptiveIcon: {
        foregroundImage: profile.adaptiveIcon,
        backgroundColor: profile.backgroundColor,
      },
      ...(profile.googleServicesFile
        ? { googleServicesFile: profile.googleServicesFile }
        : {}),
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: profile.linkDomain,
              pathPrefix: "/app",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    ios: {
      bundleIdentifier: profile.iosBundleIdentifier,
      buildNumber: profile.iosBuildNumber,
      supportsTablet: true,
      config: { usesNonExemptEncryption: false },
      associatedDomains: [`applinks:${profile.linkDomain}`],
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          profile.variant === "operations"
            ? "Your location is used only while you handle an assigned delivery."
            : "Your location is used only when you ask us to validate restaurant delivery availability.",
      },
    },
    extra: {
      environment: profile.environment,
      surface: profile.variant,
      release: {
        androidPackage: profile.androidPackage,
        iosBundleIdentifier: profile.iosBundleIdentifier,
        version: profile.version,
      },
      router: { origin: false },
      ...(profile.easProjectId
        ? { eas: { projectId: profile.easProjectId } }
        : {}),
    },
  };
}
