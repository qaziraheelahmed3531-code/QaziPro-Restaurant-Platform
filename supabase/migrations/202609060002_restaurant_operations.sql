begin;

-- Extend the existing commerce records without breaking the storefront contract.
alter table public.categories add column if not exists is_featured boolean not null default false;
alter table public.products add column if not exists sku text;
alter table public.products add column if not exists seo_title text;
alter table public.products add column if not exists seo_description text;
create unique index if not exists products_business_sku_idx on public.products(business_id, lower(sku)) where sku is not null;
alter table public.hero_banners add column if not exists mobile_image_url text;
alter table public.site_settings add column if not exists tagline text;
alter table public.site_settings add column if not exists contact_text text;
alter table public.site_settings add column if not exists receipt_footer text not null default 'Thank you for ordering from Italian Pizza.';
alter table public.branches add column if not exists online_ordering_enabled boolean not null default true;
alter table public.branches add column if not exists minimum_prep_minutes integer not null default 20 check (minimum_prep_minutes between 0 and 240);
alter table public.delivery_rules add column if not exists maximum_distance_km numeric(7,2) check (maximum_distance_km is null or maximum_distance_km > 0);

alter table public.orders add column if not exists token_number integer;
alter table public.orders add column if not exists business_date date;
alter table public.orders add column if not exists channel text not null default 'WEBSITE' check (channel in ('WEBSITE','POS','INTEGRATION'));
alter table public.orders add column if not exists operational_order_type text check (operational_order_type is null or operational_order_type in ('DELIVERY','PICKUP','TAKEAWAY','DINE_IN'));
alter table public.orders add column if not exists client_reference text;
alter table public.orders add column if not exists order_notes text;
alter table public.orders add column if not exists tax integer not null default 0 check (tax >= 0);
alter table public.orders add column if not exists confirmed_at timestamptz;
alter table public.orders add column if not exists preparing_at timestamptz;
alter table public.orders add column if not exists ready_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
create unique index if not exists orders_business_client_reference_idx on public.orders(business_id, client_reference) where client_reference is not null;
create index if not exists orders_business_channel_created_idx on public.orders(business_id, channel, created_at desc);
create index if not exists orders_branch_business_date_token_idx on public.orders(branch_id, business_date, token_number);
create index if not exists orders_phone_search_idx on public.orders(business_id, customer_phone);

create table public.business_operating_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  new_order_sound boolean not null default true,
  prep_warning_minutes integer not null default 15 check (prep_warning_minutes between 1 and 240),
  prep_late_minutes integer not null default 25 check (prep_late_minutes between 1 and 360),
  updated_at timestamptz not null default now(),
  check (prep_late_minutes > prep_warning_minutes)
);

create table public.print_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  receipt_width_mm integer not null default 80 check (receipt_width_mm in (58,80)),
  auto_print_receipt boolean not null default false,
  print_kitchen_ticket boolean not null default true,
  show_prices_on_kitchen_ticket boolean not null default false,
  receipt_footer text not null default 'Thank you for ordering from Italian Pizza.',
  copies integer not null default 1 check (copies between 1 and 5),
  updated_at timestamptz not null default now()
);

create table public.daily_token_sequences (
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  next_value integer not null default 1 check (next_value > 0),
  primary key (branch_id, business_date)
);

create table public.register_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  closed_by uuid references auth.users(id) on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  opening_cash integer not null check (opening_cash >= 0),
  expected_cash integer,
  counted_cash integer check (counted_cash is null or counted_cash >= 0),
  difference integer,
  notes text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index register_one_open_user_branch_idx on public.register_shifts(branch_id, opened_by) where status = 'OPEN';
create index register_shifts_business_opened_idx on public.register_shifts(business_id, opened_at desc);

create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  shift_id uuid not null references public.register_shifts(id) on delete restrict,
  movement_type text not null check (movement_type in ('CASH_IN','CASH_OUT')),
  amount integer not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 2 and 300),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.pos_held_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  held_by uuid not null references auth.users(id) on delete cascade,
  label text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pos_held_orders_staff_idx on public.pos_held_orders(held_by, created_at desc);

create table public.payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null,
  environment text not null default 'TEST' check (environment in ('TEST','LIVE')),
  is_enabled boolean not null default false,
  public_label text,
  safe_config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider),
  check (not (safe_config ?| array['secret','api_key','private_key']))
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  shift_id uuid references public.register_shifts(id) on delete set null,
  provider text not null,
  payment_method text not null,
  provider_transaction_id text,
  idempotency_key text,
  amount integer not null check (amount >= 0),
  currency text not null default 'PKR',
  status text not null check (status in ('UNPAID','PENDING','AUTHORIZED','PAID','FAILED','CANCELLED','PARTIALLY_REFUNDED','REFUNDED')),
  failure_reason text,
  metadata_safe jsonb not null default '{}',
  authorized_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id),
  unique (business_id, idempotency_key)
);
create index payments_business_created_idx on public.payment_transactions(business_id, created_at desc);
create index payments_order_idx on public.payment_transactions(order_id);
create index payments_provider_transaction_idx on public.payment_transactions(provider_transaction_id) where provider_transaction_id is not null;

