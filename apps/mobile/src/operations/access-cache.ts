import type { OperationsAccess } from "./types";

export const ACCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CachedOperationsAccess = {
  userId: string;
  verifiedAt: string;
  access: OperationsAccess;
};

export function readValidCachedAccess(
  raw: string | null,
  userId: string,
  now = Date.now(),
): OperationsAccess | null {
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as CachedOperationsAccess;
    const verifiedAt = Date.parse(cached.verifiedAt);
    if (
      cached.userId !== userId ||
      cached.access?.userId !== userId ||
      !cached.access?.businessId ||
      cached.access.branches.length === 0 ||
      !Number.isFinite(verifiedAt) ||
      now < verifiedAt ||
      now - verifiedAt > ACCESS_CACHE_TTL_MS
    )
      return null;
    return cached.access;
  } catch {
    return null;
  }
}
