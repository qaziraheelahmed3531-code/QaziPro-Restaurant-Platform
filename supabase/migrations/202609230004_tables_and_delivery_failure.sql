begin;

create table if not exists public.restaurant_tables(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null check(char_length(btrim(code)) between 1 and 40),
  name text not null check(char_length(btrim(name)) between 1 and 80),
  seats integer not null default 4 check(seats between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id,code),
  unique(business_id,branch_id,id)
);
create index if not exists restaurant_tables_branch_idx on public.restaurant_tables(branch_id,is_active,name);
create trigger restaurant_tables_updated_at before update on public.restaurant_tables for each row execute function public.set_updated_at();

create or replace function public.protect_open_restaurant_table()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.is_active and not new.is_active and exists(select 1 from public.restaurant_table_sessions session where session.table_id=old.id and session.status='OPEN') then
    raise exception 'Close the active bill before deactivating this table.' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger protect_open_restaurant_table before update of is_active on public.restaurant_tables for each row execute function public.protect_open_restaurant_table();

create table if not exists public.restaurant_table_sessions(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'OPEN' check(status in ('OPEN','SETTLED','CANCELLED')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists restaurant_table_one_open_session_idx on public.restaurant_table_sessions(table_id) where status='OPEN';
create index if not exists restaurant_table_sessions_branch_idx on public.restaurant_table_sessions(branch_id,status,opened_at desc);
create trigger restaurant_table_sessions_updated_at before update on public.restaurant_table_sessions for each row execute function public.set_updated_at();

alter table public.restaurant_tables enable row level security;
alter table public.restaurant_table_sessions enable row level security;
grant select,insert,update on public.restaurant_tables to authenticated;
grant select on public.restaurant_table_sessions to authenticated;

create policy restaurant_tables_read on public.restaurant_tables for select to authenticated using(
  public.staff_can_access_branch(business_id,branch_id)
  and (public.has_permission(business_id,'waiter.use') or public.has_permission(business_id,'settings.manage'))
);
create policy restaurant_tables_manage on public.restaurant_tables for all to authenticated
using(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'settings.manage'))
with check(public.staff_can_access_branch(business_id,branch_id) and public.has_permission(business_id,'settings.manage'));
create policy restaurant_table_sessions_read on public.restaurant_table_sessions for select to authenticated using(
  public.staff_can_access_branch(business_id,branch_id)
  and (opened_by=auth.uid() or public.has_permission(business_id,'orders.read'))
);

create or replace function public.waiter_table_dashboard(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target_business uuid;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.has_permission(target_business,'waiter.use') or not public.staff_can_access_branch(target_business,p_branch_id) then
    raise exception 'Waiter access denied for this restaurant.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.name) from (
    select table_item.id,table_item.code,table_item.name,table_item.seats,table_item.is_active,
      session.id session_id,session.order_id,order_record.order_number,order_record.total,order_record.status order_status,order_record.payment_status
    from public.restaurant_tables table_item
    left join public.restaurant_table_sessions session on session.table_id=table_item.id and session.status='OPEN'
    left join public.orders order_record on order_record.id=session.order_id
    where table_item.branch_id=p_branch_id and table_item.is_active
  ) row_data),'[]'::jsonb);
end;
$$;

create or replace function public.create_waiter_table_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare table_record public.restaurant_tables; existing_session public.restaurant_table_sessions; order_result jsonb;
begin
  begin
    select * into table_record from public.restaurant_tables where id=(p_payload->>'tableId')::uuid for update;
  exception when invalid_text_representation then
    raise exception 'Select a valid active table.' using errcode='22023';
  end;
  if not found or not table_record.is_active
    or not public.staff_can_access_branch(table_record.business_id,table_record.branch_id)
    or not public.has_permission(table_record.business_id,'waiter.use') then
    raise exception 'Select a valid active table.' using errcode='42501';
  end if;
  select * into existing_session from public.restaurant_table_sessions where table_id=table_record.id and status='OPEN' for update;
  if found then raise exception 'This table already has an open bill (%).',existing_session.order_id using errcode='23505'; end if;
  order_result:=public.create_waiter_pos_order(
    (p_payload-'tableId')||jsonb_build_object('branchId',table_record.branch_id,'tableReference',table_record.name)
  );
  insert into public.restaurant_table_sessions(business_id,branch_id,table_id,order_id,opened_by)
  values(table_record.business_id,table_record.branch_id,table_record.id,(order_result->>'id')::uuid,auth.uid());
  return order_result||jsonb_build_object('tableId',table_record.id,'tableName',table_record.name);
end;
$$;

create or replace function public.release_restaurant_table_session()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('DELIVERED','CANCELLED') and old.status<>new.status then
    update public.restaurant_table_sessions set status=case when new.status='DELIVERED' then 'SETTLED' else 'CANCELLED' end,closed_at=now()
    where order_id=new.id and status='OPEN';
  end if;
  return new;
end;
$$;
drop trigger if exists release_restaurant_table_session on public.orders;
create trigger release_restaurant_table_session after update of status on public.orders for each row execute function public.release_restaurant_table_session();

alter table public.orders add column if not exists delivery_failed_at timestamptz,add column if not exists delivery_failure_reason text;

create or replace function public.fail_rider_delivery(p_order_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target public.orders; safe_reason text:=nullif(left(btrim(p_reason),240),'');
begin
  if safe_reason is null then raise exception 'Enter a delivery failure reason.' using errcode='22023'; end if;
  select * into target from public.orders where id=p_order_id and rider_id=auth.uid() for update;
  if not found or target.status<>'OUT_FOR_DELIVERY' or not public.has_permission(target.business_id,'rider.use')
    or not public.staff_can_access_branch(target.business_id,target.branch_id) then
    raise exception 'Active rider delivery was not found.' using errcode='42501';
  end if;
  update public.orders set status='CANCELLED',delivery_failed_at=now(),delivery_failure_reason=safe_reason where id=target.id;
  update public.rider_live_locations set is_active=false where order_id=target.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.business_id,auth.uid(),'RIDER_DELIVERY_FAILED','orders',target.id::text,jsonb_build_object('reason',safe_reason));
  return jsonb_build_object('id',target.id,'orderNumber',target.order_number,'status','CANCELLED','failureReason',safe_reason);
end;
$$;

revoke all on function public.waiter_table_dashboard(uuid),public.create_waiter_table_order(jsonb),public.release_restaurant_table_session(),public.fail_rider_delivery(uuid,text),public.protect_open_restaurant_table() from public,anon;
grant execute on function public.waiter_table_dashboard(uuid),public.create_waiter_table_order(jsonb),public.fail_rider_delivery(uuid,text) to authenticated;

commit;