create table public.payment_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  payment_id uuid references public.payment_transactions(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  signature_verified boolean not null default false,
  payload_safe jsonb not null default '{}',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  payment_id uuid not null references public.payment_transactions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount integer not null check (amount > 0),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SUCCEEDED','FAILED')),
  provider_refund_id text,
  requested_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index refunds_business_created_idx on public.refunds(business_id, created_at desc);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  sku text,
  unit text not null check (unit in ('kg','g','litre','ml','piece','pack')),
  current_stock numeric(14,3) not null default 0,
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  cost_per_unit integer not null default 0 check (cost_per_unit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, name)
);
create unique index ingredients_branch_sku_idx on public.ingredients(branch_id, lower(sku)) where sku is not null;
create index ingredients_low_stock_idx on public.ingredients(branch_id, current_stock, minimum_stock) where is_active;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  modifier_option_id uuid references public.modifier_options(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((product_id is not null)::integer + (modifier_option_id is not null)::integer = 1)
);
create index recipes_product_idx on public.recipes(product_id) where product_id is not null;
create index recipes_modifier_idx on public.recipes(modifier_option_id) where modifier_option_id is not null;

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_number text,
  status text not null default 'DRAFT' check (status in ('DRAFT','ORDERED','RECEIVED','CANCELLED')),
  purchase_date date not null default current_date,
  total integer not null default 0 check (total >= 0),
  notes text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  received_by uuid references auth.users(id) on delete restrict,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_business_date_idx on public.purchases(business_id, purchase_date desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost integer not null check (unit_cost >= 0),
  line_total integer generated always as (round(quantity * unit_cost)) stored,
  created_at timestamptz not null default now()
);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  movement_type text not null check (movement_type in ('PURCHASE','SALE_CONSUMPTION','WASTAGE','ADJUSTMENT','RETURN','TRANSFER')),
  quantity_delta numeric(14,3) not null check (quantity_delta <> 0),
  unit_cost integer,
  reference_type text,
  reference_id text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_movements_ingredient_created_idx on public.stock_movements(ingredient_id, created_at desc);
create index stock_movements_business_created_idx on public.stock_movements(business_id, created_at desc);

