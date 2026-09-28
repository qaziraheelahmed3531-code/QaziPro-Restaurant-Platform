-- Staging acceptance with an existing authorized membership. All status
-- transitions are rolled back; the external test request remains untouched.
begin;
do $$
declare actor uuid; tenant uuid; branch uuid; call_id uuid; visible integer; result jsonb;
begin
  select m.user_id,m.business_id,r.branch_id,r.id
    into actor,tenant,branch,call_id
    from public.restaurant_table_service_requests r
      join public.staff_memberships m on m.business_id=r.business_id and m.is_active
      join public.business_domains d on d.business_id=r.business_id
      join public.restaurant_tables t on t.id=r.table_id
    where d.hostname in('kings-cafe.staging.qazipro.com','italian-pizza.staging.qazipro.com')
      and r.status='PENDING' and m.role='OWNER' and t.code like 'CALL-QA-%'
    limit 1;
  if actor is null then raise exception 'No eligible staging staff/request pair'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  execute 'set local role authenticated';
  select count(*) into visible from public.restaurant_table_service_requests where id=call_id;
  if visible<>0 then raise exception 'Unassigned actor could see table calls'; end if;
  begin
    perform public.respond_to_table_waiter_request(call_id,'COMPLETE');
    raise exception 'Unassigned actor could complete a waiter request';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  if not public.has_permission(tenant,'waiter.use') or not public.staff_can_access_branch(tenant,branch) then
    raise exception 'Selected staff cannot use waiter portal';
  end if;
  select count(*) into visible from public.restaurant_table_service_requests where id=call_id;
  if visible<>1 then raise exception 'Waiter request hidden by RLS'; end if;
  result:=public.respond_to_table_waiter_request(call_id,'ACKNOWLEDGE');
  if result->>'status'<>'ACKNOWLEDGED' then raise exception 'Acknowledge failed'; end if;
  result:=public.respond_to_table_waiter_request(call_id,'COMPLETE');
  if result->>'status'<>'COMPLETED' then raise exception 'Complete failed'; end if;
end;
$$;
rollback;
