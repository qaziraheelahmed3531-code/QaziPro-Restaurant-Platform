-- Staging-only smoke test. The entire trial is rolled back; no waiter is alerted.
begin;
do $$
declare target record; other_business uuid; first_call jsonb; repeat_call jsonb;
begin
  select t.business_id,t.branch_id,t.public_token into target
    from public.restaurant_tables t
    where t.is_active and exists (select 1 from public.resolve_public_table(t.business_id,t.public_token))
    limit 1;
  if target.business_id is null then raise exception 'No eligible staging QR table'; end if;
  update public.branches set waiter_call_enabled=true where id=target.branch_id;
  first_call := public.request_table_waiter(target.business_id,target.public_token);
  repeat_call := public.request_table_waiter(target.business_id,target.public_token);
  if first_call->>'status' <> 'PENDING' or repeat_call->>'alreadyOpen' <> 'true' then
    raise exception 'Waiter call deduplication failed';
  end if;
  select id into other_business from public.businesses where id<>target.business_id limit 1;
  if other_business is not null then
    begin
      perform public.request_table_waiter(other_business,target.public_token);
      raise exception 'Cross-restaurant table call was accepted';
    exception when sqlstate '22023' then null;
    end;
  end if;
  if has_function_privilege('anon','public.platform_delete_restaurant(uuid,text,text)','EXECUTE')
    or has_function_privilege('anon','public.respond_to_table_waiter_request(uuid,text)','EXECUTE')
    or has_function_privilege('anon','public.set_branch_waiter_call_enabled(uuid,boolean)','EXECUTE') then
    raise exception 'Anonymous role has an admin mutation privilege';
  end if;
end;
$$;
rollback;
