import { describe, expect, it } from "vitest";
import { leadSchema } from "./lead-schema";

const valid = { kind: "DEMO", fullName: "Qazi Raheel", businessName: "Example Restaurant", email: "owner@example.com", phone: "+923001234567", branchBand: "ONE", services: ["RESTAURANT_POS", "ONLINE_ORDERING"], message: "Please show us the restaurant system.", sourcePage: "/book-a-demo", preferredContactMethod: "WHATSAPP" };

describe("public lead validation", () => {
  it("accepts a valid, scoped request", () => {
    const result = leadSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("owner@example.com");
  });
  it("rejects malformed email, phone and unexpected service", () => {
    expect(leadSchema.safeParse({ ...valid, email: "not-email" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, phone: "123" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, services: ["PLATFORM_ADMIN"] }).success).toBe(false);
  });
  it("rejects oversized payload fields and suspicious source paths", () => {
    expect(leadSchema.safeParse({ ...valid, message: "a".repeat(3001) }).success).toBe(false);
    expect(leadSchema.safeParse({ ...valid, sourcePage: "https://example.com" }).success).toBe(false);
  });
});
