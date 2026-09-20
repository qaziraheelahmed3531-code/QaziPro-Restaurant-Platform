import { env } from "@/config/env";
import { customerMessage, MobileApiError } from "./errors";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  branchId?: string;
  token?: string;
  guestToken?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
};
type Success<T> = {
  ok: true;
  data: T;
  meta: { version: "v1"; requestId?: string; nextCursor?: string | null };
};
type Failure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId?: string };
};

export class MobileApi {
  constructor(
    private restaurantKey: string,
    private onUnauthorized?: () => void,
  ) {}
  async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<{ data: T; nextCursor?: string | null; requestId?: string }> {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    const url = new URL(`${env.apiBaseUrl}${path}`);
    Object.entries(options.query ?? {}).forEach(
      ([key, value]) =>
        value !== undefined && url.searchParams.set(key, String(value)),
    );
    const headers: Record<string, string> = {
      accept: "application/json",
      "x-qazipro-restaurant": this.restaurantKey,
      "x-request-id": `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    if (options.branchId) headers["x-qazipro-branch-id"] = options.branchId;
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.guestToken) headers["x-order-token"] = options.guestToken;
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        Success<T> | Failure | null;
      if (!response.ok || !payload || payload.ok === false) {
        const error =
          payload && payload.ok === false
            ? payload.error
            : {
                code: "INVALID_RESPONSE",
                message: "The server returned an invalid response.",
              };
        if (response.status === 401) this.onUnauthorized?.();
        throw new MobileApiError(
          error.code,
          customerMessage(error.code, error.message),
          response.status,
          payload?.meta.requestId ??
            response.headers.get("x-request-id") ??
            undefined,
          error.details,
        );
      }
      return {
        data: payload.data,
        nextCursor: payload.meta.nextCursor,
        requestId: payload.meta.requestId,
      };
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new MobileApiError(
          "REQUEST_TIMEOUT",
          "The request timed out. Check your connection and retry.",
          408,
        );
      throw new MobileApiError(
        "NETWORK_ERROR",
        "You appear to be offline. Your cart is safe.",
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
