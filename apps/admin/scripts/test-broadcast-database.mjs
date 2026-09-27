// Disposable LOCAL PostgreSQL cluster only. Never reads project environment files.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const bin = process.env.QAZIPRO_TEST_PG_BIN || "C:/Program Files/PostgreSQL/18/bin";
const root = await mkdtemp(join(tmpdir(), "qazipro-broadcast-db-"));
const port = "55439";
// Discard inherited libpq settings (including PGHOSTADDR/service files).
const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG"))), PGHOST: "127.0.0.1", PGPORT: port, PGUSER: "postgres", PGDATABASE: "postgres", PGSSLMODE: "disable" };
function run(name, args, input) {
  const result = spawnSync(join(bin, name + (process.platform === "win32" ? ".exe" : "")), args, { windowsHide: true, env, input, encoding: "utf8", timeout: 60000 });
  if (result.status !== 0) throw Error(`${name}: ${result.error || result.stderr || result.stdout}`);
  return result.stdout;
}
const sql = statement => run("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], statement).trim();
let started = false;
try {
  run("initdb", ["-D", root, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"]);
  run("pg_ctl", ["-D", root, "-l", join(root, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  // Minimal schema fixture; real canonical recipient-selection RPC is loaded
  // below. Permission shim is deliberately NOT evidence of deployed RLS.
  sql(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.has_permission(b uuid,p text) returns boolean language sql stable as $$ select auth.uid() is not null and b::text=current_setting('test.business',true) $$;
    create table auth.users(id uuid primary key,email text);
    create table public.deals(id uuid,business_id uuid,is_active boolean);
    create table public.storefront_customer_memberships(business_id uuid,user_id uuid);
    create table public.customer_broadcasts(id uuid primary key default gen_random_uuid(),business_id uuid,deal_id uuid,subject text,message text,status text default 'PENDING',recipient_count integer default 0,sent_count integer default 0,failed_count integer default 0,created_by uuid,updated_at timestamptz default now(),completed_at timestamptz);
    create table public.customer_broadcast_deliveries(id bigint generated always as identity primary key,broadcast_id uuid,business_id uuid,recipient text,status text default 'PENDING',attempts integer default 0,last_error text,updated_at timestamptz default now(),unique(broadcast_id,recipient));
    create table public.audit_logs(business_id uuid,actor_id uuid,action text,entity_type text,entity_id text,metadata jsonb);
  `);
  const oldMigration = await readFile(new URL("../../../supabase/migrations/202609140003_storefront_customer_memberships.sql", import.meta.url), "utf8");
  sql(oldMigration.slice(oldMigration.indexOf("create or replace function public.create_customer_broadcast("), oldMigration.indexOf("notify pgrst")));
  sql(await readFile(new URL("../../../supabase/migrations/202609270006_customer_broadcast_safe_retries.sql", import.meta.url), "utf8"));
  const business = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", key = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const setup = `set request.jwt.claim.sub='${actor}'; set test.business='${business}';`;
  sql(`insert into auth.users values('${actor}','customer@staging.qazipro.invalid'); insert into storefront_customer_memberships values('${business}','${actor}');`);
  const create = `select public.create_customer_broadcast('${business}',null,'Test subject','Test message','${key}');`;
  const first = JSON.parse(sql(setup + create));
  const replay = JSON.parse(sql(setup + create));
  assert.equal(first.id, replay.id); assert.equal(replay.replayed, true);
  assert.equal(sql("select count(*) from customer_broadcasts"), "1");
  assert.equal(sql("select count(*) from customer_broadcast_deliveries"), "1");
  assert.equal(sql("select count(*) from audit_logs"), "1");
  console.log("PASS idempotent retry preserves campaign, recipient snapshot and one audit event");
  assert.throws(() => sql(setup + create.replace("Test message", "Changed message")), /another draft/);
  console.log("PASS reusing a key with different content is rejected");
  assert.throws(() => sql(create), /access denied/);
  assert.throws(() => sql(setup + create.replaceAll(business, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")), /access denied/);
  console.log("PASS missing actor and cross-business permission check fail closed");
  // Concurrent requests use separate DB connections and the actual transaction lock.
  const concurrentKey = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  async function concurrent() {
    return new Promise((resolve, reject) => {
      const child = spawn(join(bin, "psql.exe"), ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { windowsHide: true, env });
      let output = "", error = ""; child.stdout.on("data", data => output += data); child.stderr.on("data", data => error += data);
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(JSON.parse(output.trim())) : reject(Error(error)));
      child.stdin.end(setup + create.replaceAll(key, concurrentKey));
    });
  }
  const results = await Promise.all(Array.from({ length: 8 }, concurrent));
  assert.equal(new Set(results.map(result => result.id)).size, 1);
  assert.equal(sql("select count(*) from customer_broadcasts"), "2");
  console.log("PASS eight concurrent creation requests produce one campaign");
  const claimed = sql(setup + `select count(*) from claim_customer_broadcast_batch('${first.id}',20)`);
  assert.equal(claimed, "1");
  assert.equal(sql(setup + `select count(*) from claim_customer_broadcast_batch('${first.id}',20)`), "0");
  sql(`update customer_broadcast_deliveries set updated_at=now()-interval '1 day' where broadcast_id='${first.id}'`);
  assert.equal(sql(setup + `select count(*) from claim_customer_broadcast_batch('${first.id}',20)`), "0");
  console.log("PASS claimed deliveries are not claimed twice, including stale interrupted attempts");
  sql(`update customer_broadcast_deliveries set status='FAILED',last_error='SMTP result uncertain' where broadcast_id='${first.id}'`);
  assert.equal(sql(setup + `select count(*) from claim_customer_broadcast_batch('${first.id}',20)`), "0");
  console.log("PASS ambiguous provider failure cannot be automatically resent");
  sql(`update customer_broadcast_deliveries set status='FAILED',last_error='Email provider is not configured.' where broadcast_id='${first.id}'`);
  assert.equal(sql(setup + `select count(*) from claim_customer_broadcast_batch('${first.id}',20)`), "1");
  console.log("PASS definitely-unattempted provider configuration failure can be retried");
  assert.throws(() => sql(`select count(*) from claim_customer_broadcast_batch('${first.id}',20)`), /access denied/);
  console.log("PASS unauthenticated claim denied; 8 local PostgreSQL checks passed");
} finally {
  if (started) run("pg_ctl", ["-D", root, "-m", "fast", "-w", "stop"]);
  console.log("Isolated local cluster stopped. Test data/logs retained at: " + root);
}