create table public.wastage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  reason text not null check (reason in ('SPOILED','DAMAGED','PREPARATION_WASTE','EXPIRED','OTHER')),
  notes text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.inventory_consumptions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  consumed_at timestamptz not null default now()
);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 2 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  notification_type text not null check (notification_type in ('NEW_ORDER','LOW_STOCK','FAILED_PAYMENT','REFUND','SYSTEM')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  dedupe_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_business_unread_idx on public.notifications(business_id, is_read, created_at desc);
create unique index notifications_active_dedupe_idx on public.notifications(business_id, dedupe_key) where dedupe_key is not null and not is_read;

-- Granular capabilities are database authority for navigation and mutations.
insert into public.admin_permissions(code, description) values
  ('dashboard.view','View operational dashboard'),('pos.use','Create counter sales'),('kds.use','Operate kitchen display'),
  ('register.manage','Open and reconcile cash shifts'),('inventory.read','Read inventory and costing'),
  ('inventory.manage','Manage stock, recipes and purchases'),('reports.read','Read business reports'),
  ('payments.read','Read payment transactions'),('payments.refund','Record permitted refunds'),
  ('notifications.read','Read and manage operational notifications'),('settings.manage','Manage operational settings')
on conflict (code) do update set description=excluded.description;

insert into public.admin_role_permissions(role, permission_code)
select role_name::public.staff_role, permission_code from (values
  ('OWNER','dashboard.view'),('OWNER','pos.use'),('OWNER','kds.use'),('OWNER','register.manage'),('OWNER','inventory.read'),('OWNER','inventory.manage'),('OWNER','reports.read'),('OWNER','payments.read'),('OWNER','payments.refund'),('OWNER','notifications.read'),('OWNER','settings.manage'),
  ('MANAGER','dashboard.view'),('MANAGER','pos.use'),('MANAGER','kds.use'),('MANAGER','register.manage'),('MANAGER','inventory.read'),('MANAGER','inventory.manage'),('MANAGER','reports.read'),('MANAGER','payments.read'),('MANAGER','payments.refund'),('MANAGER','notifications.read'),('MANAGER','settings.manage'),
  ('CASHIER','dashboard.view'),('CASHIER','pos.use'),('CASHIER','register.manage'),('CASHIER','orders.manage'),('CASHIER','customers.read'),('CASHIER','payments.read'),('CASHIER','notifications.read'),
  ('KITCHEN','kds.use'),('KITCHEN','orders.manage'),('KITCHEN','inventory.read'),('KITCHEN','notifications.read'),
  ('STAFF','dashboard.view'),('STAFF','orders.manage'),('STAFF','notifications.read')
) permissions(role_name, permission_code)
on conflict do nothing;

create or replace function public.has_permission(target_business uuid, requested_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.staff_memberships membership
    left join public.admin_role_permissions role_permission on role_permission.role=membership.role
    where membership.business_id=target_business and membership.user_id=auth.uid() and membership.is_active
      and (membership.role::text='OWNER' or role_permission.permission_code=requested_permission)
  );
$$;
revoke all on function public.has_permission(uuid,text) from public;
grant execute on function public.has_permission(uuid,text) to authenticated;

create or replace function public.next_daily_token(target_branch uuid, target_date date)
returns integer language plpgsql security definer set search_path=public as $$
declare result integer;
begin
  insert into public.daily_token_sequences(branch_id,business_date,next_value) values(target_branch,target_date,2)
  on conflict(branch_id,business_date) do update set next_value=public.daily_token_sequences.next_value+1
  returning next_value-1 into result;
  return result;
end; $$;
revoke all on function public.next_daily_token(uuid,date) from public,anon,authenticated;

create or replace function public.assign_order_token()
returns trigger language plpgsql security definer set search_path=public as $$
declare business_timezone text;
begin
  select business.timezone into business_timezone from public.branches branch join public.businesses business on business.id=branch.business_id where branch.id=new.branch_id;
  new.business_date := coalesce(new.business_date,(now() at time zone coalesce(business_timezone,'Asia/Karachi'))::date);
  new.token_number := coalesce(new.token_number,public.next_daily_token(new.branch_id,new.business_date));
  new.operational_order_type := coalesce(new.operational_order_type,new.service_mode::text);
  return new;
end; $$;
drop trigger if exists order_assign_token on public.orders;
create trigger order_assign_token before insert on public.orders for each row execute function public.assign_order_token();

create or replace function public.validate_delivery_distance()
returns trigger language plpgsql set search_path=public as $$
declare maximum numeric;
begin
  if new.service_mode='DELIVERY' then
    select maximum_distance_km into maximum from public.delivery_rules where branch_id=new.branch_id;
    if maximum is not null and (new.distance_km is null or new.distance_km>maximum) then raise exception 'Delivery address is outside the configured service radius.' using errcode='22023'; end if;
  end if;
  return new;
end $$;
drop trigger if exists order_delivery_distance on public.orders;
create trigger order_delivery_distance before insert or update of distance_km,branch_id on public.orders for each row execute function public.validate_delivery_distance();

create or replace function public.enforce_order_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.status = new.status then return new; end if;
  if not (
    (old.status='RECEIVED' and new.status in ('CONFIRMED','CANCELLED')) or
    (old.status='CONFIRMED' and new.status in ('PREPARING','CANCELLED')) or
    (old.status='PREPARING' and new.status in ('READY','CANCELLED')) or
    (old.status='READY' and new.status in ('OUT_FOR_DELIVERY','DELIVERED','CANCELLED')) or
    (old.status='OUT_FOR_DELIVERY' and new.status in ('DELIVERED','CANCELLED'))
  ) then raise exception 'Invalid order status transition: % to %',old.status,new.status using errcode='22023'; end if;
  if new.status='CONFIRMED' then new.confirmed_at=coalesce(new.confirmed_at,now()); end if;
  if new.status='PREPARING' then new.preparing_at=coalesce(new.preparing_at,now()); end if;
  if new.status='READY' then new.ready_at=coalesce(new.ready_at,now()); end if;
  if new.status='DELIVERED' then new.delivered_at=coalesce(new.delivered_at,now()); end if;
  if new.status='CANCELLED' then new.cancelled_at=coalesce(new.cancelled_at,now()); end if;
  return new;
end; $$;
drop trigger if exists order_valid_transition on public.orders;
create trigger order_valid_transition before update of status on public.orders for each row execute function public.enforce_order_transition();

create or replace function public.open_register_shift(p_branch_id uuid,p_opening_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; target_business uuid;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.has_permission(target_business,'register.manage') then raise exception 'Register access denied.' using errcode='42501'; end if;
  if p_opening_cash < 0 then raise exception 'Opening cash cannot be negative.' using errcode='22023'; end if;
  insert into public.register_shifts(business_id,branch_id,opened_by,opening_cash,notes) values(target_business,p_branch_id,auth.uid(),p_opening_cash,nullif(left(btrim(p_notes),500),'')) returning * into result;
  return result;
end; $$;

create or replace function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount integer,p_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare result public.cash_movements; shift_record public.register_shifts;
begin
  select * into shift_record from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.has_permission(shift_record.business_id,'register.manage') then raise exception 'Open register shift not found.' using errcode='42501'; end if;
  insert into public.cash_movements(business_id,shift_id,movement_type,amount,reason,created_by)
  values(shift_record.business_id,p_shift_id,p_type,p_amount,left(btrim(p_reason),300),auth.uid()) returning * into result;
  return result;
end; $$;

create or replace function public.close_register_shift(p_shift_id uuid,p_counted_cash integer,p_notes text default null)
returns public.register_shifts language plpgsql security definer set search_path=public as $$
declare result public.register_shifts; cash_sales integer; cash_in integer; cash_out integer; cash_refunds integer; expected integer;
begin
  select * into result from public.register_shifts where id=p_shift_id and status='OPEN' for update;
  if not found or not public.has_permission(result.business_id,'register.manage') then raise exception 'Open register shift not found.' using errcode='42501'; end if;
  select coalesce(sum(amount),0) into cash_sales from public.payment_transactions where shift_id=p_shift_id and payment_method='CASH' and status='PAID';
  select coalesce(sum(amount) filter(where movement_type='CASH_IN'),0),coalesce(sum(amount) filter(where movement_type='CASH_OUT'),0) into cash_in,cash_out from public.cash_movements where shift_id=p_shift_id;
  select coalesce(sum(refund.amount),0) into cash_refunds from public.refunds refund join public.payment_transactions payment on payment.id=refund.payment_id where payment.shift_id=p_shift_id and payment.payment_method='CASH' and refund.status='SUCCEEDED';
  expected:=result.opening_cash+cash_sales+cash_in-cash_out-cash_refunds;
  update public.register_shifts set status='CLOSED',closed_by=auth.uid(),closed_at=now(),expected_cash=expected,counted_cash=p_counted_cash,difference=p_counted_cash-expected,notes=coalesce(nullif(left(btrim(p_notes),500),''),notes) where id=p_shift_id returning * into result;
  return result;
end; $$;

create or replace function public.create_pos_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare target_business uuid; shift_record public.register_shifts; order_result jsonb; target_order public.orders; received integer; existing public.orders;
begin
  select business_id into target_business from public.branches where id=(p_payload->>'branchId')::uuid and is_active;
  if target_business is null or not public.has_permission(target_business,'pos.use') then raise exception 'POS access denied.' using errcode='42501'; end if;
  if nullif(p_payload->>'clientReference','') is not null then
    select * into existing from public.orders where business_id=target_business and client_reference=p_payload->>'clientReference';
    if found then return jsonb_build_object('id',existing.id,'orderNumber',existing.order_number,'tokenNumber',existing.token_number,'total',existing.total,'change',0,'idempotent',true); end if;
  end if;
  select * into shift_record from public.register_shifts where id=(p_payload->>'shiftId')::uuid and branch_id=(p_payload->>'branchId')::uuid and status='OPEN' for update;
  if not found then raise exception 'Open a register shift before taking a counter sale.' using errcode='22023'; end if;
  order_result:=public.create_order_authoritative(jsonb_build_object(
    'branchId',p_payload->>'branchId','serviceMode','PICKUP','paymentMethod','CASH_ON_DELIVERY',
    'customerName',coalesce(nullif(left(btrim(p_payload->>'customerName'),120),''),'Counter guest'),
    'customerPhone',coalesce(nullif(left(btrim(p_payload->>'customerPhone'),40),''),'Counter'),
    'deliveryInstructions',nullif(left(btrim(p_payload->>'notes'),500),''),'items',p_payload->'items'
  ),null);
  update public.orders set channel='POS',operational_order_type=coalesce(nullif(p_payload->>'orderType',''),'TAKEAWAY'),client_reference=nullif(p_payload->>'clientReference',''),order_notes=nullif(left(btrim(p_payload->>'notes'),500),''),status='CONFIRMED'
  where id=(order_result->>'id')::uuid returning * into target_order;
  received:=coalesce((p_payload->>'cashReceived')::integer,0);
  if received < target_order.total then raise exception 'Cash received is less than the order total.' using errcode='22023'; end if;
  insert into public.payment_transactions(business_id,branch_id,order_id,shift_id,provider,payment_method,idempotency_key,amount,status,paid_at)
  values(target_business,target_order.branch_id,target_order.id,shift_record.id,'CASH','CASH','pos-'||target_order.id,target_order.total,'PAID',now());
  update public.orders set payment_status='PAID',payment_reference='CASH' where id=target_order.id;
  return (order_result-'guestTrackingToken')||jsonb_build_object('tokenNumber',target_order.token_number,'change',received-target_order.total,'channel','POS');
end; $$;

create or replace function public.adjust_inventory(p_ingredient_id uuid,p_quantity_delta numeric,p_reason text)
returns public.ingredients language plpgsql security definer set search_path=public as $$
declare result public.ingredients;
begin
  select * into result from public.ingredients where id=p_ingredient_id for update;
  if not found or not public.has_permission(result.business_id,'inventory.manage') then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  if p_quantity_delta=0 or nullif(btrim(p_reason),'') is null then raise exception 'Quantity and reason are required.' using errcode='22023'; end if;
  update public.ingredients set current_stock=current_stock+p_quantity_delta where id=p_ingredient_id returning * into result;
  insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) values(result.business_id,result.branch_id,result.id,'ADJUSTMENT',p_quantity_delta,'MANUAL',gen_random_uuid()::text,left(btrim(p_reason),500),auth.uid());
  return result;
end; $$;

create or replace function public.record_wastage(p_ingredient_id uuid,p_quantity numeric,p_reason text,p_notes text default null)
returns public.wastage language plpgsql security definer set search_path=public as $$
declare ingredient public.ingredients; result public.wastage;
begin
  select * into ingredient from public.ingredients where id=p_ingredient_id for update;
  if not found or not public.has_permission(ingredient.business_id,'inventory.manage') then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  if p_quantity<=0 then raise exception 'Wastage quantity must be positive.' using errcode='22023'; end if;
  insert into public.wastage(business_id,branch_id,ingredient_id,quantity,reason,notes,recorded_by) values(ingredient.business_id,ingredient.branch_id,ingredient.id,p_quantity,p_reason,nullif(left(btrim(p_notes),500),''),auth.uid()) returning * into result;
  update public.ingredients set current_stock=current_stock-p_quantity where id=ingredient.id;
  insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,reference_type,reference_id,note,created_by) values(ingredient.business_id,ingredient.branch_id,ingredient.id,'WASTAGE',-p_quantity,'WASTAGE',result.id::text,p_notes,auth.uid());
  return result;
