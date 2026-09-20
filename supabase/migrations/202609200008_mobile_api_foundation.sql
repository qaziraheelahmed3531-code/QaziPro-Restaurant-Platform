begin;

-- Customer data remains owned by the authenticated user, but mobile clients
-- also need an explicit restaurant scope. Legacy address rows are preserved;
-- rows that already reference a delivery area are backfilled safely.
alter table public.customer_addresses
  add column if not exists business_id uuid references public.businesses(id) on delete cascade,
  add column if not exists branch_id uuid references public.branches(id) on delete cascade;

update public.customer_addresses address
set branch_id=area.branch_id,
    business_id=branch.business_id
from public.delivery_areas area
join public.branches branch on branch.id=area.branch_id
where address.delivery_area_id=area.id
  and (address.business_id is null or address.branch_id is null);

alter table public.customer_addresses
  drop constraint if exists customer_addresses_customer_id_label_key;
alter table public.customer_addresses
  add constraint customer_addresses_customer_business_label_key unique(customer_id,business_id,label);
create index if not exists customer_addresses_customer_business_created_idx
  on public.customer_addresses(customer_id,business_id,created_at desc,id desc);

create or replace function public.guard_customer_address_scope()
returns trigger language plpgsql set search_path=public as $$
declare area_branch uuid;
begin
  if new.business_id is null or new.branch_id is null then
    raise exception 'Restaurant and branch are required for a saved address.' using errcode='22023';
  end if;
  if not exists(select 1 from public.branches branch where branch.id=new.branch_id and branch.business_id=new.business_id and branch.is_active) then
    raise exception 'Address branch does not belong to this restaurant.' using errcode='22023';
  end if;
  if new.delivery_area_id is not null then
    select branch_id into area_branch from public.delivery_areas where id=new.delivery_area_id and is_active;
    if area_branch is null or area_branch<>new.branch_id then
      raise exception 'Delivery area does not belong to this branch.' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists customer_address_scope_guard on public.customer_addresses;
create trigger customer_address_scope_guard before insert or update on public.customer_addresses
for each row execute function public.guard_customer_address_scope();

drop policy if exists own_addresses_all on public.customer_addresses;
drop policy if exists own_addresses_read on public.customer_addresses;
drop policy if exists own_addresses_insert on public.customer_addresses;
drop policy if exists own_addresses_update on public.customer_addresses;
drop policy if exists own_addresses_delete on public.customer_addresses;
create policy own_addresses_read on public.customer_addresses for select to authenticated
using(customer_id=auth.uid());
create policy own_addresses_insert on public.customer_addresses for insert to authenticated
with check(customer_id=auth.uid() and business_id is not null and branch_id is not null);
create policy own_addresses_update on public.customer_addresses for update to authenticated
using(customer_id=auth.uid())
with check(customer_id=auth.uid() and business_id is not null and branch_id is not null);
create policy own_addresses_delete on public.customer_addresses for delete to authenticated
using(customer_id=auth.uid());

create or replace function public.set_customer_default_address(p_business_id uuid,p_address_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare customer uuid:=auth.uid();
begin
  if customer is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from public.customer_addresses where id=p_address_id and customer_id=customer and business_id=p_business_id) then
    raise exception 'Address not found.' using errcode='P0002';
  end if;
  update public.customer_addresses set is_default=false
  where customer_id=customer and business_id=p_business_id and is_default;
  update public.customer_addresses set is_default=true where id=p_address_id and customer_id=customer and business_id=p_business_id;
end;
$$;
revoke all on function public.set_customer_default_address(uuid,uuid) from public,anon;
grant execute on function public.set_customer_default_address(uuid,uuid) to authenticated;

-- Favourites are scoped explicitly so a white-label app never returns another
-- restaurant's saved products for the same Supabase identity.
alter table public.customer_favourites
  add column if not exists business_id uuid references public.businesses(id) on delete cascade;
update public.customer_favourites favourite
set business_id=product.business_id
from public.products product
where product.id=favourite.product_id and favourite.business_id is null;
alter table public.customer_favourites alter column business_id set not null;
create index if not exists customer_favourites_user_business_created_idx
  on public.customer_favourites(user_id,business_id,created_at desc,id desc);

create or replace function public.guard_customer_favourite_scope()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.products product where product.id=new.product_id and product.business_id=new.business_id and product.is_active) then
    raise exception 'Product does not belong to this restaurant.' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists customer_favourite_scope_guard on public.customer_favourites;
create trigger customer_favourite_scope_guard before insert or update on public.customer_favourites
for each row execute function public.guard_customer_favourite_scope();

