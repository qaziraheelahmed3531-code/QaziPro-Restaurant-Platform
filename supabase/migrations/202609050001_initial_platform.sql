begin;

create extension if not exists pgcrypto;

create type public.staff_role as enum ('OWNER', 'MANAGER', 'STAFF');
create type public.selection_type as enum ('SINGLE', 'MULTIPLE');
create type public.order_service_mode as enum ('DELIVERY', 'PICKUP');
create type public.order_status as enum ('RECEIVED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
create type public.payment_method as enum ('CASH_ON_DELIVERY', 'ONLINE');
create type public.payment_status as enum ('UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED');
create type public.delivery_rounding_mode as enum ('CEIL');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 120),
  short_description text not null default '',
  phone text,
  whatsapp text,
  email text,
  address text,
  city text not null default 'Tarbela Ghazi',
  currency text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Karachi',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_branding (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  display_name text not null,
  logo_url text,
  footer_logo_url text,
  favicon_url text,
  primary_color text not null default '#a92114' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#e7a81a' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  footer_description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  announcement_enabled boolean not null default true,
  announcement_text text not null default '',
  reviews_enabled boolean not null default true,
  reviews_title text not null default 'Google Reviews',
  reviews_business_name text,
  reviews_widget_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  city text not null,
  phone text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  temporarily_closed boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, day_of_week),
  check (is_closed or (opens_at is not null and closes_at is not null))
);

create table public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  slug text not null,
  name text not null,
  aliases text[] not null default '{}',
  group_name text not null default 'Nearby',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, slug)
);

create table public.delivery_rules (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  free_distance_km numeric(6,2) not null default 5 check (free_distance_km >= 0),
  extra_km_rate integer not null default 100 check (extra_km_rate >= 0),
  rounding_mode public.delivery_rounding_mode not null default 'CEIL',
  origin_latitude numeric(9,6),
  origin_longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  image_url text,
  section_banner_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  slug text not null,
  name text not null,
  description text not null default '',
  base_price integer not null check (base_price >= 0),
  sale_price integer check (sale_price is null or sale_price >= 0),
  old_price integer check (old_price is null or old_price >= 0),
  badge text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index product_one_primary_image on public.product_images(product_id) where is_primary;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price_adjustment integer not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  selection_type public.selection_type not null,
  is_required boolean not null default false,
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer check (max_selections is null or max_selections >= 1),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_selections is null or max_selections >= min_selections)
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price_adjustment integer not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  unique (product_id, modifier_group_id)
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  image_url text,
  deal_price integer not null check (deal_price >= 0),
  old_price integer check (old_price is null or old_price >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, slug),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  product_id uuid references public.products(id),
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  sort_order integer not null default 0
);

create table public.hero_banners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  internal_name text not null,
  image_url text not null,
  alt_text text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.promotional_banners (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  image_url text not null,
  target_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('FIXED', 'PERCENT')),
  discount_value integer not null check (discount_value > 0),
  maximum_discount integer,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  delivery_area_id uuid references public.delivery_areas(id),
  label text not null check (label in ('home', 'work', 'other')),
  city text not null,
  address_line_1 text not null,
  address_line_2 text not null default '',
  landmark text not null default '',
  instructions text not null default '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, label)
);

create table public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.admin_permissions (
  code text primary key,
  description text not null
);

create table public.admin_role_permissions (
  role public.staff_role not null,
  permission_code text not null references public.admin_permissions(code) on delete cascade,
  primary key (role, permission_code)
);

create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  business_id uuid not null references public.businesses(id),
  branch_id uuid not null references public.branches(id),
  customer_id uuid references auth.users(id) on delete set null,
  guest_tracking_hash text,
  service_mode public.order_service_mode not null,
  status public.order_status not null default 'RECEIVED',
  payment_method public.payment_method not null default 'CASH_ON_DELIVERY',
  payment_status public.payment_status not null default 'UNPAID',
  payment_reference text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_area_id uuid references public.delivery_areas(id),
  delivery_area_name text,
  delivery_address text,
  delivery_instructions text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  distance_km numeric(7,2),
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null default 0 check (total >= 0),
  placed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((service_mode = 'PICKUP') or (delivery_area_id is not null and delivery_address is not null))
);

