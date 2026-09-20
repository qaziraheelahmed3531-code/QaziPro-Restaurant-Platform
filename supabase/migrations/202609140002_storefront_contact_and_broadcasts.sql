begin;

alter table public.site_settings
  add column if not exists whatsapp_floating_enabled boolean not null default false,
  add column if not exists whatsapp_floating_number text not null default '',
  add column if not exists whatsapp_floating_logo_url text,
  add column if not exists whatsapp_floating_message text not null default 'Hello, I would like to place an order.',
  add column if not exists whatsapp_floating_side text not null default 'LEFT',
  add column if not exists whatsapp_floating_size_px integer not null default 58,
  add column if not exists whatsapp_floating_bottom_px integer not null default 24,
  add column if not exists whatsapp_floating_side_offset_px integer not null default 24;

alter table public.site_settings
  drop constraint if exists site_settings_whatsapp_number_check,
  add constraint site_settings_whatsapp_number_check
    check (whatsapp_floating_number = '' or whatsapp_floating_number ~ '^[0-9]{8,15}$'),
  drop constraint if exists site_settings_whatsapp_side_check,
  add constraint site_settings_whatsapp_side_check
    check (whatsapp_floating_side in ('LEFT', 'RIGHT')),
  drop constraint if exists site_settings_whatsapp_size_check,
  add constraint site_settings_whatsapp_size_check
    check (whatsapp_floating_size_px between 44 and 96),
  drop constraint if exists site_settings_whatsapp_bottom_check,
  add constraint site_settings_whatsapp_bottom_check
    check (whatsapp_floating_bottom_px between 8 and 240),
  drop constraint if exists site_settings_whatsapp_side_offset_check,
  add constraint site_settings_whatsapp_side_offset_check
    check (whatsapp_floating_side_offset_px between 8 and 160),
  drop constraint if exists site_settings_whatsapp_message_check,
  add constraint site_settings_whatsapp_message_check
    check (char_length(whatsapp_floating_message) <= 300);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-assets', 'whatsapp-assets', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_media(p_bucket text,p_name text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare b uuid;
begin
 begin b:=split_part(p_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 return case p_bucket
 when 'business-logos' then public.has_permission(b,'branding.manage') or public.has_permission(b,'printing.manage')
 when 'whatsapp-assets' then public.has_permission(b,'content.manage')
 when 'hero-banners' then public.has_permission(b,'banners.manage')
 when 'category-images' then public.has_permission(b,'categories.manage') or public.has_permission(b,'menu.manage')
 when 'product-images' then public.has_permission(b,'products.manage') or public.has_permission(b,'deals.manage') or public.has_permission(b,'menu.manage')
 else false end;
end; $$;

create table if not exists public.customer_broadcasts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 3 and 140),
  message text not null check (char_length(btrim(message)) between 3 and 2000),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'PARTIAL', 'FAILED')),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists customer_broadcasts_business_created_idx
  on public.customer_broadcasts(business_id, created_at desc);

