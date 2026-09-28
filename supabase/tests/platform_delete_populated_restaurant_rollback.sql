-- STAGING ONLY. Existing catalogue/orders are exercised inside one rollback;
-- no deletion or audit entry survives and no storage API is called.
begin;
do $$
declare
  actor uuid;
  restaurant_id uuid;
  target_slug text;
  other_id uuid;
  other_branches bigint;
  tenant_table record;
  remaining bigint;
begin
  select s.user_id into actor from public.platform_staff s
    join public.platform_staff_roles a on a.staff_user_id=s.user_id
    join public.platform_roles r on r.id=a.role_id
    where s.status='ACTIVE' and s.access_revoked_at is null and r.key='PLATFORM_OWNER' limit 1;
  select b.id,b.slug into restaurant_id,target_slug from public.businesses b
    where b.slug='italian-pizza' and exists(select 1 from public.orders o where o.business_id=b.id)
      and exists(select 1 from public.products p where p.business_id=b.id);
  select id into other_id from public.businesses where slug='kings-cafe';
  if actor is null or restaurant_id is null or other_id is null then
    raise exception 'Expected staging owner, populated restaurant and control tenant unavailable';
  end if;
  select count(*) into other_branches from public.branches where business_id=other_id;
  -- Spoofing the marker alone must not authorize any restaurant access.
  perform set_config('qazipro.permanent_delete_business',restaurant_id::text,true);
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  execute 'set local role authenticated';
  if public.platform_permanent_delete_scope(restaurant_id) then raise exception 'Unassigned actor accepted a teardown marker'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if public.platform_permanent_delete_scope(other_id) then raise exception 'Teardown marker crossed tenants'; end if;
  perform set_config('qazipro.permanent_delete_business','',true);
  if public.platform_permanent_delete_scope(restaurant_id) then raise exception 'Ordinary owner operation incorrectly entered teardown mode'; end if;
  if not public.platform_delete_restaurant(restaurant_id,target_slug,'Populated staging deletion rollback acceptance') then
    raise exception 'Populated restaurant deletion failed';
  end if;
  if coalesce(current_setting('qazipro.permanent_delete_business',true),'')<>'' then
    raise exception 'Teardown marker leaked into a subsequent operation';
  end if;
  execute 'reset role';
  for tenant_table in
    select c.relname from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid
    where n.nspname='public' and c.relkind='r' and a.attname='business_id' and not a.attisdropped
  loop
    execute format('select count(*) from public.%I where business_id=$1',tenant_table.relname) into remaining using restaurant_id;
    if remaining<>0 then raise exception 'Tenant rows remain in %',tenant_table.relname; end if;
  end loop;
  if exists(select 1 from public.businesses where id=restaurant_id) then raise exception 'Business row remains'; end if;
  if not exists(select 1 from public.businesses where id=other_id)
    or (select count(*) from public.branches where business_id=other_id)<>other_branches then
    raise exception 'Other restaurant was modified';
  end if;
  if not exists(select 1 from public.platform_audit_logs
    where action='RESTAURANT_PERMANENTLY_DELETED' and target_id=restaurant_id::text and business_id is null) then
    raise exception 'Durable platform deletion audit missing';
  end if;
end;
$$;
rollback;
