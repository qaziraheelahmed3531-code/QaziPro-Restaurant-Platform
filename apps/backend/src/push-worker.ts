import { createSign } from "node:crypto";
import http2 from "node:http2";
import { pathToFileURL } from "node:url";

type Outbox = {
  id: string;
  business_id: string;
  customer_id: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  attempts: number;
};
type Device = { id: string; platform: "android" | "ios"; push_token: string };
type Delivery = { ok: boolean; permanent: boolean; detail: string };
export const pushRetryDelaySeconds = (attempts: number) =>
  Math.min(3600, 30 * 2 ** Math.max(attempts, 0));
export const isPermanentFcmFailure = (status: number, detail: string) =>
  status === 404 ||
  /UNREGISTERED|registration-token-not-registered/i.test(detail);
export const isPermanentApnsFailure = (status: number, detail: string) =>
  status === 410 ||
  /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/i.test(detail);
const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const base64url = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");
const serviceUrl = () => required("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = () => required("SUPABASE_SERVICE_ROLE_KEY");
const restHeaders = (extra: Record<string, string> = {}) => ({
  apikey: serviceKey(),
  authorization: `Bearer ${serviceKey()}`,
  "content-type": "application/json",
  ...extra,
});

async function rest<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${serviceUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(), ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Supabase REST ${response.status}`);
  return response.status === 204 ? (null as T) : ((await response.json()) as T);
}
async function claim(): Promise<Outbox | null> {
  const rows = await rest<Outbox[]>(
    "customer_notification_outbox?status=in.(PENDING,FAILED)&available_at=lte.now()&attempts=lt.5&order=created_at.asc&limit=1",
  );
  const row = rows[0];
  if (!row) return null;
  const claimed = await rest<Outbox[]>(
    `customer_notification_outbox?id=eq.${row.id}&status=in.(PENDING,FAILED)`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        status: "PROCESSING",
        attempts: row.attempts + 1,
        last_error: null,
      }),
    },
  );
  return claimed[0] ?? null;
}
async function recoverStaleClaims() {
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  await rest(
    `customer_notification_outbox?status=eq.PROCESSING&updated_at=lt.${encodeURIComponent(stale)}`,
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        status: "FAILED",
        available_at: new Date().toISOString(),
        last_error: "Recovered stale worker claim",
      }),
    },
  );
}
async function devices(row: Outbox) {
  return rest<Device[]>(
    `customer_device_tokens?business_id=eq.${row.business_id}&customer_id=eq.${row.customer_id}&is_enabled=eq.true&select=id,platform,push_token`,
  );
}
async function updateOutbox(
  row: Outbox,
  status: "SENT" | "FAILED" | "CANCELLED",
  error?: string,
) {
  const delay = pushRetryDelaySeconds(row.attempts);
  await rest(`customer_notification_outbox?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      processed_at:
        status === "SENT" || status === "CANCELLED"
          ? new Date().toISOString()
          : null,
      available_at:
        status === "FAILED"
          ? new Date(Date.now() + delay * 1000).toISOString()
          : new Date().toISOString(),
      last_error: error?.slice(0, 500) ?? null,
    }),
  });
}
async function disable(device: Device) {
  await rest(`customer_device_tokens?id=eq.${device.id}`, {
    method: "PATCH",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ is_enabled: false }),
  });
}

