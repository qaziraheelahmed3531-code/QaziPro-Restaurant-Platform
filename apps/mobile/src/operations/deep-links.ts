export type OperationsDestination = "admin" | "waiter" | "rider" | "home";

const destination = (value: unknown): OperationsDestination | null => {
  if (value === "admin" || value === "waiter" || value === "rider")
    return value;
  if (value === "home" || value === "ops") return "home";
  return null;
};

export function parseOperationsNotificationScreen(
  value: unknown,
): OperationsDestination | null {
  return destination(value);
}

export function parseOperationsDeepLink(
  value: string,
  allowedDomain?: string,
): OperationsDestination | null {
  try {
    const url = new URL(value);
    const isWeb = url.protocol === "https:" || url.protocol === "http:";
    if (isWeb) {
      if (!allowedDomain || url.protocol !== "https:" || url.hostname !== allowedDomain)
        return null;
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] !== "app") return null;
      if (segments[1] === "ops") return destination(segments[2] ?? "home");
      return destination(segments[1]);
    }
    if (url.protocol !== "qazipro-ops:") return null;
    const segments = [url.hostname, ...url.pathname.split("/")]
      .filter(Boolean);
    if (segments[0] === "ops") return destination(segments[1] ?? "home");
    return destination(segments[0]);
  } catch {
    return null;
  }
}
