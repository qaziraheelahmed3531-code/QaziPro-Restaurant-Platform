import { describe, expect, it } from "vitest";
import { validatePublicEnvironment } from "./public-environment";

const staging = {
  environment: "staging",
  apiBaseUrl: "https://staging.example/api/v1",
  supabaseUrl: "https://staging.supabase.co",
  supabasePublishableKey: "public-key",
  restaurantKey: "restaurant-a",
  linkDomain: "restaurant-a.staging.example",
};

describe("public mobile environment", () => {
  it("accepts a complete HTTPS staging profile", () =>
    expect(validatePublicEnvironment(staging)).toMatchObject({
      environment: "staging",
      restaurantKey: "restaurant-a",
      pushEnabled: false,
    }));
  it("rejects local URLs in a staging build", () =>
    expect(() =>
      validatePublicEnvironment({
        ...staging,
        apiBaseUrl: "http://10.0.2.2:3000",
      }),
    ).toThrow(/HTTPS|local/));
  it("rejects service-role credentials", () =>
    expect(() =>
      validatePublicEnvironment({
        ...staging,
        supabasePublishableKey: "sb_secret_value",
      }),
    ).toThrow(/server credential/));
  it("rejects staging endpoints in production", () =>
    expect(() =>
      validatePublicEnvironment({ ...staging, environment: "production" }),
    ).toThrow(/cannot target staging/));
  it("validates white-label brand colors", () =>
    expect(() =>
      validatePublicEnvironment({ ...staging, brandPrimary: "red" }),
    ).toThrow(/six-digit hex/));
});
