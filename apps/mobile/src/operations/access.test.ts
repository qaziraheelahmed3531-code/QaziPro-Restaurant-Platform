import { describe, expect, it } from "vitest";
import { can, roleSurface } from "./access";
import type { OperationsAccess } from "./types";

const access = (
  role: OperationsAccess["role"],
  permissions: string[] = [],
): OperationsAccess => ({
  userId: "user",
  email: "staff@example.test",
  businessId: "business",
  businessName: "Restaurant",
  role,
  permissions,
  capabilities: {},
  branches: [],
  primaryColor: "#b42318",
  logoUrl: null,
});

describe("mobile operations authorization helpers", () => {
  it("routes roles only to their intended surface", () => {
    expect(roleSurface("OWNER")).toBe("admin");
    expect(roleSurface("MANAGER")).toBe("admin");
    expect(roleSurface("WAITER")).toBe("waiter");
    expect(roleSurface("RIDER")).toBe("rider");
    expect(roleSurface("CASHIER")).toBe("unsupported");
  });
  it("never grants client permissions by role label except canonical owner", () => {
    expect(can(access("OWNER"), "reports.read")).toBe(true);
    expect(can(access("MANAGER"), "reports.read")).toBe(false);
    expect(can(access("MANAGER", ["reports.read"]), "reports.read")).toBe(true);
    expect(can(access("WAITER", ["waiter.use"]), "reports.read")).toBe(false);
    expect(can(access("RIDER", ["rider.use"]), "products.manage")).toBe(false);
  });
});
