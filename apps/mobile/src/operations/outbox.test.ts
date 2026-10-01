import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationsAccess } from "./types";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  },
}));

// Mock registration must run before the outbox module captures AsyncStorage.
// eslint-disable-next-line import/first
import { flushSafeOutbox, queueSafeOperation, readOutbox } from "./outbox";

const access: OperationsAccess = {
  userId: "user-1",
  email: "staff@example.com",
  businessId: "business-1",
  businessName: "Restaurant",
  role: "WAITER",
  permissions: ["waiter.use"],
  capabilities: { waiter: true },
  branches: [
    {
      id: "branch-1",
      name: "Main",
      restaurant_name: "Restaurant",
      city: "Lahore",
      formatted_address: null,
      phone: null,
      delivery_enabled: true,
      pickup_enabled: true,
    },
  ],
  primaryColor: "#b42318",
  logoUrl: null,
};

const operation = {
  id: "service:req-1:ACKNOWLEDGE",
  businessId: access.businessId,
  branchId: access.branches[0].id,
  userId: access.userId,
  kind: "SERVICE_REQUEST_RESPONSE" as const,
  payload: { p_request_id: "req-1", p_action: "ACKNOWLEDGE" },
};

describe("safe mobile operations outbox", () => {
  beforeEach(() => storage.clear());

  it("deduplicates an operation by its stable id", async () => {
    await queueSafeOperation(operation);
    await queueSafeOperation(operation);
    expect(await readOutbox()).toHaveLength(1);
  });

  it("removes a server-confirmed operation", async () => {
    await queueSafeOperation(operation);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const result = await flushSafeOutbox({ rpc } as unknown as SupabaseClient, access);
    expect(result).toEqual({ synced: 1, remaining: 0, attention: 0 });
    expect(rpc).toHaveBeenCalledWith("respond_to_table_waiter_request", operation.payload);
  });

  it("never replays a queued operation after staff access changes", async () => {
    await queueSafeOperation(operation);
    const rpc = vi.fn();
    const result = await flushSafeOutbox(
      { rpc } as unknown as SupabaseClient,
      { ...access, businessId: "business-2" },
    );
    expect(result).toEqual({ synced: 0, remaining: 1, attention: 1 });
    expect(rpc).not.toHaveBeenCalled();
    expect((await readOutbox())[0].lastError).toMatch(/Access changed/);
  });

  it("keeps a transient failure queued without claiming success", async () => {
    await queueSafeOperation(operation);
    const rpc = vi.fn().mockResolvedValue({ error: { code: "NETWORK" } });
    const result = await flushSafeOutbox({ rpc } as unknown as SupabaseClient, access);
    expect(result).toEqual({ synced: 0, remaining: 1, attention: 0 });
    expect((await readOutbox())[0]).toMatchObject({ attempts: 1, state: "QUEUED" });
  });
});
