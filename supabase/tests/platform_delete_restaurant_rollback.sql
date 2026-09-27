-- Staging-only, transactionally rolled-back verification. Never commit a QA
-- deletion here; the real UI requires typed confirmation and an audit reason.
begin;
do $$
declare actor uuid; restaurant_id uuid; target_slug text; deleted boolean;
begin
  select s.user_id into actor from public.platform_staff s
    join public.platform_staff_roles a on a.staff_user_id=s.user_id
    join public.platform_roles r on r.id=a.role_id
    where s.status='ACTIVE' and s.access_revoked_at is null and r.key='PLATFORM_OWNER' limit 1;
  select b.id,b.slug into restaurant_id,target_slug from public.businesses b
    where b.name like 'QA%' and not exists (select 1 from public.orders o where o.business_id=b.id)
    order by b.created_at desc limit 1;
  if actor is null or restaurant_id is null then raise exception 'Staging owner or empty QA tenant unavailable'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  execute 'set local role authenticated';
  begin
    perform public.platform_delete_restaurant(restaurant_id,target_slug,'Transaction rollback acceptance test');
    raise exception 'Unassigned actor was allowed to delete';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin
    perform public.platform_delete_restaurant(restaurant_id,'wrong-restaurant-key','Transaction rollback acceptance test');
    raise exception 'Wrong confirmation key was accepted';
  exception when sqlstate '22023' then null;
  end;
  if not exists(select 1 from public.businesses where id=restaurant_id) then raise exception 'Rejected attempt changed the tenant'; end if;
  deleted:=public.platform_delete_restaurant(restaurant_id,target_slug,'Transaction rollback acceptance test');
  if not deleted or exists(select 1 from public.businesses where id=restaurant_id) then
    raise exception 'Tenant deletion did not complete within the test transaction';
  end if;
  if not exists(select 1 from public.platform_audit_logs audit
    where audit.action='RESTAURANT_PERMANENTLY_DELETED' and audit.target_id=restaurant_id::text and audit.business_id is null) then
    raise exception 'Detached deletion audit event missing';
  end if;
end;
$$;
rollback;