create table if not exists public.customer_broadcast_deliveries (
  id bigint generated always as identity primary key,
  broadcast_id uuid not null references public.customer_broadcasts(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipient text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (broadcast_id, recipient)
);

create index if not exists customer_broadcast_delivery_queue_idx
  on public.customer_broadcast_deliveries(broadcast_id, status, id);

alter table public.customer_broadcasts enable row level security;
alter table public.customer_broadcast_deliveries enable row level security;

drop policy if exists customer_broadcast_staff_access on public.customer_broadcasts;
create policy customer_broadcast_staff_access on public.customer_broadcasts
  for all to authenticated
  using (public.has_permission(business_id, 'content.manage'))
  with check (public.has_permission(business_id, 'content.manage'));

drop policy if exists customer_broadcast_delivery_staff_access on public.customer_broadcast_deliveries;
create policy customer_broadcast_delivery_staff_access on public.customer_broadcast_deliveries
  for all to authenticated
  using (public.has_permission(business_id, 'content.manage'))
  with check (public.has_permission(business_id, 'content.manage'));

create or replace function public.create_customer_broadcast(
  p_business_id uuid,
  p_deal_id uuid,
  p_subject text,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_id uuid;
  recipients integer;
begin
  if not public.has_permission(p_business_id, 'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 3 and 140 then
    raise exception 'Subject must contain 3 to 140 characters.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 3 and 2000 then
    raise exception 'Message must contain 3 to 2000 characters.' using errcode = '22023';
  end if;
  if p_deal_id is not null and not exists (
    select 1 from public.deals
    where id = p_deal_id and business_id = p_business_id and is_active
  ) then
    raise exception 'Selected deal is not available for this restaurant.' using errcode = '22023';
  end if;

  insert into public.customer_broadcasts (
    business_id, deal_id, subject, message, created_by
  ) values (
    p_business_id, p_deal_id, btrim(p_subject), btrim(p_message), auth.uid()
  ) returning id into campaign_id;

  insert into public.customer_broadcast_deliveries (
    broadcast_id, business_id, recipient
  )
  select campaign_id, p_business_id, recipient
  from (
    select distinct lower(btrim(coalesce(u.email, o.customer_email))) recipient
    from public.orders o
    join auth.users u on u.id = o.customer_id
    where o.business_id = p_business_id
      and o.customer_id is not null
      and coalesce(u.email, o.customer_email) is not null
      and lower(btrim(coalesce(u.email, o.customer_email))) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      and lower(btrim(coalesce(u.email, o.customer_email))) !~ '@example[.](test|invalid)$'
  ) audience;

  get diagnostics recipients = row_count;
  update public.customer_broadcasts
  set recipient_count = recipients,
      status = case when recipients = 0 then 'SENT' else 'PENDING' end,
      completed_at = case when recipients = 0 then now() else null end,
      updated_at = now()
  where id = campaign_id;

  insert into public.audit_logs (
    business_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    p_business_id, auth.uid(), 'CUSTOMER_BROADCAST_CREATED',
    'customer_broadcast', campaign_id::text,
    jsonb_build_object('recipientCount', recipients, 'dealId', p_deal_id)
  );

  return jsonb_build_object('id', campaign_id, 'recipientCount', recipients);
end;
$$;

create or replace function public.claim_customer_broadcast_batch(
  p_broadcast_id uuid,
  p_limit integer default 20
) returns table(delivery_id bigint, recipient text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business uuid;
begin
  select business_id into target_business
  from public.customer_broadcasts
  where id = p_broadcast_id;
  if target_business is null or not public.has_permission(target_business, 'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode = '42501';
  end if;

  -- A server restart must not leave recipients permanently stuck mid-send.
  update public.customer_broadcast_deliveries
  set status = 'FAILED', last_error = 'Previous delivery attempt was interrupted.', updated_at = now()
  where broadcast_id = p_broadcast_id and status = 'SENDING'
    and updated_at < now() - interval '10 minutes';

  update public.customer_broadcasts
  set status = 'SENDING', updated_at = now()
  where id = p_broadcast_id and status in ('PENDING', 'SENDING', 'PARTIAL', 'FAILED');

  return query
  with claimed as (
    select d.id
    from public.customer_broadcast_deliveries d
    where d.broadcast_id = p_broadcast_id
      and d.status in ('PENDING', 'FAILED')
      and d.attempts < 3
    order by d.id
    for update skip locked
    limit least(50, greatest(1, coalesce(p_limit, 20)))
  )
  update public.customer_broadcast_deliveries d
  set status = 'SENDING', attempts = d.attempts + 1,
      last_error = null, updated_at = now()
  from claimed
  where d.id = claimed.id
  returning d.id, d.recipient;
end;
$$;

revoke all on function public.create_customer_broadcast(uuid, uuid, text, text) from public, anon;
revoke all on function public.claim_customer_broadcast_batch(uuid, integer) from public, anon;
grant execute on function public.create_customer_broadcast(uuid, uuid, text, text) to authenticated;
grant execute on function public.claim_customer_broadcast_batch(uuid, integer) to authenticated;

grant select, insert, update on public.customer_broadcasts to authenticated;
grant select, insert, update on public.customer_broadcast_deliveries to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'customer_broadcasts_updated_at') then
    create trigger customer_broadcasts_updated_at
      before update on public.customer_broadcasts
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'customer_broadcast_deliveries_updated_at') then
    create trigger customer_broadcast_deliveries_updated_at
      before update on public.customer_broadcast_deliveries
      for each row execute function public.set_updated_at();
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
