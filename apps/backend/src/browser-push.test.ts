import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBrowserSubscription, safeNotificationPath } from "@italian-pizza/shared/web-push";
import { browserPushPayload, runPushWorker } from "./push-worker.js";

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification } }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/unit-fixture", keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) } };
const origin = "https://italian-pizza.staging.qazipro.com";

describe("browser push security", () => {
  it("accepts supported providers but rejects SSRF, credentials and invalid keys", () => {
    expect(parseBrowserSubscription(subscription)).toEqual(subscription);
    for (const endpoint of ["https://127.0.0.1/private", "https://fcm.googleapis.com.attacker.invalid/send", "https://user:password@fcm.googleapis.com/send", "http://fcm.googleapis.com/send", "https://fcm.googleapis.com:444/send", "https://fcm.googleapis.com/send#fragment"]) {
      expect(parseBrowserSubscription({ ...subscription, endpoint })).toBeNull();
    }
    expect(parseBrowserSubscription({ ...subscription, keys: { p256dh: "short", auth: "short" } })).toBeNull();
  });
  it("restricts deep links to customer destinations", () => {
    for (const path of ["/", "/#deals", "/orders", "/orders/IP-123", "/pages/about"]) expect(safeNotificationPath(path)).toBe(path);
    for (const path of ["//evil.invalid", "https://evil.invalid", "/auth/callback", "/orders?business_id=other", "/\\evil.invalid", "/api/orders", "/super-admin"]) expect(safeNotificationPath(path)).toBeNull();
  });
  it("builds order links from canonical order numbers", () => {
    expect(browserPushPayload({ id: "event", title: "Order ready", message: "Collect your order", payload: { orderNumber: "IP-123" } }, origin).path).toBe("/orders/IP-123");
    expect(() => browserPushPayload({ id: "event", title: "x", message: "x", payload: { path: "//evil.invalid" } }, origin)).toThrow();
  });
});

function workerFixture(options: { mismatch?: boolean; delivered?: string[]; optedIn?: boolean; branch?: string } = {}) {
  vi.stubEnv("PUSH_WORKER_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://unit-only.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "unit-placeholder-not-a-secret");
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "unit-public");
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "unit-private-placeholder");
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:unit@example.invalid");
  const row = { id: "notification-01", business_id: "business-a", customer_id: "customer-a", branch_id: "branch-a", title: "Order ready", message: "Ready", payload: { path: "/orders" }, attempts: 0, broadcast_id: "broadcast-a", delivered_device_ids: options.delivered ?? [] };
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    // Absolutely no real network is possible in these tests.
    if (url.hostname !== "unit-only.invalid") throw Error("Unexpected external request");
    const path = url.pathname + url.search;
    if (init?.method === "PATCH") {
      writes.push({ path, body: JSON.parse(String(init.body)) });
      if (init.headers && (init.headers as Record<string, string>).prefer === "return=representation") return Response.json([row]);
      return new Response(null, { status: 204 });
    }
    if (path.includes("rpc/resolve_storefront_business")) return Response.json([{ resolved_business_id: options.mismatch ? "business-b" : row.business_id }]);
    if (path.includes("customer_device_tokens?")) {
      expect(url.searchParams.get("business_id")).toBe("eq.business-a");
      expect(url.searchParams.get("customer_id")).toBe("eq.customer-a");
      return Response.json([{ id: "device-a", platform: "web", push_token: subscription.endpoint, web_subscription: subscription, storefront_origin: origin, branch_id: options.branch ?? "branch-a", marketing_opt_in: options.optedIn ?? true }]);
    }
    if (url.searchParams.has("broadcast_id")) return Response.json([{ status: writes.some(write => write.body.status === "SENT") ? "SENT" : "FAILED" }]);
    return Response.json([row]);
  }));
  return writes;
}

describe("browser outbox delivery (mocked providers only)", () => {
  it("sends once and checkpoints successful devices", async () => {
    const writes = workerFixture(); sendNotification.mockResolvedValue({ statusCode: 201 });
    expect((await runPushWorker(1)).sent).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(writes.some(write => JSON.stringify(write.body.delivered_device_ids) === '["device-a"]')).toBe(true);
    expect(JSON.parse(sendNotification.mock.calls[0][1]).origin).toBe(origin);
  });
  it("does not resend a previously checkpointed successful device", async () => {
    workerFixture({ delivered: ["device-a"] });
    expect((await runPushWorker(1)).sent).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it.each([{ optedIn: false }, { branch: "branch-b" }])("does not broadcast to non-consenting or wrong-branch devices: %j", async options => {
    workerFixture(options); await runPushWorker(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("rejects a subscription origin mapped to another tenant", async () => {
    workerFixture({ mismatch: true }); expect((await runPushWorker(1)).failed).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("disables expired subscriptions without reporting delivered", async () => {
    const writes = workerFixture(); sendNotification.mockRejectedValue({ statusCode: 410 });
    expect((await runPushWorker(1)).sent).toBe(0);
    expect(writes.some(write => write.body.is_enabled === false)).toBe(true);
  });
});

describe("service worker isolation", () => {
  function setup() {
    const listeners: Record<string, (event: any) => void> = {};
    const showNotification = vi.fn(async () => undefined);
    const openWindow = vi.fn(async () => undefined);
    const self = { location: { origin }, addEventListener: (name: string, callback: (event: any) => void) => { listeners[name] = callback; }, registration: { showNotification }, clients: { matchAll: async () => [], openWindow }, skipWaiting: () => undefined };
    vm.runInNewContext(readFileSync(new URL("../../customer/public/sw.js", import.meta.url), "utf8"), { self, URL });
    return { listeners, showNotification, openWindow };
  }
  it("ignores another restaurant's notification payload", () => {
    const { listeners, showNotification } = setup();
    listeners.push({ data: { json: () => ({ origin: "https://kings-cafe.staging.qazipro.com", title: "Wrong tenant" }) }, waitUntil: vi.fn() });
    expect(showNotification).not.toHaveBeenCalled();
  });
  it("opens tenant-correct deep links and contains malicious destinations", async () => {
    const { listeners, openWindow } = setup();
    for (const [path, expected] of [["/orders/IP-123", "/orders/IP-123"], ["https://evil.invalid", "/"]]) {
      let completion: Promise<unknown> = Promise.resolve();
      listeners.notificationclick({ notification: { close: vi.fn(), data: { path } }, waitUntil: (promise: Promise<unknown>) => { completion = promise; } });
      await completion;
      expect(openWindow).toHaveBeenLastCalledWith(origin + expected);
    }
  });
});
