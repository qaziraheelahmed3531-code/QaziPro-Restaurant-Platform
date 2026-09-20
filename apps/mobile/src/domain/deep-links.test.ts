import { describe, expect, it } from "vitest";
import { parseDeepLink } from "./deep-links";
describe("deep links", () => {
  it("routes order link", () =>
    expect(parseDeepLink("qazipro-restaurant://orders/KC-001")).toEqual({
      kind: "order",
      orderNumber: "KC-001",
    }));
  it("rejects malformed order", () =>
    expect(parseDeepLink("qazipro-restaurant://orders/x")).toEqual({
      kind: "invalid",
    }));
  it("routes recovery code", () =>
    expect(
      parseDeepLink(
        "qazipro-restaurant://auth/callback?type=recovery&code=abc",
      ),
    ).toMatchObject({ kind: "auth", type: "recovery", code: "abc" }));
  it("routes verification", () =>
    expect(
      parseDeepLink(
        "https://restaurant.test/auth/callback?type=signup&code=abc",
      ),
    ).toMatchObject({ kind: "auth", type: "signup" }));
  it("routes an associated-domain app order link", () =>
    expect(
      parseDeepLink(
        "https://restaurant.test/app/orders/KC-001",
        "restaurant.test",
      ),
    ).toEqual({ kind: "order", orderNumber: "KC-001" }));
  it("rejects links for another restaurant domain", () =>
    expect(
      parseDeepLink(
        "https://another.test/app/orders/KC-001",
        "restaurant.test",
      ),
    ).toEqual({ kind: "invalid" }));
  it("accepts token callback without logging it", () =>
    expect(
      parseDeepLink(
        "qazipro-restaurant://auth/callback#type=recovery&access_token=a&refresh_token=b",
      ),
    ).toMatchObject({ kind: "auth", accessToken: "a", refreshToken: "b" }));
  it("rejects unknown route", () =>
    expect(parseDeepLink("qazipro-restaurant://admin")).toEqual({
      kind: "invalid",
    }));
  it("rejects invalid URL", () =>
    expect(parseDeepLink("not a URL")).toEqual({ kind: "invalid" }));
});
