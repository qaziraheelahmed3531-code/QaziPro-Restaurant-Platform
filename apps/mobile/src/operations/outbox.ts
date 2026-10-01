import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationsAccess, SafeOperation } from "./types";

const KEY = "qazipro:operations:safe-outbox:v1",
  maximumAge = 24 * 60 * 60 * 1000;

export async function readOutbox(): Promise<SafeOperation[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is SafeOperation =>
      Boolean(
        row &&
        typeof row.id === "string" &&
        typeof row.businessId === "string" &&
        typeof row.branchId === "string" &&
        typeof row.userId === "string" &&
        row.kind === "SERVICE_REQUEST_RESPONSE" &&
        ["QUEUED", "SYNCING", "NEEDS_ATTENTION"].includes(row.state),
      ),
    );
  } catch {
    return [];
  }
}

const write = (rows: SafeOperation[]) =>
  AsyncStorage.setItem(KEY, JSON.stringify(rows));

export async function queueSafeOperation(
  operation: Omit<SafeOperation, "attempts" | "state" | "createdAt">,
) {
  const rows = await readOutbox();
  const duplicate = rows.find((row) => row.id === operation.id);
  if (duplicate) return duplicate;
  const saved: SafeOperation = {
    ...operation,
    attempts: 0,
    state: "QUEUED",
    createdAt: new Date().toISOString(),
  };
  await write([...rows, saved]);
  return saved;
}

async function deliver(db: SupabaseClient, operation: SafeOperation) {
  return db.rpc("respond_to_table_waiter_request", operation.payload);
}

export async function flushSafeOutbox(
  db: SupabaseClient,
  access: OperationsAccess,
) {
  const rows = await readOutbox(),
    keep: SafeOperation[] = [];
  let synced = 0;
  for (const row of rows) {
    if (
      row.businessId !== access.businessId ||
      row.userId !== access.userId ||
      !access.branches.some((branch) => branch.id === row.branchId)
    ) {
      keep.push({
        ...row,
        state: "NEEDS_ATTENTION",
        lastError: "Access changed. Review this queued operation.",
      });
      continue;
    }
    if (Date.now() - Date.parse(row.createdAt) > maximumAge) {
      keep.push({
        ...row,
        state: "NEEDS_ATTENTION",
        lastError: "Queued operation expired. Review it manually.",
      });
      continue;
    }
    const result = await deliver(db, row).catch(() => ({
      error: { code: "NETWORK" },
    }));
    if (!result.error) {
      synced++;
      continue;
    }
    const retryable =
      result.error.code === "NETWORK" ||
      result.error.code === "57014" ||
      result.error.code === "PGRST003";
    keep.push({
      ...row,
      attempts: row.attempts + 1,
      state: retryable && row.attempts < 5 ? "QUEUED" : "NEEDS_ATTENTION",
      lastError: retryable
        ? "Connection interrupted. Will retry."
        : "Server rejected this operation. Review it.",
    });
  }
  await write(keep);
  return {
    synced,
    remaining: keep.length,
    attention: keep.filter((row) => row.state === "NEEDS_ATTENTION").length,
  };
}
