begin;

alter table public.business_operating_settings
  add column if not exists order_notification_sound_url text,
  add column if not exists desktop_order_sound boolean not null default true;

alter table public.notifications
  add column if not exists resolved_at timestamptz;

create index if not exists notifications_business_active_idx
  on public.notifications(business_id, is_read, created_at desc)
  where resolved_at is null;

-- A new-order alert is created only by a genuine storefront order insert. POS,
-- waiter and offline-sync sales must never masquerade as incoming web orders.
create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.channel <> 'WEBSITE' then
    return new;
  end if;
  insert into public.notifications(
    business_id, notification_type, title, message,
    entity_type, entity_id, dedupe_key
  ) values (
    new.business_id,
    'NEW_ORDER',
    'New website ' || lower(new.service_mode::text) || ' order',
    new.order_number || ' · Token ' || lpad(new.token_number::text, 3, '0'),
    'orders',
    new.id::text,
    'order-' || new.id
  ) on conflict do nothing;
  return new;
end;
$$;

-- Resolved orders disappear from operational alerts without deleting the audit
-- row. This is idempotent and cannot resolve another restaurant's notice.
create or replace function public.resolve_order_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.channel = 'WEBSITE'
     and new.status in ('DELIVERED', 'CANCELLED')
     and old.status is distinct from new.status then
    update public.notifications
       set resolved_at = coalesce(resolved_at, now()),
           is_read = true,
           read_at = coalesce(read_at, now())
     where business_id = new.business_id
       and entity_type = 'orders'
       and entity_id = new.id::text
       and resolved_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists order_notification_resolution on public.orders;
create trigger order_notification_resolution
after update of status on public.orders
for each row execute function public.resolve_order_notification();

-- Hide historical counter alerts and already-finished website alerts.
update public.notifications notice
   set resolved_at = coalesce(notice.resolved_at, now()),
       is_read = true,
       read_at = coalesce(notice.read_at, now())
  from public.orders order_row
 where notice.notification_type = 'NEW_ORDER'
   and notice.entity_type = 'orders'
   and notice.entity_id = order_row.id::text
   and (order_row.channel <> 'WEBSITE' or order_row.status in ('DELIVERED','CANCELLED'))
   and notice.resolved_at is null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'notification-sounds',
  'notification-sounds',
  true,
  5242880,
  array['audio/mpeg','audio/wav','audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notification_sounds_public_read on storage.objects;
create policy notification_sounds_public_read on storage.objects
for select using (bucket_id = 'notification-sounds');

create or replace function public.can_manage_media(p_bucket text,p_name text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare b uuid;
begin
 begin b:=split_part(p_name,'/',1)::uuid; exception when invalid_text_representation then return false; end;
 return case p_bucket
 when 'business-logos' then public.has_permission(b,'branding.manage') or public.has_permission(b,'printing.manage')
 when 'hero-banners' then public.has_permission(b,'banners.manage')
 when 'category-images' then public.has_permission(b,'categories.manage') or public.has_permission(b,'menu.manage')
 when 'product-images' then public.has_permission(b,'products.manage') or public.has_permission(b,'deals.manage') or public.has_permission(b,'menu.manage')
 when 'notification-sounds' then public.has_permission(b,'settings.manage')
 else false end;
end;
$$;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;
