import { describe, expect, it } from "vitest";
import { createExpoConfig, resolveReleaseProfile } from "./release-profile";

describe("mobile release profile", () => {
  it("uses the approved shared-code staging identity", () => {
    const profile = resolveReleaseProfile({ EXPO_PUBLIC_APP_ENV: "staging" });
    expect(profile).toMatchObject({
      name: "QaziPro Restaurant Staging",
      androidPackage: "com.qazipro.restaurant.staging",
      iosBundleIdentifier: "com.qazipro.restaurant.staging",
      version: "0.1.0",
      androidVersionCode: 1,
      iosBuildNumber: "1",
    });
  });

  it("accepts a restaurant-specific white-label identity", () => {
    const profile = resolveReleaseProfile({
      EXPO_PUBLIC_APP_ENV: "production",
      MOBILE_APP_NAME: "Restaurant One",
      MOBILE_ANDROID_APPLICATION_ID: "com.qazipro.restaurantone",
      MOBILE_IOS_BUNDLE_ID: "com.qazipro.restaurantone",
      MOBILE_LINK_DOMAIN: "order.restaurantone.example",
    });
    expect(profile.name).toBe("Restaurant One");
    expect(profile.androidPackage).toBe("com.qazipro.restaurantone");
  });

  it("uses a separate universal operations identity", () => {
    const profile = resolveReleaseProfile({ EXPO_PUBLIC_APP_ENV: "staging", MOBILE_APP_VARIANT: "operations" });
    expect(profile).toMatchObject({
      variant: "operations",
      name: "QaziPro Operations Staging",
      slug: "qazipro-operations",
      scheme: "qazipro-ops",
      androidPackage: "com.qazipro.operations.staging",
      iosBundleIdentifier: "com.qazipro.operations.staging",
    });
  });

  it("uses delivery-specific permission copy for the operations app", () => {
    const config = createExpoConfig({
      EXPO_PUBLIC_APP_ENV: "staging",
      MOBILE_APP_VARIANT: "operations",
    });
    expect(config.ios?.infoPlist?.NSLocationWhenInUseUsageDescription).toMatch(
      /assigned delivery/i,
    );
  });

  it("links EAS only when an explicit project id is configured", () => {
    const withoutProject = createExpoConfig({
      EXPO_PUBLIC_APP_ENV: "staging",
      MOBILE_APP_VARIANT: "operations",
    });
    expect(withoutProject.extra?.eas).toBeUndefined();
    const withProject = createExpoConfig({
      EXPO_PUBLIC_APP_ENV: "staging",
      MOBILE_APP_VARIANT: "operations",
      EAS_PROJECT_ID: "11111111-2222-3333-4444-555555555555",
    });
    expect(withProject.extra?.eas).toEqual({
      projectId: "11111111-2222-3333-4444-555555555555",
    });
  });

  it("fails closed when production identifiers are absent", () =>
    expect(() =>
      resolveReleaseProfile({ EXPO_PUBLIC_APP_ENV: "production" }),
    ).toThrow(/APPLICATION_ID/));

  it("rejects staging identifiers in production", () =>
    expect(() =>
      resolveReleaseProfile({
        EXPO_PUBLIC_APP_ENV: "production",
        MOBILE_ANDROID_APPLICATION_ID: "com.qazipro.restaurant.staging",
        MOBILE_IOS_BUNDLE_ID: "com.qazipro.restaurant.staging",
        MOBILE_LINK_DOMAIN: "restaurant.staging.qazipro.com",
      }),
    ).toThrow(/staging identifiers/));

  it("rejects invalid build numbers", () =>
    expect(() =>
      resolveReleaseProfile({
        EXPO_PUBLIC_APP_ENV: "staging",
        MOBILE_ANDROID_VERSION_CODE: "0",
      }),
    ).toThrow(/positive integer/));
});