end; $$;

create or replace function public.receive_purchase(p_purchase_id uuid)
returns public.purchases language plpgsql security definer set search_path=public as $$
declare result public.purchases; item record; computed_total integer:=0;
begin
  select * into result from public.purchases where id=p_purchase_id for update;
  if not found or not public.has_permission(result.business_id,'inventory.manage') then raise exception 'Purchase access denied.' using errcode='42501'; end if;
  if result.status='RECEIVED' then return result; end if;
  if result.status not in ('DRAFT','ORDERED') then raise exception 'This purchase cannot be received.' using errcode='22023'; end if;
  for item in select * from public.purchase_items where purchase_id=p_purchase_id loop
    computed_total:=computed_total+item.line_total;
    update public.ingredients set current_stock=current_stock+item.quantity,cost_per_unit=item.unit_cost where id=item.ingredient_id;
    insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,unit_cost,reference_type,reference_id,created_by) values(result.business_id,result.branch_id,item.ingredient_id,'PURCHASE',item.quantity,item.unit_cost,'PURCHASE',result.id::text,auth.uid());
  end loop;
  if computed_total=0 then raise exception 'Add at least one purchase item.' using errcode='22023'; end if;
  update public.purchases set status='RECEIVED',total=computed_total,received_by=auth.uid(),received_at=now() where id=p_purchase_id returning * into result;
  return result;
