export const customerMessage = (code: string, message?: string) =>
  ({
    AUTH_REQUIRED: "Please sign in to continue.",
    INVALID_ACCESS_TOKEN: "Your session expired. Please sign in again.",
    INVALID_RESTAURANT: "This restaurant link is invalid.",
    RESTAURANT_NOT_FOUND: "This restaurant is unavailable.",
    BRANCH_REQUIRED: "Select a branch to continue.",
    BRANCH_NOT_FOUND: "That branch is no longer available.",
    BRANCH_CONTEXT_MISMATCH: "Your cart belongs to another branch.",
    LOCATION_PROVIDER_UNAVAILABLE:
      "Map routing is temporarily unavailable. Pickup is still available.",
    DELIVERY_LOCATION_INVALID: "This address is outside the delivery area.",
    DELIVERY_DISTANCE_EXCEEDED: "This address is too far for delivery.",
    RATE_LIMITED: "Too many attempts. Please wait and try again.",
    VALIDATION_FAILED: message || "Check the highlighted information.",
    ORDER_NOT_FOUND: "We could not find that order.",
    ORDER_ACCESS_REQUIRED: "Use the secure order link or sign in.",
  })[code] ?? "Something went wrong. Please try again.";

export class MobileApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
