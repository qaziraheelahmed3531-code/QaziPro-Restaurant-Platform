import { describe, expect, it } from "vitest";
import {
  isPermanentApnsFailure,
  isPermanentFcmFailure,
  pushRetryDelaySeconds,
} from "./push-worker.js";

describe("push worker safety", () => {
  it("uses bounded exponential retry backoff", () => {
    expect([0, 1, 2, 3, 20].map(pushRetryDelaySeconds)).toEqual([
      30, 60, 120, 240, 3600,
    ]);
  });
  it("only disables permanently invalid FCM tokens", () => {
    expect(isPermanentFcmFailure(404, "UNREGISTERED")).toBe(true);
    expect(isPermanentFcmFailure(400, "malformed provider payload")).toBe(
      false,
    );
    expect(isPermanentFcmFailure(503, "UNAVAILABLE")).toBe(false);
  });
  it("only disables permanently invalid APNs tokens", () => {
    expect(isPermanentApnsFailure(410, '{"reason":"Unregistered"}')).toBe(true);
    expect(isPermanentApnsFailure(400, '{"reason":"BadDeviceToken"}')).toBe(
      true,
    );
    expect(isPermanentApnsFailure(400, '{"reason":"PayloadEmpty"}')).toBe(
      false,
    );
    expect(isPermanentApnsFailure(503, '{"reason":"Shutdown"}')).toBe(false);
  });
});
