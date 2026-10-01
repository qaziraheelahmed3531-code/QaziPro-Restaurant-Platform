import { describe, expect, it } from "vitest";
import {
  parseOperationsDeepLink,
  parseOperationsNotificationScreen,
} from "./deep-links";

describe("operations deep links", () => {
  it("accepts the QaziPro Operations scheme", () => {
    expect(parseOperationsDeepLink("qazipro-ops://waiter")).toBe("waiter");
    expect(parseOperationsDeepLink("qazipro-ops://ops/rider")).toBe("rider");
  });

  it("accepts only the configured HTTPS associated domain", () => {
    expect(
      parseOperationsDeepLink(
        "https://restaurant-a.staging.qazipro.com/app/ops/admin",
        "restaurant-a.staging.qazipro.com",
      ),
    ).toBe("admin");
    expect(
      parseOperationsDeepLink(
        "https://attacker.example/app/ops/admin",
        "restaurant-a.staging.qazipro.com",
      ),
    ).toBeNull();
    expect(
      parseOperationsDeepLink(
        "http://restaurant-a.staging.qazipro.com/app/ops/admin",
        "restaurant-a.staging.qazipro.com",
      ),
    ).toBeNull();
  });

  it("rejects customer schemes and unknown routes", () => {
    expect(parseOperationsDeepLink("qazipro-restaurant://admin")).toBeNull();
    expect(parseOperationsDeepLink("qazipro-ops://settings")).toBeNull();
  });

  it("allowlists notification destinations", () => {
    expect(parseOperationsNotificationScreen("rider")).toBe("rider");
    expect(parseOperationsNotificationScreen("https://attacker.example")).toBeNull();
    expect(parseOperationsNotificationScreen({ screen: "admin" })).toBeNull();
  });
});
