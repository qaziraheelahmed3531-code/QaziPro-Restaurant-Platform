import { describe, expect, it } from "vitest";
import { customerMessage, MobileApiError } from "./errors";
describe("safe errors", () => {
  it("maps invalid session", () =>
    expect(customerMessage("INVALID_ACCESS_TOKEN")).toContain("expired"));
  it("maps provider outage", () =>
    expect(customerMessage("LOCATION_PROVIDER_UNAVAILABLE")).toContain(
      "Pickup",
    ));
  it("does not expose unknown server detail", () =>
    expect(customerMessage("SQL_FAILURE", "relation secret")).toBe(
      "Something went wrong. Please try again.",
    ));
  it("preserves request id for support", () =>
    expect(new MobileApiError("X", "safe", 500, "req-1").requestId).toBe(
      "req-1",
    ));
});
