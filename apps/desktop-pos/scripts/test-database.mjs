// STAGING ONLY: candidate migration and disposable fixture run in one rollback.
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const migration=await readFile(new URL('../../../supabase/migrations/20260930154151_desktop_pos_snapshot_tax_and_access.sql',import.meta.url),'utf8');
const checks=await readFile(new URL('./database-checks.sql',import.meta.url),'utf8');
const temp=await mkdtemp(join(tmpdir(),'qazipro-desktop-sql-'));
try{
 const file=join(temp,'rollback.sql');
 await writeFile(file,process.argv.includes('--deployed')?'begin;\n'+checks+'\nrollback;':migration.replace(/commit;\s*$/,checks+'\nrollback;'));
 const output=execFileSync('cmd.exe',['/d','/s','/c',`npx --offline supabase db query --file ${file} --linked --project-ref jzisqjvroxodvmqxzsob --output json`],{encoding:'utf8',timeout:120000,maxBuffer:2e6,stdio:['ignore','pipe','pipe']});
 if(!output.includes('DESKTOP_DATABASE_CHECKS_PASSED'))throw Error('No completion marker');
 console.log('PASS staging snapshot tax, two-device sales, replay payment, inventory, refund and isolation checks; transaction rolled back.');
}catch(error){console.error(error.stderr?.toString()??error.message);process.exitCode=1}
finally{await rm(temp,{recursive:true,force:true})}