end; $$;

create or replace function public.consume_order_inventory()
returns trigger language plpgsql security definer set search_path=public as $$
declare claimed uuid; recipe_line record;
begin
  if new.status<>'DELIVERED' or old.status='DELIVERED' then return new; end if;
  insert into public.inventory_consumptions(order_id,business_id) values(new.id,new.business_id) on conflict do nothing returning order_id into claimed;
  if claimed is null then return new; end if;
  for recipe_line in
    select recipe.ingredient_id,ingredient.branch_id,sum(recipe.quantity*item.quantity) quantity
    from public.order_items item join public.recipes recipe on recipe.product_id=item.product_id join public.ingredients ingredient on ingredient.id=recipe.ingredient_id
    where item.order_id=new.id and ingredient.branch_id=new.branch_id group by recipe.ingredient_id,ingredient.branch_id
    union all
    select recipe.ingredient_id,ingredient.branch_id,sum(recipe.quantity*item.quantity) quantity
    from public.order_items item join public.order_item_modifiers chosen on chosen.order_item_id=item.id join public.recipes recipe on recipe.modifier_option_id=chosen.modifier_option_id join public.ingredients ingredient on ingredient.id=recipe.ingredient_id
    where item.order_id=new.id and ingredient.branch_id=new.branch_id group by recipe.ingredient_id,ingredient.branch_id
  loop
    update public.ingredients set current_stock=current_stock-recipe_line.quantity where id=recipe_line.ingredient_id;
    insert into public.stock_movements(business_id,branch_id,ingredient_id,movement_type,quantity_delta,reference_type,reference_id,note) values(new.business_id,recipe_line.branch_id,recipe_line.ingredient_id,'SALE_CONSUMPTION',-recipe_line.quantity,'ORDER',new.id::text,'Automatic recipe consumption');
  end loop;
  return new;
end; $$;
drop trigger if exists order_inventory_consumption on public.orders;
create trigger order_inventory_consumption after update of status on public.orders for each row execute function public.consume_order_inventory();

