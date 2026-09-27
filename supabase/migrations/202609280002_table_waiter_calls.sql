begin;

alter table public.branches add column if not exists waiter_call_enabled boolean not null default false;

create table public.restaurant_table_service_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid not null,
  status text not null default 'PENDING' check (status in ('PENDING','ACKNOWLEDGED','COMPLETED')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  constraint restaurant_table_service_requests_table_fk
    foreign key (business_id,branch_id,table_id)
    references public.restaurant_tables(business_id,branch_id,id) on delete cascade
);
create unique index restaurant_table_service_requests_one_open
  on public.restaurant_table_service_requests(table_id) where status in ('PENDING','ACKNOWLEDGED');
create index restaurant_table_service_requests_queue
  on public.restaurant_table_service_requests(business_id,branch_id,status,created_at desc);

alter table public.restaurant_table_service_requests enable row level security;
grant select on public.restaurant_table_service_requests to authenticated;
create policy restaurant_table_service_requests_staff_read
  on public.restaurant_table_service_requests for select to authenticated
  using (public.staff_can_access_branch(business_id,branch_id)
    and (public.has_permission(business_id,'waiter.use') or public.has_permission(business_id,'settings.manage')));

create or replace function public.set_branch_waiter_call_enabled(p_branch_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare target_business uuid;
begin
  if p_enabled is null then raise exception 'Invalid setting' using errcode='22023'; end if;
  select business_id into target_business from public.branches where id=p_branch_id for update;
  if target_business is null or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business,'settings.manage') then
    raise exception 'Branch settings access denied' using errcode='42501';
  end if;
  update public.branches set waiter_call_enabled=p_enabled where id=p_branch_id;
  return p_enabled;
end;
$$;
revoke all on function public.set_branch_waiter_call_enabled(uuid,boolean) from public;
revoke all on function public.set_branch_waiter_call_enabled(uuid,boolean) from anon;
grant execute on function public.set_branch_waiter_call_enabled(uuid,boolean) to authenticated;

create or replace function public.request_table_waiter(p_business_id uuid,p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.restaurant_tables; call_record public.restaurant_table_service_requests;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then
    raise exception 'Table unavailable' using errcode='22023';
  end if;
  select t.* into target from public.restaurant_tables t
    where t.business_id=p_business_id and t.public_token=p_token for update;
  if not found or not exists (
    select 1 from public.resolve_public_table(p_business_id,p_token)
  ) or not exists (
    select 1 from public.branches b where b.id=target.branch_id and b.business_id=p_business_id and b.waiter_call_enabled
  ) then raise exception 'Table waiter calls unavailable' using errcode='22023'; end if;
  select * into call_record from public.restaurant_table_service_requests
    where table_id=target.id and status in ('PENDING','ACKNOWLEDGED') limit 1;
  if found then return jsonb_build_object('id',call_record.id,'status',call_record.status,'alreadyOpen',true); end if;
  if exists (select 1 from public.restaurant_table_service_requests
    where table_id=target.id and created_at > now()-interval '2 minutes') then
    raise exception 'Please wait before calling again' using errcode='P0001';
  end if;
  insert into public.restaurant_table_service_requests(business_id,branch_id,table_id)
    values(p_business_id,target.branch_id,target.id) returning * into call_record;
  return jsonb_build_object('id',call_record.id,'status',call_record.status,'alreadyOpen',false);
end;
$$;
revoke all on function public.request_table_waiter(uuid,text) from public;
grant execute on function public.request_table_waiter(uuid,text) to anon,authenticated;

create or replace function public.respond_to_table_waiter_request(p_request_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare call_record public.restaurant_table_service_requests;
begin
  if p_action not in ('ACKNOWLEDGE','COMPLETE') then raise exception 'Invalid action' using errcode='22023'; end if;
  select * into call_record from public.restaurant_table_service_requests where id=p_request_id for update;
  if not found or not public.staff_can_access_branch(call_record.business_id,call_record.branch_id)
    or not public.has_permission(call_record.business_id,'waiter.use') then
    raise exception 'Waiter access denied' using errcode='42501';
  end if;
  if p_action='ACKNOWLEDGE' and call_record.status='PENDING' then
    update public.restaurant_table_service_requests
      set status='ACKNOWLEDGED',acknowledged_at=now(),acknowledged_by=auth.uid()
      where id=p_request_id returning * into call_record;
  elsif p_action='COMPLETE' and call_record.status in ('PENDING','ACKNOWLEDGED') then
    update public.restaurant_table_service_requests
      set status='COMPLETED',completed_at=now(),completed_by=auth.uid()
      where id=p_request_id returning * into call_record;
  end if;
  return jsonb_build_object('id',call_record.id,'status',call_record.status);
end;
$$;
revoke all on function public.respond_to_table_waiter_request(uuid,text) from public;
revoke all on function public.respond_to_table_waiter_request(uuid,text) from anon;
grant execute on function public.respond_to_table_waiter_request(uuid,text) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.restaurant_table_service_requests;
  end if;
exception when duplicate_object then null;
end $$;

commit;
