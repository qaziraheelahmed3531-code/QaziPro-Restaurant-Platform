begin;

create table public.staff_device_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check(char_length(device_id) between 8 and 200),
  platform text not null check(platform in ('android','ios')),
  push_token text not null check(char_length(push_token) between 20 and 4096),
  app_version text check(app_version is null or char_length(app_version)<=40),
  locale text check(locale is null or char_length(locale)<=20),
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,staff_id,device_id)
);
create unique index staff_device_tokens_business_token_idx on public.staff_device_tokens(business_id,push_token);
create index staff_device_tokens_delivery_idx on public.staff_device_tokens(business_id,branch_id,staff_id,is_enabled,last_seen_at desc);
create trigger staff_device_tokens_updated_at before update on public.staff_device_tokens
for each row execute function public.set_updated_at();
alter table public.staff_device_tokens enable row level security;
create policy staff_device_tokens_own_all on public.staff_device_tokens for all to authenticated
using(staff_id=auth.uid() and public.staff_can_access_branch(business_id,branch_id))
with check(staff_id=auth.uid() and public.staff_can_access_branch(business_id,branch_id));
grant select,insert,update,delete on public.staff_device_tokens to authenticated;

create or replace function public.register_staff_device(
  p_business_id uuid,p_branch_id uuid,p_device_id text,p_platform text,p_push_token text,
  p_app_version text default null,p_locale text default null
) returns public.staff_device_tokens language plpgsql security definer set search_path=public as $$
declare staff uuid:=auth.uid(); result public.staff_device_tokens;
begin
  if staff is null or not public.staff_can_access_branch(p_business_id,p_branch_id) then
    raise exception 'Staff device access denied.' using errcode='42501';
  end if;
  if char_length(coalesce(p_device_id,'')) not between 8 and 200
    or p_platform not in ('android','ios') or char_length(coalesce(p_push_token,'')) not between 20 and 4096
    or char_length(coalesce(p_app_version,''))>40 or char_length(coalesce(p_locale,''))>20 then
    raise exception 'Invalid staff device registration.' using errcode='22023';
  end if;
  delete from public.staff_device_tokens where business_id=p_business_id and push_token=p_push_token
    and (staff_id<>staff or device_id<>p_device_id);
  insert into public.staff_device_tokens(business_id,branch_id,staff_id,device_id,platform,push_token,app_version,locale,is_enabled,last_seen_at)
  values(p_business_id,p_branch_id,staff,p_device_id,p_platform,p_push_token,nullif(p_app_version,''),nullif(p_locale,''),true,now())
  on conflict(business_id,staff_id,device_id) do update set branch_id=excluded.branch_id,platform=excluded.platform,
    push_token=excluded.push_token,app_version=excluded.app_version,locale=excluded.locale,is_enabled=true,last_seen_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.unregister_staff_device(p_business_id uuid,p_device_id text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  update public.staff_device_tokens set is_enabled=false,last_seen_at=now()
    where business_id=p_business_id and staff_id=auth.uid() and device_id=p_device_id;
  return found;
end;
$$;

create table public.staff_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check(event_type in ('NEW_ORDER','TABLE_SERVICE','DELIVERY_READY','SYSTEM')),
  title text not null check(char_length(title) between 1 and 160),
  message text not null check(char_length(message) between 1 and 500),
  payload jsonb not null default '{}',
  delivered_device_ids uuid[] not null default '{}',
  dedupe_key text not null,
  status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0 check(attempts>=0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,staff_id,dedupe_key)
);
create index staff_notification_outbox_pending_idx on public.staff_notification_outbox(status,available_at,created_at)
  where status in ('PENDING','FAILED');
create trigger staff_notification_outbox_updated_at before update on public.staff_notification_outbox
for each row execute function public.set_updated_at();
alter table public.staff_notification_outbox enable row level security;
revoke all on public.staff_notification_outbox from public,anon,authenticated;

create or replace function public.queue_staff_notification(
  p_business_id uuid,p_branch_id uuid,p_role text,p_event_type text,p_title text,p_message text,p_payload jsonb,p_dedupe_key text
) returns integer language plpgsql security definer set search_path=public as $$
declare inserted_count integer;
begin
  insert into public.staff_notification_outbox(business_id,branch_id,staff_id,event_type,title,message,payload,dedupe_key)
  select p_business_id,p_branch_id,membership.user_id,p_event_type,left(p_title,160),left(p_message,500),coalesce(p_payload,'{}'),p_dedupe_key
  from public.staff_memberships membership
  where membership.business_id=p_business_id and membership.is_active
    and (membership.role='OWNER' or membership.role::text=p_role)
    and (membership.role='OWNER' or membership.branch_id=p_branch_id or exists(
      select 1 from public.staff_membership_branches assignment
      where assignment.membership_id=membership.id and assignment.branch_id=p_branch_id and assignment.business_id=p_business_id
    ))
  on conflict(business_id,staff_id,dedupe_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end;
$$;

create or replace function public.notify_mobile_staff_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.queue_staff_notification(new.business_id,new.branch_id,'MANAGER','NEW_ORDER','New order '||new.order_number,
    concat_ws(' · ',new.operational_order_type,new.customer_name,new.total::text),
    jsonb_build_object('screen','admin','orderId',new.id,'orderNumber',new.order_number,'branchId',new.branch_id),
    'order:'||new.id);
  return new;
end;
$$;
drop trigger if exists notify_mobile_staff_order on public.orders;
create trigger notify_mobile_staff_order after insert on public.orders for each row execute function public.notify_mobile_staff_order();

create or replace function public.notify_mobile_table_service()
returns trigger language plpgsql security definer set search_path=public as $$
declare table_name text;
begin
  select name into table_name from public.restaurant_tables where id=new.table_id;
  perform public.queue_staff_notification(new.business_id,new.branch_id,'WAITER','TABLE_SERVICE',
    case new.request_type when 'REQUEST_BILL' then 'Bill requested' else 'Waiter requested' end,
    coalesce(table_name,'Table')||' needs attention',
    jsonb_build_object('screen','waiter','requestId',new.id,'requestType',new.request_type,'branchId',new.branch_id),
    'table-service:'||new.id);
  return new;
end;
$$;
drop trigger if exists notify_mobile_table_service on public.restaurant_table_service_requests;
create trigger notify_mobile_table_service after insert on public.restaurant_table_service_requests
for each row execute function public.notify_mobile_table_service();

create or replace function public.notify_mobile_delivery_ready()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='READY' and old.status is distinct from new.status and new.service_mode='DELIVERY' then
    perform public.queue_staff_notification(new.business_id,new.branch_id,'RIDER','DELIVERY_READY','Delivery ready',
      new.order_number||' is ready for pickup',
      jsonb_build_object('screen','rider','orderId',new.id,'orderNumber',new.order_number,'branchId',new.branch_id),
      'delivery-ready:'||new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists notify_mobile_delivery_ready on public.orders;
create trigger notify_mobile_delivery_ready after update of status on public.orders
for each row execute function public.notify_mobile_delivery_ready();

revoke all on function public.register_staff_device(uuid,uuid,text,text,text,text,text),public.unregister_staff_device(uuid,text),
  public.queue_staff_notification(uuid,uuid,text,text,text,text,jsonb,text) from public,anon;
grant execute on function public.register_staff_device(uuid,uuid,text,text,text,text,text),public.unregister_staff_device(uuid,text) to authenticated;
revoke all on function public.notify_mobile_staff_order(),public.notify_mobile_table_service(),public.notify_mobile_delivery_ready() from public,anon,authenticated;

commit;
