// Fixed isolated PostgreSQL target. Never uses Supabase production configuration.
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const database=process.argv[2]??'qa_targeted_verified'
assert.match(database,/^qa_targeted_[a-z_]+$/,'Use a fresh isolated QA database, never production')
const args=['-h','127.0.0.1','-p','55439','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At']
function query(sql) { return new Promise(resolve=>{ const process=spawn('psql',[...args,'-c',sql],{windowsHide:true});let out='';process.stdout.on('data',v=>out+=v);process.stderr.on('data',()=>{});process.on('error',()=>resolve({code:1,out:''}));process.on('close',code=>resolve({code,out:out.trim()})) }) }
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',b='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',business='11111111-1111-4111-8111-111111111111'
const setup=await query(`insert into auth.users(id,email,email_confirmed_at) values('${a}','race-a@example.test',now()),('${b}','race-b@example.test',now());insert into public.staff_memberships(business_id,user_id,role) values('${business}','${a}','OWNER'),('${business}','${b}','OWNER');insert into public.invoice_settings(business_id,business_name) values('${business}','Italian Pizza') on conflict do nothing;`)
assert.equal(setup.code,0,'isolated concurrency fixtures')
const races=await Promise.all([[a,'race-a@example.test'],[b,'race-b@example.test']].map(([id,email])=>query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${id}',true);select public.save_staff_by_email('${business}','${email}','STAFF',true,array[]::text[]);commit;`)))
assert.equal(races.filter(r=>r.code===0).length,1,'Exactly one simultaneous owner demotion may succeed')
const owner=await query(`select user_id from public.staff_memberships where business_id='${business}' and role='OWNER' and is_active`)
assert.ok(owner.out===a||owner.out===b,'Exactly one active owner remains')
const draft=JSON.stringify({branch_id:'22222222-2222-4222-8222-222222222222',customer_name:'Concurrency QA',lines:[{description:'QA line',quantity:1,unit_price:100}]})
const results=await Promise.all(Array.from({length:20},()=>query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${owner.out}',true);select public.save_invoice('${business}','${draft}'::jsonb);commit;`)))
assert.equal(results.filter(r=>r.code===0).length,20,'All simultaneous invoice saves succeed')
const count=await query(`select count(*)||':'||count(distinct invoice_number) from public.invoices where customer_name='Concurrency QA'`)
assert.equal(count.out,'20:20','Invoice numbers must remain unique')
console.log('PASS: concurrent last-owner protection and 20 collision-free simultaneous invoice numbers (isolated database only)')
