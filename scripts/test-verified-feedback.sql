-- Staging-only invocation. Everything, including trigger side effects, rolls
-- back; no outbox worker can observe these uncommitted fixture orders.
begin;
do $$
declare b uuid; branch uuid; fixture_order_id uuid := gen_random_uuid(); pending_id uuid := gen_random_uuid(); original jsonb; retried jsonb;
begin
  select id,business_id into branch,b from public.branches where is_active limit 1;
  if b is null then raise exception 'No staging branch available'; end if;
  insert into public.orders(id,order_number,business_id,branch_id,service_mode,status,customer_name,customer_phone)
  values(fixture_order_id,'QA-FEEDBACK-'||fixture_order_id,b,branch,'PICKUP','DELIVERED','Transactional feedback fixture','00000000000'),
        (pending_id,'QA-FEEDBACK-'||pending_id,b,branch,'PICKUP','RECEIVED','Transactional feedback fixture','00000000000');
  original := public.submit_verified_order_feedback(b,fixture_order_id,5,'Private test response');
  retried := public.submit_verified_order_feedback(b,fixture_order_id,1,'Retry must not overwrite');
  if original<>retried or (select count(*) from public.customer_order_feedback where order_id=fixture_order_id) <> 1 then raise exception 'Duplicate guard failed'; end if;
  begin
    perform public.submit_verified_order_feedback(gen_random_uuid(),fixture_order_id,5,'');
    raise exception 'Cross-business feedback was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.submit_verified_order_feedback(b,pending_id,5,'');
    raise exception 'Pending-order feedback was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.submit_verified_order_feedback(b,fixture_order_id,6,'');
    raise exception 'Invalid rating was accepted';
  exception when sqlstate '22023' then null; end;
  if has_function_privilege('anon','public.submit_verified_order_feedback(uuid,uuid,integer,text)','execute')
     or has_function_privilege('authenticated','public.submit_verified_order_feedback(uuid,uuid,integer,text)','execute')
     or has_table_privilege('authenticated','public.customer_order_feedback','insert')
     or has_column_privilege('authenticated','public.customer_order_feedback','rating','update') then
    raise exception 'Feedback write privileges too broad';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}',true);
do $$ begin
  if exists(select 1 from public.customer_order_feedback) then raise exception 'Unrelated account can read feedback'; end if;
end; $$;
reset role;
rollback;
select 'PASS: eligibility, rating validation, duplicate protection, cross-business rejection, direct-write privileges and unauthorized RLS. All fixtures rolled back.' as result;