create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key) values(new.business_id,'NEW_ORDER','New '||lower(new.channel)||' order',new.order_number||' · Token '||lpad(new.token_number::text,3,'0'),'orders',new.id::text,'order-'||new.id);
  return new;
end; $$;
drop trigger if exists order_notification on public.orders;
create trigger order_notification after insert on public.orders for each row execute function public.notify_new_order();

create or replace function public.sync_low_stock_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.is_active and new.current_stock<=new.minimum_stock then
    insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key) values(new.business_id,'LOW_STOCK','Low stock: '||new.name,new.current_stock||' '||new.unit||' remaining','ingredients',new.id::text,'stock-'||new.id) on conflict do nothing;
  elsif new.current_stock>new.minimum_stock then
    update public.notifications set is_read=true,read_at=now() where business_id=new.business_id and dedupe_key='stock-'||new.id and not is_read;
  end if;
  return new;
end; $$;
drop trigger if exists ingredient_low_stock_notification on public.ingredients;
create trigger ingredient_low_stock_notification after insert or update of current_stock,minimum_stock,is_active on public.ingredients for each row execute function public.sync_low_stock_notification();

create or replace function public.record_manual_refund(p_payment_id uuid,p_amount integer,p_reason text)
returns public.refunds language plpgsql security definer set search_path=public as $$
declare payment public.payment_transactions; result public.refunds; refunded_total integer;
begin
  select * into payment from public.payment_transactions where id=p_payment_id for update;
  if not found or not public.has_permission(payment.business_id,'payments.refund') then raise exception 'Refund access denied.' using errcode='42501'; end if;
  if payment.provider<>'CASH' then raise exception 'This provider requires its configured refund adapter.' using errcode='0A000'; end if;
  select coalesce(sum(amount),0) into refunded_total from public.refunds where payment_id=payment.id and status='SUCCEEDED';
  if p_amount<=0 or refunded_total+p_amount>payment.amount then raise exception 'Refund amount is invalid.' using errcode='22023'; end if;
  insert into public.refunds(business_id,payment_id,order_id,amount,reason,status,requested_by,completed_at) values(payment.business_id,payment.id,payment.order_id,p_amount,left(btrim(p_reason),500),'SUCCEEDED',auth.uid(),now()) returning * into result;
  refunded_total:=refunded_total+p_amount;
  update public.payment_transactions set status=case when refunded_total=amount then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,refunded_at=now() where id=payment.id;
  update public.orders set payment_status=case when refunded_total=payment.amount then 'REFUNDED'::public.payment_status else 'PARTIALLY_REFUNDED'::public.payment_status end where id=payment.order_id;
  insert into public.notifications(business_id,notification_type,title,message,entity_type,entity_id,dedupe_key) values(payment.business_id,'REFUND','Refund recorded','Refund recorded for payment '||payment.id,'refunds',result.id::text,'refund-'||result.id);
  return result;
end; $$;