create index orders_business_status_created_idx on public.orders(business_id, status, created_at desc);
create index orders_customer_created_idx on public.orders(customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_base_price integer not null check (unit_base_price >= 0),
  unit_modifier_price integer not null default 0 check (unit_modifier_price >= 0),
  unit_price integer not null check (unit_price >= 0),
  line_total integer not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  check (product_id is not null or deal_id is not null)
);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_group_id uuid references public.modifier_groups(id) on delete set null,
  modifier_option_id uuid references public.modifier_options(id) on delete set null,
  group_name text not null,
  option_name text not null,
  price_adjustment integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create table public.social_links (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  platform text not null,
  url text not null check (url ~ '^https?://'),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integration_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  public_review_widget_id text,
  google_place_id text,
  updated_at timestamptz not null default now(),
  check (public_review_widget_id is null or char_length(public_review_widget_id) <= 200)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index audit_logs_business_created_idx on public.audit_logs(business_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'businesses','business_branding','site_settings','branches','business_hours',
    'delivery_areas','delivery_rules','categories','products','product_variants',
    'modifier_groups','modifier_options','deals','hero_banners','promotional_banners',
    'promotions','profiles','customer_addresses','staff_memberships','orders',
    'social_links','integration_settings'
  ] loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.is_staff(target_business uuid, allowed_roles public.staff_role[] default array['OWNER','MANAGER','STAFF']::public.staff_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_memberships membership
    where membership.business_id = target_business
      and membership.user_id = auth.uid()
      and membership.is_active
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_staff(uuid, public.staff_role[]) from public;
grant execute on function public.is_staff(uuid, public.staff_role[]) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.record_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.order_status_history(order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
    if tg_op = 'UPDATE' and auth.uid() is not null then
      insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
      values (new.business_id, auth.uid(), 'ORDER_STATUS_UPDATED', 'orders', new.id::text, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;
  return new;
end;
$$;

create trigger order_status_recorded after insert or update of status on public.orders for each row execute function public.record_order_status();

create or replace function public.record_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare business uuid;
declare entity text;
declare row_data jsonb;
begin
  row_data := coalesce(to_jsonb(new), to_jsonb(old));
  business := nullif(row_data->>'business_id','')::uuid;
  if business is null and tg_table_name = 'businesses' then business := nullif(row_data->>'id','')::uuid; end if;
  if business is null and nullif(row_data->>'branch_id','') is not null then select b.business_id into business from public.branches b where b.id=(row_data->>'branch_id')::uuid; end if;
  if business is null and nullif(row_data->>'product_id','') is not null then select p.business_id into business from public.products p where p.id=(row_data->>'product_id')::uuid; end if;
  if business is null and nullif(row_data->>'modifier_group_id','') is not null then select g.business_id into business from public.modifier_groups g where g.id=(row_data->>'modifier_group_id')::uuid; end if;
  if business is null and nullif(row_data->>'deal_id','') is not null then select d.business_id into business from public.deals d where d.id=(row_data->>'deal_id')::uuid; end if;
  entity := coalesce(row_data->>'id', row_data->>'business_id', row_data->>'branch_id');
  if business is not null and auth.uid() is not null then
    insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
    values (business, auth.uid(), upper(tg_op), tg_table_name, entity, jsonb_build_object('source', 'database-trigger'));
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['businesses','business_branding','site_settings','branches','business_hours','delivery_areas','delivery_rules','categories','products','product_images','modifier_groups','modifier_options','product_modifier_groups','deals','deal_items','hero_banners','promotional_banners','promotions','social_links','integration_settings','staff_memberships'] loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.record_admin_change()', table_name, table_name);
  end loop;
end;
$$;

alter table public.businesses enable row level security;
alter table public.business_branding enable row level security;
alter table public.site_settings enable row level security;
alter table public.branches enable row level security;
alter table public.business_hours enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.delivery_rules enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifier_options enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.deals enable row level security;
alter table public.deal_items enable row level security;
alter table public.hero_banners enable row level security;
alter table public.promotional_banners enable row level security;
alter table public.promotions enable row level security;
alter table public.profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.order_status_history enable row level security;
alter table public.social_links enable row level security;
alter table public.integration_settings enable row level security;
alter table public.audit_logs enable row level security;

create policy businesses_public_read on public.businesses for select using (is_active or public.is_staff(id));
create policy branding_public_read on public.business_branding for select using (exists(select 1 from public.businesses b where b.id = business_id and (b.is_active or public.is_staff(b.id))));
create policy site_settings_public_read on public.site_settings for select using (exists(select 1 from public.businesses b where b.id = business_id and (b.is_active or public.is_staff(b.id))));
create policy branches_public_read on public.branches for select using (is_active or public.is_staff(business_id));
create policy hours_public_read on public.business_hours for select using (exists(select 1 from public.branches b where b.id = branch_id and (b.is_active or public.is_staff(b.business_id))));
create policy areas_public_read on public.delivery_areas for select using (is_active or exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id)));
create policy rules_public_read on public.delivery_rules for select using (exists(select 1 from public.branches b where b.id = branch_id and (b.is_active or public.is_staff(b.business_id))));
create policy categories_public_read on public.categories for select using (is_active or public.is_staff(business_id));
create policy products_public_read on public.products for select using (is_active or public.is_staff(business_id));
create policy product_images_public_read on public.product_images for select using (exists(select 1 from public.products p where p.id = product_id and (p.is_active or public.is_staff(p.business_id))));
create policy product_variants_public_read on public.product_variants for select using (is_active or exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id)));
create policy modifier_groups_public_read on public.modifier_groups for select using (is_active or public.is_staff(business_id));
create policy modifier_options_public_read on public.modifier_options for select using (is_active or exists(select 1 from public.modifier_groups g where g.id = modifier_group_id and public.is_staff(g.business_id)));
create policy product_groups_public_read on public.product_modifier_groups for select using (exists(select 1 from public.products p where p.id = product_id and (p.is_active or public.is_staff(p.business_id))));
create policy deals_public_read on public.deals for select using (is_active or public.is_staff(business_id));
create policy deal_items_public_read on public.deal_items for select using (exists(select 1 from public.deals d where d.id = deal_id and (d.is_active or public.is_staff(d.business_id))));
create policy hero_public_read on public.hero_banners for select using (is_active or public.is_staff(business_id));
create policy promo_banners_public_read on public.promotional_banners for select using (is_active or public.is_staff(business_id));
create policy social_public_read on public.social_links for select using (is_active or public.is_staff(business_id));
create policy integration_public_read on public.integration_settings for select using (exists(select 1 from public.businesses b where b.id = business_id and (b.is_active or public.is_staff(b.id))));

