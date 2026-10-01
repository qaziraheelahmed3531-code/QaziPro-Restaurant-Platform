import { describe, expect, it } from "vitest";
import {
  ACCESS_CACHE_TTL_MS,
  readValidCachedAccess,
  type CachedOperationsAccess,
} from "./access-cache";
import type { OperationsAccess } from "./types";

const now = Date.parse("2026-10-01T12:00:00.000Z");
const access: OperationsAccess = {
  userId: "user-a",
  email: "waiter@example.test",
  businessId: "business-a",
  businessName: "Restaurant A",
  role: "WAITER",
  permissions: [],
  capabilities: { waiter: true },
  branches: [
    {
      id: "branch-a",
      name: "Main",
      restaurant_name: "Restaurant A",
      city: "Karachi",
      formatted_address: null,
      phone: null,
      delivery_enabled: true,
      pickup_enabled: true,
    },
  ],
  primaryColor: "#a92114",
  logoUrl: null,
};

const serialize = (value: Partial<CachedOperationsAccess> = {}) =>
  JSON.stringify({
    userId: "user-a",
    verifiedAt: new Date(now - 1_000).toISOString(),
    access,
    ...value,
  });

describe("operations access cache", () => {
  it("accepts matching access inside the bounded offline window", () =>
    expect(readValidCachedAccess(serialize(), "user-a", now)).toEqual(access));

  it("rejects expired access", () =>
    expect(
      readValidCachedAccess(
        serialize({
          verifiedAt: new Date(now - ACCESS_CACHE_TTL_MS - 1).toISOString(),
        }),
        "user-a",
        now,
      ),
    ).toBeNull());

  it("rejects another user or mismatched embedded access", () => {
    expect(readValidCachedAccess(serialize(), "user-b", now)).toBeNull();
    expect(
      readValidCachedAccess(
        serialize({ access: { ...access, userId: "user-b" } }),
        "user-a",
        now,
      ),
    ).toBeNull();
  });

  it("rejects future, malformed, branchless or incomplete records", () => {
    expect(
      readValidCachedAccess(
        serialize({ verifiedAt: new Date(now + 1).toISOString() }),
        "user-a",
        now,
      ),
    ).toBeNull();
    expect(readValidCachedAccess("not-json", "user-a", now)).toBeNull();
    expect(
      readValidCachedAccess(
        serialize({ access: { ...access, branches: [] } }),
        "user-a",
        now,
      ),
    ).toBeNull();
  });
});