create or replace function public.restaurant_report(p_business_id uuid,p_start timestamptz,p_end timestamptz,p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; bucket text;
begin
  if not public.has_permission(p_business_id,'reports.read') and not public.has_permission(p_business_id,'dashboard.view') then raise exception 'Reporting access denied.' using errcode='42501'; end if;
  if p_end<=p_start or p_end-p_start>interval '370 days' then raise exception 'Invalid report range.' using errcode='22023'; end if;
  bucket:=case when p_end-p_start<=interval '2 days' then 'hour' when p_end-p_start<=interval '62 days' then 'day' else 'month' end;
  with scoped_orders as (
    select * from public.orders where business_id=p_business_id and created_at>=p_start and created_at<p_end and status<>'CANCELLED' and (p_branch_id is null or branch_id=p_branch_id)
  ), refund_total as (
    select coalesce(sum(r.amount),0)::integer value from public.refunds r join scoped_orders o on o.id=r.order_id where r.status='SUCCEEDED'
  ) select jsonb_build_object(
    'summary',jsonb_build_object(
      'grossSales',coalesce(sum(o.subtotal),0),'discounts',coalesce(sum(o.discount),0),'deliveryFees',coalesce(sum(o.delivery_fee),0),'tax',coalesce(sum(o.tax),0),
      'refunds',(select value from refund_total),'netSales',coalesce(sum(o.total),0)-(select value from refund_total),'orderCount',count(o.id),
      'averageOrder',case when count(o.id)=0 then 0 else round(avg(o.total)) end
    ),
    'trend',(select coalesce(jsonb_agg(row_to_json(t) order by t.bucket), '[]') from (select date_trunc(bucket,created_at) bucket,sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) t),
    'channels',(select coalesce(jsonb_agg(row_to_json(c) order by c.value desc),'[]') from (select channel label,sum(total)::integer value,count(*)::integer orders from scoped_orders group by channel) c),
    'payments',(select coalesce(jsonb_agg(row_to_json(p) order by p.value desc),'[]') from (select payment_method label,sum(amount)::integer value,count(*)::integer transactions from public.payment_transactions where business_id=p_business_id and created_at>=p_start and created_at<p_end and status in ('PAID','PARTIALLY_REFUNDED','REFUNDED') and (p_branch_id is null or branch_id=p_branch_id) group by payment_method) p),
    'topProducts',(select coalesce(jsonb_agg(row_to_json(product_row) order by product_row.net_sales desc),'[]') from (select item.product_name label,sum(item.quantity)::integer quantity,sum(item.line_total)::integer gross_sales,sum(item.line_total)::integer net_sales from public.order_items item join scoped_orders o on o.id=item.order_id group by item.product_name order by 4 desc limit 10) product_row),
    'topCategories',(select coalesce(jsonb_agg(row_to_json(category_row) order by category_row.value desc),'[]') from (select coalesce(category.name,'Deals') label,sum(item.line_total)::integer value from public.order_items item join scoped_orders o on o.id=item.order_id left join public.products product on product.id=item.product_id left join public.categories category on category.id=product.category_id group by category.name) category_row),
    'peakHours',(select coalesce(jsonb_agg(row_to_json(hour_row) order by hour_row."hour"),'[]') from (select extract(hour from created_at at time zone coalesce((select timezone from public.businesses where id=p_business_id),'Asia/Karachi'))::integer as "hour",sum(total)::integer value,count(*)::integer orders from scoped_orders group by 1) hour_row),
    'customers',jsonb_build_object('new',count(distinct o.customer_id) filter(where o.customer_id is not null),'returning',0),
    'inventory',(select jsonb_build_object('stockValue',coalesce(sum(current_stock*cost_per_unit),0),'lowStock',count(*) filter(where current_stock<=minimum_stock),'activeIngredients',count(*)) from public.ingredients where business_id=p_business_id and is_active and (p_branch_id is null or branch_id=p_branch_id)),
    'shifts',(select jsonb_build_object('count',count(*),'difference',coalesce(sum(difference),0)) from public.register_shifts where business_id=p_business_id and opened_at>=p_start and opened_at<p_end and (p_branch_id is null or branch_id=p_branch_id))
  ) into result from scoped_orders o;
  return result;
end; $$;

-- Updated timestamps and compact audit coverage.
do $$ declare table_name text; begin
  foreach table_name in array array['business_operating_settings','print_settings','register_shifts','pos_held_orders','payment_provider_settings','payment_transactions','suppliers','ingredients','recipes','purchases','customer_notes'] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()',table_name,table_name);
  end loop;
end $$;

create or replace function public.record_operational_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare data jsonb; target_business uuid;
begin
  data:=coalesce(to_jsonb(new),to_jsonb(old)); target_business:=nullif(data->>'business_id','')::uuid;
  if target_business is not null and auth.uid() is not null then
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata) values(target_business,auth.uid(),upper(tg_op),tg_table_name,coalesce(data->>'id',data->>'order_id'),jsonb_build_object('source','operations-trigger'));
  end if;
  return coalesce(new,old);