create policy own_profile_read on public.profiles for select using (
  id = auth.uid()
  or exists(
    select 1 from public.staff_memberships m
    join public.orders o on o.business_id = m.business_id and o.customer_id = profiles.id
    where m.user_id = auth.uid() and m.is_active
  )
);
create policy own_profile_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy own_addresses_all on public.customer_addresses for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy own_orders_read on public.orders for select using (customer_id = auth.uid() or public.is_staff(business_id));
create policy own_order_items_read on public.order_items for select using (exists(select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff(o.business_id))));
create policy own_order_modifiers_read on public.order_item_modifiers for select using (exists(select 1 from public.order_items i join public.orders o on o.id = i.order_id where i.id = order_item_id and (o.customer_id = auth.uid() or public.is_staff(o.business_id))));
create policy own_order_history_read on public.order_status_history for select using (exists(select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff(o.business_id))));
create policy memberships_self_or_owner_read on public.staff_memberships for select using (user_id = auth.uid() or public.is_staff(business_id, array['OWNER']::public.staff_role[]));
create policy audit_staff_read on public.audit_logs for select using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy permissions_authenticated_read on public.admin_permissions for select to authenticated using (true);
create policy role_permissions_authenticated_read on public.admin_role_permissions for select to authenticated using (true);