let fcmCache: { token: string; expires: number } | null = null;
async function fcmAccessToken() {
  if (fcmCache && fcmCache.expires > Date.now() + 60_000) return fcmCache.token;
  const client = required("FCM_CLIENT_EMAIL"),
    key = required("FCM_PRIVATE_KEY").replace(/\\n/g, "\n"),
    now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    body = base64url(
      JSON.stringify({
        iss: client,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  const assertion = `${header}.${body}.${signer.sign(key, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM OAuth ${response.status}`);
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  fcmCache = {
    token: json.access_token,
    expires: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}
async function sendFcm(row: Outbox, device: Device): Promise<Delivery> {
  const token = await fcmAccessToken(),
    project = required("FCM_PROJECT_ID");
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: device.push_token,
          notification: { title: row.title, body: row.message },
          data: Object.fromEntries(
            Object.entries(row.payload).map(([key, value]) => [
              key,
              String(value),
            ]),
          ),
          android: { notification: { channel_id: "orders" } },
        },
      }),
    },
  );
  const detail = await response.text();
  return {
    ok: response.ok,
    permanent: isPermanentFcmFailure(response.status, detail),
    detail: `FCM ${response.status} ${detail.slice(0, 180)}`,
  };
}
function apnsJwt() {
  const now = Math.floor(Date.now() / 1000),
    header = base64url(
      JSON.stringify({ alg: "ES256", kid: required("APNS_KEY_ID") }),
    ),
    body = base64url(
      JSON.stringify({ iss: required("APNS_TEAM_ID"), iat: now }),
    ),
    signer = createSign("SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${signer.sign({ key: required("APNS_PRIVATE_KEY").replace(/\\n/g, "\n"), dsaEncoding: "ieee-p1363" }, "base64url")}`;
}
async function sendApns(row: Outbox, device: Device): Promise<Delivery> {
  const production = process.env.APNS_ENVIRONMENT === "production",
    origin = production
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
  return new Promise((resolve) => {
    const client = http2.connect(origin);
    client.on("error", (error) =>
      resolve({ ok: false, permanent: false, detail: error.message }),
    );
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${device.push_token}`,
      authorization: `bearer ${apnsJwt()}`,
      "apns-topic": required("APNS_BUNDLE_ID"),
      "apns-push-type": "alert",
      "apns-priority": "10",
    });
    let status = 0,
      detail = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.on("data", (chunk) => {
      detail += chunk;
    });
    request.on("end", () => {
      client.close();
      resolve({
        ok: status === 200,
        permanent: isPermanentApnsFailure(status, detail),
        detail: `APNs ${status} ${detail.slice(0, 180)}`,
      });
    });
    request.end(
      JSON.stringify({
        aps: {
          alert: { title: row.title, body: row.message },
          sound: "default",
        },
        ...row.payload,
      }),
    );
  });
}
async function deliver(row: Outbox, device: Device) {
  try {
    return device.platform === "android"
      ? await sendFcm(row, device)
      : await sendApns(row, device);
  } catch (error) {
    return {
      ok: false,
      permanent: false,
      detail: error instanceof Error ? error.message : "Provider error",
    };
  }
}

export async function runPushWorker(limit = 25) {
  if (process.env.PUSH_WORKER_ENABLED !== "true")
    return { enabled: false, processed: 0, sent: 0, failed: 0 };
  await recoverStaleClaims();
  let processed = 0,
    sent = 0,
    failed = 0;
  while (processed < limit) {
    const row = await claim();
    if (!row) break;
    processed++;
    const targets = await devices(row);
    if (!targets.length) {
      await updateOutbox(row, "CANCELLED", "No active devices");
      continue;
    }
    const results = await Promise.all(
      targets.map(async (device) => {
        const result = await deliver(row, device);
        if (result.permanent) await disable(device);
        return result;
      }),
    );
    const successes = results.filter((result) => result.ok).length;
    if (successes === targets.length) {
      sent++;
      await updateOutbox(row, "SENT");
    } else {
      failed++;
      const detail = results
        .filter((result) => !result.ok)
        .map((result) => result.detail)
        .join(" | ");
      await updateOutbox(
        row,
        row.attempts + 1 >= 5 ? "CANCELLED" : "FAILED",
        detail,
      );
    }
  }
  return { enabled: true, processed, sent, failed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runPushWorker(Number(process.env.PUSH_WORKER_BATCH_SIZE ?? 25))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : "Push worker failed",
      );
      process.exitCode = 1;
    });