end $$;
do $$ declare table_name text; begin
  foreach table_name in array array['business_operating_settings','print_settings','register_shifts','cash_movements','pos_held_orders','payment_provider_settings','payment_transactions','refunds','suppliers','ingredients','recipes','purchases','purchase_items','stock_movements','wastage','customer_notes'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.record_operational_change()',table_name,table_name);
  end loop;
end $$;

-- RLS: all operational data is staff-only and permission checked server-side.
do $$ declare table_name text; begin
  foreach table_name in array array['business_operating_settings','print_settings','daily_token_sequences','register_shifts','cash_movements','pos_held_orders','payment_provider_settings','payment_transactions','payment_events','refunds','suppliers','ingredients','recipes','purchases','purchase_items','stock_movements','wastage','inventory_consumptions','customer_notes','notifications'] loop
    execute format('alter table public.%I enable row level security',table_name);
  end loop;
end $$;

create policy operating_settings_manage on public.business_operating_settings for all to authenticated using(public.has_permission(business_id,'settings.manage')) with check(public.has_permission(business_id,'settings.manage'));
create policy print_settings_manage on public.print_settings for all to authenticated using(public.has_permission(business_id,'settings.manage')) with check(public.has_permission(business_id,'settings.manage'));
create policy register_read on public.register_shifts for select to authenticated using(public.has_permission(business_id,'register.manage') or public.has_permission(business_id,'reports.read'));
create policy cash_read on public.cash_movements for select to authenticated using(public.has_permission(business_id,'register.manage') or public.has_permission(business_id,'reports.read'));
create policy held_orders_manage on public.pos_held_orders for all to authenticated using(held_by=auth.uid() and public.has_permission(business_id,'pos.use')) with check(held_by=auth.uid() and public.has_permission(business_id,'pos.use'));
create policy providers_read on public.payment_provider_settings for select to authenticated using(public.has_permission(business_id,'payments.read'));
create policy providers_manage on public.payment_provider_settings for all to authenticated using(public.has_permission(business_id,'settings.manage')) with check(public.has_permission(business_id,'settings.manage'));
create policy payments_read on public.payment_transactions for select to authenticated using(public.has_permission(business_id,'payments.read'));
create policy payment_events_read on public.payment_events for select to authenticated using(public.has_permission(business_id,'payments.read'));
create policy refunds_read on public.refunds for select to authenticated using(public.has_permission(business_id,'payments.read'));
create policy suppliers_manage on public.suppliers for all to authenticated using(public.has_permission(business_id,'inventory.manage')) with check(public.has_permission(business_id,'inventory.manage'));
create policy ingredients_read on public.ingredients for select to authenticated using(public.has_permission(business_id,'inventory.read'));
create policy ingredients_manage on public.ingredients for all to authenticated using(public.has_permission(business_id,'inventory.manage')) with check(public.has_permission(business_id,'inventory.manage'));
create policy recipes_read on public.recipes for select to authenticated using(public.has_permission(business_id,'inventory.read'));
create policy recipes_manage on public.recipes for all to authenticated using(public.has_permission(business_id,'inventory.manage')) with check(public.has_permission(business_id,'inventory.manage'));
create policy purchases_manage on public.purchases for all to authenticated using(public.has_permission(business_id,'inventory.manage')) with check(public.has_permission(business_id,'inventory.manage'));
create policy purchase_items_manage on public.purchase_items for all to authenticated using(public.has_permission(business_id,'inventory.manage')) with check(public.has_permission(business_id,'inventory.manage'));
create policy stock_read on public.stock_movements for select to authenticated using(public.has_permission(business_id,'inventory.read'));
create policy wastage_read on public.wastage for select to authenticated using(public.has_permission(business_id,'inventory.read'));
create policy consumptions_read on public.inventory_consumptions for select to authenticated using(public.has_permission(business_id,'inventory.read'));
create policy customer_notes_manage on public.customer_notes for all to authenticated using(public.has_permission(business_id,'customers.read')) with check(public.has_permission(business_id,'customers.read') and created_by=auth.uid());
create policy notifications_manage on public.notifications for all to authenticated using(public.has_permission(business_id,'notifications.read')) with check(public.has_permission(business_id,'notifications.read'));

drop policy if exists orders_staff_update on public.orders;
create policy orders_staff_update on public.orders for update to authenticated using(public.has_permission(business_id,'orders.manage')) with check(public.has_permission(business_id,'orders.manage'));
drop policy if exists own_orders_read on public.orders;
create policy own_orders_read on public.orders for select using(customer_id=auth.uid() or public.has_permission(business_id,'orders.manage') or public.has_permission(business_id,'reports.read'));
drop policy if exists own_order_items_read on public.order_items;
create policy own_order_items_read on public.order_items for select using(exists(select 1 from public.orders order_record where order_record.id=order_id and (order_record.customer_id=auth.uid() or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'reports.read'))));
drop policy if exists own_order_modifiers_read on public.order_item_modifiers;
create policy own_order_modifiers_read on public.order_item_modifiers for select using(exists(select 1 from public.order_items item join public.orders order_record on order_record.id=item.order_id where item.id=order_item_id and (order_record.customer_id=auth.uid() or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'reports.read'))));
drop policy if exists own_order_history_read on public.order_status_history;
create policy own_order_history_read on public.order_status_history for select using(exists(select 1 from public.orders order_record where order_record.id=order_id and (order_record.customer_id=auth.uid() or public.has_permission(order_record.business_id,'orders.manage') or public.has_permission(order_record.business_id,'reports.read'))));

grant select,insert,update,delete on public.business_operating_settings,public.print_settings,public.pos_held_orders,public.payment_provider_settings,public.suppliers,public.ingredients,public.recipes,public.purchases,public.purchase_items,public.customer_notes,public.notifications to authenticated;
grant select on public.register_shifts,public.cash_movements,public.payment_transactions,public.payment_events,public.refunds,public.stock_movements,public.wastage,public.inventory_consumptions to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant execute on function public.open_register_shift(uuid,integer,text),public.record_cash_movement(uuid,text,integer,text),public.close_register_shift(uuid,integer,text),public.create_pos_order(jsonb),public.adjust_inventory(uuid,numeric,text),public.record_wastage(uuid,numeric,text,text),public.receive_purchase(uuid),public.record_manual_refund(uuid,integer,text),public.restaurant_report(uuid,timestamptz,timestamptz,uuid) to authenticated;

insert into public.business_operating_settings(business_id) select id from public.businesses on conflict do nothing;
insert into public.print_settings(business_id,receipt_footer) select id,coalesce((select receipt_footer from public.site_settings where business_id=businesses.id),'Thank you for ordering from Italian Pizza.') from public.businesses on conflict do nothing;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

commit;
