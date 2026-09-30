import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
const migration=await readFile(new URL('../../../supabase/migrations/20260930170000_desktop_shift_reconciliation.sql',import.meta.url),'utf8');
let checks=await readFile(new URL('./database-checks.sql',import.meta.url),'utf8');
const shiftChecks=await readFile(new URL('./shift-checks.sql',import.meta.url),'utf8');
const anchor=' update public.pos_offline_devices set is_active=false where id=device;';
if(!checks.includes(anchor))throw Error('Fixture anchor changed');
checks=checks.replace(anchor,shiftChecks+'\n'+anchor);
const temp=await mkdtemp(join(tmpdir(),'qazipro-shift-sql-'));
try{
 const file=join(temp,'rollback.sql');await writeFile(file,process.argv.includes('--deployed')?'begin;\n'+checks+'\nrollback;':migration.replace(/commit;\s*$/,checks+'\nrollback;'));
 const result=execFileSync('cmd.exe',['/d','/s','/c',`npx --offline supabase db query --file ${file} --linked --project-ref jzisqjvroxodvmqxzsob --output json`],{encoding:'utf8',timeout:120000,maxBuffer:2e6,stdio:['ignore','pipe','pipe']});
 if(!result.includes('DESKTOP_DATABASE_CHECKS_PASSED'))throw Error('Missing test completion');
 console.log('PASS staging shift open, cash replay, close/count/difference, empty shift, immutable close, RBAC, branch isolation and previous order/refund/inventory checks; rolled back.');
}catch(error){console.error(error.stderr?.toString()??error.message);process.exitCode=1}
finally{await rm(temp,{recursive:true,force:true})}
