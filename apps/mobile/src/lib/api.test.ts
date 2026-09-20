import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileApi } from "./api";
import { MobileApiError } from "./errors";
afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown, nextCursor: null | string = null) =>
  new Response(
    JSON.stringify({
      ok: true,
      data,
      meta: { version: "v1", requestId: "server-request", nextCursor },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "server-request",
      },
    },
  );
describe("canonical API client", () => {
  it("sends public restaurant and verified branch context", async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ products: [] }));
    vi.stubGlobal("fetch", fetch);
    await new MobileApi("restaurant-a").request("/catalog", {
      branchId: "branch-a",
    });
    const init = fetch.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-qazipro-restaurant": "restaurant-a",
      "x-qazipro-branch-id": "branch-a",
    });
  });
  it("preserves request ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ value: 1 })));
    expect(
      (await new MobileApi("restaurant-a").request("/health")).requestId,
    ).toBe("server-request");
  });
  it("preserves opaque pagination cursor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(ok({ orders: [] }, "opaque")),
    );
    expect(
      (await new MobileApi("restaurant-a").request("/orders")).nextCursor,
    ).toBe("opaque");
  });
  it("serializes JSON body", async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ valid: true }));
    vi.stubGlobal("fetch", fetch);
    await new MobileApi("restaurant-a").request("/promotions/validate", {
      method: "POST",
      body: { code: "SAVE" },
    });
    expect((fetch.mock.calls[0][1] as RequestInit).body).toBe(
      '{"code":"SAVE"}',
    );
  });
  it("centralizes 401 session expiry", async () => {
    const expired = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "INVALID_ACCESS_TOKEN", message: "internal" },
            meta: { requestId: "r" },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(
      new MobileApi("restaurant-a", expired).request("/profile"),
    ).rejects.toBeInstanceOf(MobileApiError);
    expect(expired).toHaveBeenCalledOnce();
  });
  it("turns network failures into safe offline errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("socket secret")),
    );
    await expect(
      new MobileApi("restaurant-a").request("/health"),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "You appear to be offline. Your cart is safe.",
    });
  });
});