-- One installation can be associated with one customer per restaurant. A
-- logout disables/deletes only that association and never touches another
-- restaurant or another device owned by the same customer.
create table public.customer_device_tokens (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check(char_length(device_id) between 8 and 200),
  platform text not null check(platform in ('android','ios')),
  push_token text not null check(char_length(push_token) between 20 and 4096),
  app_version text check(app_version is null or char_length(app_version)<=40),
  locale text check(locale is null or char_length(locale)<=20),
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,customer_id,device_id)
);
create unique index customer_device_tokens_business_token_idx
  on public.customer_device_tokens(business_id,push_token);
create index customer_device_tokens_delivery_idx
  on public.customer_device_tokens(business_id,customer_id,is_enabled,last_seen_at desc);
create trigger customer_device_tokens_updated_at before update on public.customer_device_tokens
for each row execute function public.set_updated_at();
alter table public.customer_device_tokens enable row level security;
create policy customer_device_tokens_own_all on public.customer_device_tokens for all to authenticated
using(customer_id=auth.uid()) with check(customer_id=auth.uid());
grant select,insert,update,delete on public.customer_device_tokens to authenticated;

create or replace function public.register_customer_device(
  p_business_id uuid,p_device_id text,p_platform text,p_push_token text,
  p_app_version text default null,p_locale text default null
) returns public.customer_device_tokens
language plpgsql security definer set search_path=public as $$
declare customer uuid:=auth.uid(); result public.customer_device_tokens;
begin
  if customer is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from public.businesses where id=p_business_id and is_active) then raise exception 'Restaurant unavailable.' using errcode='P0002'; end if;
  if char_length(coalesce(p_device_id,'')) not between 8 and 200
     or p_platform not in ('android','ios')
     or char_length(coalesce(p_push_token,'')) not between 20 and 4096
     or char_length(coalesce(p_app_version,''))>40
     or char_length(coalesce(p_locale,''))>20 then
    raise exception 'Invalid device registration.' using errcode='22023';
  end if;
  delete from public.customer_device_tokens
  where business_id=p_business_id and push_token=p_push_token
    and (customer_id<>customer or device_id<>p_device_id);
  insert into public.customer_device_tokens(business_id,customer_id,device_id,platform,push_token,app_version,locale,is_enabled,last_seen_at)
  values(p_business_id,customer,p_device_id,p_platform,p_push_token,nullif(p_app_version,''),nullif(p_locale,''),true,now())
  on conflict(business_id,customer_id,device_id) do update set
    platform=excluded.platform,push_token=excluded.push_token,app_version=excluded.app_version,
    locale=excluded.locale,is_enabled=true,last_seen_at=now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.register_customer_device(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.register_customer_device(uuid,text,text,text,text,text) to authenticated;

-- Provider-neutral transactional outbox. No client role can read or mutate it;
-- a future FCM/APNs worker consumes PENDING records with service credentials.
create table public.customer_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  event_type text not null check(event_type in ('ORDER_STATUS_CHANGED','SYSTEM')),
  title text not null check(char_length(title) between 1 and 160),
  message text not null check(char_length(message) between 1 and 500),
  payload jsonb not null default '{}',
  status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  attempts integer not null default 0 check(attempts>=0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,dedupe_key)
);
create index customer_notification_outbox_pending_idx
  on public.customer_notification_outbox(status,available_at,created_at)
  where status in ('PENDING','FAILED');
create trigger customer_notification_outbox_updated_at before update on public.customer_notification_outbox
for each row execute function public.set_updated_at();
alter table public.customer_notification_outbox enable row level security;
revoke all on public.customer_notification_outbox from public,anon,authenticated;

create or replace function public.enqueue_customer_order_status_push()
returns trigger language plpgsql security definer set search_path=public as $$
declare target public.orders;
begin
  select * into target from public.orders where id=new.order_id;
  if target.customer_id is null then return new; end if;
  insert into public.customer_notification_outbox(
    business_id,branch_id,customer_id,order_id,event_type,title,message,payload,dedupe_key
  ) values(
    target.business_id,target.branch_id,target.customer_id,target.id,'ORDER_STATUS_CHANGED',
    'Order '||replace(target.status::text,'_',' '),
    target.order_number||' is now '||lower(replace(target.status::text,'_',' '))||'.',
    jsonb_build_object('orderId',target.id,'orderNumber',target.order_number,'status',target.status,'branchId',target.branch_id),
    'order-status-'||target.id||'-'||target.status::text
  ) on conflict(business_id,dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists customer_order_status_push_outbox on public.order_status_history;
create trigger customer_order_status_push_outbox after insert on public.order_status_history
for each row execute function public.enqueue_customer_order_status_push();

commit;