create policy businesses_staff_update on public.businesses for update to authenticated using (public.is_staff(id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(id, array['OWNER','MANAGER']::public.staff_role[]));
create policy branding_staff_write on public.business_branding for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy site_staff_write on public.site_settings for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy branches_staff_write on public.branches for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy hours_staff_write on public.business_hours for all to authenticated using (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy areas_staff_write on public.delivery_areas for all to authenticated using (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy rules_staff_write on public.delivery_rules for all to authenticated using (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.branches b where b.id = branch_id and public.is_staff(b.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy categories_staff_write on public.categories for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy products_staff_write on public.products for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy product_images_staff_write on public.product_images for all to authenticated using (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy product_variants_staff_write on public.product_variants for all to authenticated using (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy modifier_groups_staff_write on public.modifier_groups for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy modifier_options_staff_write on public.modifier_options for all to authenticated using (exists(select 1 from public.modifier_groups g where g.id = modifier_group_id and public.is_staff(g.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.modifier_groups g where g.id = modifier_group_id and public.is_staff(g.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy product_groups_staff_write on public.product_modifier_groups for all to authenticated using (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.products p where p.id = product_id and public.is_staff(p.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy deals_staff_write on public.deals for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy deal_items_staff_write on public.deal_items for all to authenticated using (exists(select 1 from public.deals d where d.id = deal_id and public.is_staff(d.business_id, array['OWNER','MANAGER']::public.staff_role[]))) with check (exists(select 1 from public.deals d where d.id = deal_id and public.is_staff(d.business_id, array['OWNER','MANAGER']::public.staff_role[])));
create policy hero_staff_write on public.hero_banners for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy promo_banners_staff_write on public.promotional_banners for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy promotions_staff_write on public.promotions for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy social_staff_write on public.social_links for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy integration_staff_write on public.integration_settings for all to authenticated using (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER','MANAGER']::public.staff_role[]));
create policy orders_staff_update on public.orders for update to authenticated using (public.is_staff(business_id)) with check (public.is_staff(business_id));
create policy memberships_owner_write on public.staff_memberships for all to authenticated using (public.is_staff(business_id, array['OWNER']::public.staff_role[])) with check (public.is_staff(business_id, array['OWNER']::public.staff_role[]));

grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.business_branding, public.site_settings, public.branches,
  public.business_hours, public.delivery_areas, public.delivery_rules, public.categories,
  public.products, public.product_images, public.product_variants, public.modifier_groups,
  public.modifier_options, public.product_modifier_groups, public.deals, public.deal_items,
  public.hero_banners, public.promotional_banners, public.social_links, public.integration_settings
to anon, authenticated;
grant select on public.profiles, public.customer_addresses, public.staff_memberships,
  public.admin_permissions, public.admin_role_permissions, public.orders, public.order_items,
  public.order_item_modifiers, public.order_status_history, public.audit_logs, public.promotions to authenticated;
grant insert, update, delete on public.customer_addresses to authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.business_branding, public.site_settings, public.branches,
  public.business_hours, public.delivery_areas, public.delivery_rules, public.categories,
  public.products, public.product_images, public.product_variants, public.modifier_groups,
  public.modifier_options, public.product_modifier_groups, public.deals, public.deal_items,
  public.hero_banners, public.promotional_banners, public.promotions, public.social_links,
  public.integration_settings, public.staff_memberships to authenticated;
grant update (name, short_description, phone, whatsapp, email, address, city, currency, timezone, is_active) on public.businesses to authenticated;
grant update (status) on public.orders to authenticated;

insert into public.admin_permissions(code, description) values
  ('business.manage', 'Manage business profile and appearance'),
  ('menu.manage', 'Manage categories, products, modifiers and deals'),
  ('orders.manage', 'Read and update orders'),
  ('customers.read', 'Read customer operational profiles'),
  ('staff.manage', 'Manage staff memberships and roles'),
  ('audit.read', 'Read administrative audit logs')
on conflict (code) do update set description = excluded.description;

insert into public.admin_role_permissions(role, permission_code)
select role, code from unnest(array['OWNER']::public.staff_role[]) role cross join public.admin_permissions
on conflict do nothing;
insert into public.admin_role_permissions(role, permission_code) values
  ('MANAGER','business.manage'),('MANAGER','menu.manage'),('MANAGER','orders.manage'),('MANAGER','customers.read'),('MANAGER','audit.read'),
  ('STAFF','orders.manage')
on conflict do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('business-logos','business-logos',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('hero-banners','hero-banners',true,10485760,array['image/png','image/jpeg','image/webp']),
  ('category-images','category-images',true,5242880,array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('product-images','product-images',true,8388608,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy restaurant_media_public_read on storage.objects for select using (bucket_id in ('business-logos','hero-banners','category-images','product-images'));
create policy restaurant_media_staff_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('business-logos','hero-banners','category-images','product-images')
  and exists(select 1 from public.staff_memberships m where m.user_id = auth.uid() and m.is_active and m.role in ('OWNER','MANAGER') and m.business_id::text = (storage.foldername(name))[1])
);
create policy restaurant_media_staff_update on storage.objects for update to authenticated using (
  bucket_id in ('business-logos','hero-banners','category-images','product-images')
  and exists(select 1 from public.staff_memberships m where m.user_id = auth.uid() and m.is_active and m.role in ('OWNER','MANAGER') and m.business_id::text = (storage.foldername(name))[1])
);
create policy restaurant_media_staff_delete on storage.objects for delete to authenticated using (
  bucket_id in ('business-logos','hero-banners','category-images','product-images')
  and exists(select 1 from public.staff_memberships m where m.user_id = auth.uid() and m.is_active and m.role in ('OWNER','MANAGER') and m.business_id::text = (storage.foldername(name))[1])
);

commit;
