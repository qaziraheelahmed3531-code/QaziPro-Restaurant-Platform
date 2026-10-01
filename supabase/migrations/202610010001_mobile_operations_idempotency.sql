begin;

-- Mobile retries must resolve the first operation, never create a second order,
-- payment or delivery transition after an uncertain network response.
create table public.mobile_operation_receipts (
  operation_id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_kind text not null check (operation_kind in ('WAITER_ORDER','RIDER_ACCEPT','RIDER_COMPLETE','RIDER_PROBLEM')),
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index mobile_operation_receipts_actor_created_idx on public.mobile_operation_receipts(actor_id,created_at desc);
alter table public.mobile_operation_receipts enable row level security;

create or replace function public.mobile_waiter_order(p_operation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.mobile_operation_receipts; outcome jsonb; target public.orders;
begin
  if p_operation_id is null or auth.uid() is null then raise exception 'A valid mobile operation is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into saved from public.mobile_operation_receipts where operation_id=p_operation_id;
  if found then
    if saved.actor_id<>auth.uid() or saved.operation_kind<>'WAITER_ORDER' then raise exception 'Mobile operation conflict.' using errcode='42501'; end if;
    return saved.result||jsonb_build_object('idempotent',true);
  end if;
  outcome:=public.create_waiter_table_order(p_payload);
  select * into target from public.orders where id=(outcome->>'id')::uuid;
  if not found or not public.staff_can_access_branch(target.business_id,target.branch_id)
    or not public.has_permission(target.business_id,'waiter.use') then
    raise exception 'Waiter order confirmation failed.' using errcode='42501';
  end if;
  insert into public.mobile_operation_receipts(operation_id,business_id,branch_id,actor_id,operation_kind,result)
  values(p_operation_id,target.business_id,target.branch_id,auth.uid(),'WAITER_ORDER',outcome);
  return outcome||jsonb_build_object('idempotent',false);
end;
$$;

create or replace function public.mobile_rider_transition(
  p_operation_id uuid,p_order_id uuid,p_action text,p_cash_received boolean default false,p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.mobile_operation_receipts; outcome jsonb; target public.orders; kind text;
begin
  if p_operation_id is null or p_order_id is null or auth.uid() is null or p_action not in ('ACCEPT','COMPLETE','PROBLEM') then
    raise exception 'A valid rider operation is required.' using errcode='22023';
  end if;
  kind:=case p_action when 'ACCEPT' then 'RIDER_ACCEPT' when 'COMPLETE' then 'RIDER_COMPLETE' else 'RIDER_PROBLEM' end;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into saved from public.mobile_operation_receipts where operation_id=p_operation_id;
  if found then
    if saved.actor_id<>auth.uid() or saved.operation_kind<>kind then raise exception 'Mobile operation conflict.' using errcode='42501'; end if;
    return saved.result||jsonb_build_object('idempotent',true);
  end if;
  if p_action='ACCEPT' then outcome:=public.accept_rider_delivery(p_order_id);
  elsif p_action='COMPLETE' then outcome:=public.complete_rider_delivery(p_order_id,coalesce(p_cash_received,false));
  else outcome:=public.fail_rider_delivery(p_order_id,p_reason); end if;
  select * into target from public.orders where id=p_order_id;
  if not found or target.rider_id<>auth.uid() then raise exception 'Rider delivery confirmation failed.' using errcode='42501'; end if;
  insert into public.mobile_operation_receipts(operation_id,business_id,branch_id,actor_id,operation_kind,result)
  values(p_operation_id,target.business_id,target.branch_id,auth.uid(),kind,outcome);
  return outcome||jsonb_build_object('idempotent',false);
end;
$$;

alter table public.restaurant_table_service_requests
  add column if not exists request_type text not null default 'CALL_WAITER';
alter table public.restaurant_table_service_requests
  drop constraint if exists restaurant_table_service_requests_request_type_check;
alter table public.restaurant_table_service_requests
  add constraint restaurant_table_service_requests_request_type_check check(request_type in ('CALL_WAITER','REQUEST_BILL'));
drop index if exists public.restaurant_table_service_requests_one_open;
create unique index restaurant_table_service_requests_one_open
  on public.restaurant_table_service_requests(table_id,request_type)
  where status in ('PENDING','ACKNOWLEDGED');

create or replace function public.request_table_service(p_business_id uuid,p_token text,p_request_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.restaurant_tables; call_record public.restaurant_table_service_requests;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' or p_request_type not in ('CALL_WAITER','REQUEST_BILL') then
    raise exception 'Table service unavailable' using errcode='22023';
  end if;
  select table_record.* into target from public.restaurant_tables table_record
    where table_record.business_id=p_business_id and table_record.public_token=p_token for update;
  if not found or not exists(select 1 from public.resolve_public_table(p_business_id,p_token)) or not exists(
    select 1 from public.branches branch where branch.id=target.branch_id and branch.business_id=p_business_id and branch.waiter_call_enabled
  ) then raise exception 'Table service unavailable' using errcode='22023'; end if;
  select * into call_record from public.restaurant_table_service_requests
    where table_id=target.id and request_type=p_request_type and status in ('PENDING','ACKNOWLEDGED') limit 1;
  if found then return jsonb_build_object('id',call_record.id,'status',call_record.status,'requestType',call_record.request_type,'alreadyOpen',true); end if;
  if exists(select 1 from public.restaurant_table_service_requests
    where table_id=target.id and request_type=p_request_type and created_at>now()-interval '2 minutes') then
    raise exception 'Please wait before requesting table service again' using errcode='P0001';
  end if;
  insert into public.restaurant_table_service_requests(business_id,branch_id,table_id,request_type)
    values(p_business_id,target.branch_id,target.id,p_request_type) returning * into call_record;
  return jsonb_build_object('id',call_record.id,'status',call_record.status,'requestType',call_record.request_type,'alreadyOpen',false);
end;
$$;

revoke all on table public.mobile_operation_receipts from public,anon,authenticated;
revoke all on function public.mobile_waiter_order(uuid,jsonb),public.mobile_rider_transition(uuid,uuid,text,boolean,text),public.request_table_service(uuid,text,text) from public,anon;
grant execute on function public.mobile_waiter_order(uuid,jsonb),public.mobile_rider_transition(uuid,uuid,text,boolean,text) to authenticated;
grant execute on function public.request_table_service(uuid,text,text) to anon,authenticated;

commit;
