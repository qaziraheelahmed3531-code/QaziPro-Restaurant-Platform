// STAGING ONLY. Apply the candidate definitions inside a rolled-back transaction.
// No mail, passwords, tokens or real payment provider calls are involved.
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const migration = await readFile(new URL("../../../supabase/migrations/202609280008_web_pos_transaction_safety.sql",import.meta.url),"utf8");
const checks = await readFile(new URL("./pos-database-checks.sql",import.meta.url),"utf8");
const replayMigration = await readFile(new URL("../../../supabase/migrations/202609280009_web_pos_reversed_sale_replay.sql",import.meta.url),"utf8");
const directory = await mkdtemp(join(tmpdir(),"qazipro-pos-validation-"));
try {
  const file=join(directory,"rollback.sql");
  const replayDefinition = replayMigration.replace(/^begin;/,"").replace(/commit;\s*$/,"");
  await writeFile(file,process.argv.includes("--deployed") ? "begin;\n"+replayDefinition+checks+"\nrollback;" : migration.replace(/commit;\s*$/,"\n"+replayDefinition+checks+"\nrollback;"));
  const output=execFileSync("cmd.exe",["/d","/s","/c",`npx --offline supabase db query --file ${file} --linked --project-ref jzisqjvroxodvmqxzsob --output json`],{encoding:"utf8",timeout:120000,maxBuffer:2e6,stdio:["ignore","pipe","pipe"]});
  if(!output.includes("POS_DATABASE_CHECKS_PASSED"))throw Error("Database checks did not return their completion marker.");
  console.log("PASS staging migration and transactional POS checks; all fixture/data/function changes rolled back.");
} catch(error) {
  console.error(error.stderr?.toString() ?? error.message); process.exitCode=1;
} finally { await rm(directory,{recursive:true,force:true}); }
