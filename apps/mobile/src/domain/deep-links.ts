export type DeepLink =
  | {
      kind: "auth";
      type: "signup" | "recovery";
      code?: string;
      accessToken?: string;
      refreshToken?: string;
    }
  | { kind: "order"; orderNumber: string }
  | { kind: "invalid" };
export function parseDeepLink(value: string, allowedDomain?: string): DeepLink {
  try {
    const url = new URL(value),
      custom = !url.protocol.startsWith("http"),
      rawPath =
        `${custom ? `${url.hostname}/` : ""}${url.pathname.replace(/^\/+/, "")}`.replace(
          /\/$/,
          "",
        ),
      path = rawPath.replace(/^app\//, "");
    if (!custom && allowedDomain && url.hostname !== allowedDomain)
      return { kind: "invalid" };
    if (path.startsWith("orders/")) {
      const orderNumber = path.split("/")[1]?.toUpperCase();
      return orderNumber && /^[A-Z0-9-]{4,80}$/.test(orderNumber)
        ? { kind: "order", orderNumber }
        : { kind: "invalid" };
    }
    if (path.startsWith("auth/callback")) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, "")),
        type = (url.searchParams.get("type") ?? hash.get("type")) as
          "signup" | "recovery";
      if (type !== "signup" && type !== "recovery") return { kind: "invalid" };
      return {
        kind: "auth",
        type,
        code: url.searchParams.get("code") ?? undefined,
        accessToken: hash.get("access_token") ?? undefined,
        refreshToken: hash.get("refresh_token") ?? undefined,
      };
    }
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}
