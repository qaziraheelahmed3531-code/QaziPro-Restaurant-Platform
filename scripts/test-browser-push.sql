-- Run only against verified staging. No committed fixtures or provider calls:
-- every subscription, campaign, audit and outbox row below is rolled back.
begin;
create temporary table push_test_context(business_id uuid, branch_id uuid, owner_id uuid, device_id uuid, campaign_id uuid);
grant select on push_test_context to authenticated;
do $$
declare b uuid; br uuid; owner_id uuid; origin text; device uuid; draft jsonb; replay jsonb;
  request_id uuid:=gen_random_uuid(); endpoint text:='https://fcm.googleapis.com/fcm/send/rollback-'||gen_random_uuid(); subscription jsonb;
begin
  select d.business_id,branch.id,m.user_id,'https://'||d.hostname into b,br,owner_id,origin
  from public.business_domains d join public.branches branch on branch.business_id=d.business_id and branch.is_active
  join public.staff_memberships m on m.business_id=d.business_id and m.role='OWNER' and m.is_active
  where d.hostname like '%.staging.qazipro.com'
    and exists(select 1 from public.resolve_storefront_business(d.hostname) r where r.resolved_business_id=d.business_id)
    and exists(select 1 from public.runtime_entitlement_internal(d.business_id,branch.id,'admin.restaurant') where enabled)
  limit 1;
  if b is null then raise exception 'No eligible staging restaurant/owner'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
  subscription:=jsonb_build_object('endpoint',endpoint,'keys',jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22)));
  -- Hide existing recipients from this uncommitted fixture campaign.
  update public.customer_device_tokens set marketing_opt_in=false where business_id=b;
  device:=public.register_browser_device(b,br,owner_id,'rollback-browser-01',subscription,origin,true);
  if public.register_browser_device(b,br,owner_id,'rollback-browser-01',subscription,origin,true)<>device then raise exception 'Registration retry duplicated a device'; end if;
  draft:=public.create_customer_push_broadcast(b,br,'Test notification','Rollback only: never delivered','/orders',request_id);
  replay:=public.create_customer_push_broadcast(b,br,'Test notification','Rollback only: never delivered','/orders',request_id);
  if draft->>'id'<>replay->>'id' or (draft->>'recipientCount')::integer<>1
     or (select count(*) from public.customer_notification_outbox where broadcast_id=(draft->>'id')::uuid)<>1 then raise exception 'Broadcast deduplication failed'; end if;
  if exists(select 1 from public.customer_broadcast_deliveries where broadcast_id=(draft->>'id')::uuid) then raise exception 'Push created an email delivery'; end if;
  begin
    perform public.create_customer_push_broadcast(b,br,'Changed draft','Rollback only: never delivered','/orders',request_id);
    raise exception 'Changed draft reused request key';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.create_customer_push_broadcast(b,br,'Test notification','Rollback only: never delivered','https://wrong-tenant.invalid/',gen_random_uuid());
    raise exception 'Cross-origin destination accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_browser_device(b,gen_random_uuid(),owner_id,'rollback-browser-01',subscription,origin,true);
    raise exception 'Wrong branch accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_browser_device(b,br,owner_id,'rollback-browser-01',subscription,'https://unknown.staging.qazipro.com',true);
    raise exception 'Wrong origin accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.register_browser_device(b,br,owner_id,'rollback-browser-01',subscription||'{"endpoint":"https://127.0.0.1/private"}',origin,true);
    raise exception 'SSRF endpoint accepted';
  exception when sqlstate '22023' then null; end;
  if has_function_privilege('authenticated','public.register_browser_device(uuid,uuid,uuid,text,jsonb,text,boolean)','execute')
     or has_function_privilege('anon','public.create_customer_push_broadcast(uuid,uuid,text,text,text,uuid)','execute') then raise exception 'Unsafe RPC grant'; end if;
  insert into push_test_context values(b,br,owner_id,device,(draft->>'id')::uuid);
end; $$;
set local role authenticated;
do $$
declare ctx record;
begin
  select * into ctx from push_test_context;
  if not exists(select 1 from public.customer_broadcasts where id=ctx.campaign_id) then raise exception 'Owner cannot read own campaign'; end if;
  update public.customer_broadcasts set status='SENT' where id=ctx.campaign_id;
  if found then raise exception 'Client can forge push delivery success'; end if;
  update public.customer_device_tokens set marketing_opt_in=false where id=ctx.device_id;
  if found then raise exception 'Browser device bypassed canonical endpoint'; end if;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}',true);
  if exists(select 1 from public.customer_broadcasts where id=ctx.campaign_id)
     or exists(select 1 from public.customer_device_tokens where id=ctx.device_id) then raise exception 'Unrelated user can read private records'; end if;
  begin
    perform public.create_customer_push_broadcast(ctx.business_id,ctx.branch_id,'Test notification','Unauthorized draft','/',gen_random_uuid());
    raise exception 'Unauthorized broadcast accepted';
  exception when sqlstate '42501' then null; end;
end; $$;
reset role;
rollback;
select 'PASS: browser registration contract, retry deduplication, campaign idempotency, changed-draft denial, hostname/branch/SSRF guards, email separation, RPC grants and RLS. No provider calls; fixtures rolled back.' as result;
