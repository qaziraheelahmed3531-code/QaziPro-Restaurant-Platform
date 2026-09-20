begin;

create table if not exists public.customer_restrictions (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  normalized_email text,
  normalized_phone text,
  status text not null default 'BLOCKED' check (status in ('ACTIVE','BLOCKED')),
  reason_code text not null check (reason_code in ('SPAM','ABUSIVE_BEHAVIOUR','FRAUDULENT_ORDERS','REPEATED_FAKE_ORDERS','PAYMENT_ISSUE','OTHER')),
  internal_note text,
  prevent_new_orders boolean not null default true,
  prevent_storefront_access boolean not null default true,
  blocked_at timestamptz not null default now(),
  blocked_by uuid not null references auth.users(id),
  unblocked_at timestamptz,
  unblocked_by uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (auth_user_id is not null or normalized_email is not null or normalized_phone is not null)
);
create index if not exists customer_restrictions_user_idx on public.customer_restrictions(business_id,auth_user_id) where is_active;
create index if not exists customer_restrictions_email_idx on public.customer_restrictions(business_id,normalized_email) where is_active;
create index if not exists customer_restrictions_phone_idx on public.customer_restrictions(business_id,normalized_phone) where is_active;

create table if not exists public.order_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  recipient text not null,
  status text not null default 'PENDING' check(status in ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,event_type,recipient)
);
create index if not exists order_notifications_business_status_idx on public.order_notifications(business_id,status,created_at);

alter table public.modifier_groups add column if not exists customer_instruction text;

insert into public.admin_permissions(code,description)
values ('customers.manage','Block and unblock customers')
on conflict(code) do update set description=excluded.description;

create or replace function public.set_customer_restriction(
  p_business_id uuid,
  p_auth_user_id uuid default null,
  p_email text default null,
  p_phone text default null,
  p_blocked boolean default true,
  p_reason_code text default 'OTHER',
  p_internal_note text default null,
  p_prevent_new_orders boolean default true,
  p_prevent_storefront_access boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare normalized_email_value text:=nullif(lower(btrim(coalesce(p_email,''))),'');
declare normalized_phone_value text:=nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'');
declare result public.customer_restrictions;
begin
  if not public.has_permission(p_business_id,'customers.manage') then
    raise exception 'Customer management access denied.' using errcode='42501';
  end if;
  if p_auth_user_id is null and normalized_email_value is null and normalized_phone_value is null then
    raise exception 'A customer identity is required.' using errcode='22023';
  end if;
  if p_blocked and p_reason_code not in ('SPAM','ABUSIVE_BEHAVIOUR','FRAUDULENT_ORDERS','REPEATED_FAKE_ORDERS','PAYMENT_ISSUE','OTHER') then
    raise exception 'Choose a valid restriction reason.' using errcode='22023';
  end if;

  if p_blocked then
    update public.customer_restrictions set is_active=false,updated_at=now()
    where business_id=p_business_id and is_active and (
      (p_auth_user_id is not null and auth_user_id=p_auth_user_id) or
      (normalized_email_value is not null and normalized_email=normalized_email_value) or
      (normalized_phone_value is not null and normalized_phone=normalized_phone_value)
    );
    insert into public.customer_restrictions(
      business_id,auth_user_id,normalized_email,normalized_phone,status,reason_code,internal_note,
      prevent_new_orders,prevent_storefront_access,blocked_by
    ) values (
      p_business_id,p_auth_user_id,normalized_email_value,normalized_phone_value,'BLOCKED',p_reason_code,
      nullif(left(btrim(coalesce(p_internal_note,'')),1000),''),
      p_prevent_new_orders,p_prevent_storefront_access,auth.uid()
    ) returning * into result;
  else
    update public.customer_restrictions set status='ACTIVE',is_active=false,unblocked_at=now(),unblocked_by=auth.uid(),updated_at=now()
    where business_id=p_business_id and is_active and (
      (p_auth_user_id is not null and auth_user_id=p_auth_user_id) or
      (normalized_email_value is not null and normalized_email=normalized_email_value) or
      (normalized_phone_value is not null and normalized_phone=normalized_phone_value)
    ) returning * into result;
  end if;

  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),case when p_blocked then 'BLOCK_CUSTOMER' else 'UNBLOCK_CUSTOMER' end,
    'customer_restrictions',coalesce(result.id::text,p_auth_user_id::text,normalized_email_value,normalized_phone_value),
    jsonb_build_object('reasonCode',case when p_blocked then p_reason_code else null end));
  return coalesce(to_jsonb(result),jsonb_build_object('status','ACTIVE'));
end $$;

create or replace function public.enforce_customer_restriction()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(
    select 1 from public.customer_restrictions r
    where r.business_id=new.business_id and r.is_active and r.status='BLOCKED' and r.prevent_new_orders
      and (
        (new.customer_id is not null and r.auth_user_id=new.customer_id) or
        (nullif(lower(btrim(coalesce(new.customer_email,''))),'') is not null and r.normalized_email=lower(btrim(new.customer_email))) or
        (nullif(regexp_replace(coalesce(new.customer_phone,''),'[^0-9]','','g'),'') is not null and r.normalized_phone=regexp_replace(new.customer_phone,'[^0-9]','','g'))
      )
  ) then
    raise exception 'This account is currently restricted.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists enforce_order_customer_restriction on public.orders;
create trigger enforce_order_customer_restriction before insert on public.orders for each row execute function public.enforce_customer_restriction();

create or replace function public.queue_confirmed_order_email()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='CONFIRMED' and old.status is distinct from 'CONFIRMED' and nullif(lower(btrim(coalesce(new.customer_email,''))),'') is not null then
    insert into public.order_notifications(business_id,order_id,event_type,recipient)
    values(new.business_id,new.id,'ORDER_CONFIRMED',lower(btrim(new.customer_email)))
    on conflict(order_id,event_type,recipient) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists queue_confirmed_order_email on public.orders;
create trigger queue_confirmed_order_email after update of status on public.orders for each row execute function public.queue_confirmed_order_email();

create or replace function public.customer_directory(p_business_id uuid,p_offset integer default 0,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_permission(p_business_id,'customers.read') then raise exception 'Customer access denied.' using errcode='42501'; end if;
  with grouped as (
    select coalesce(o.customer_id::text,o.customer_phone||'|'||coalesce(o.customer_email,'')) customer_key,
      o.customer_id,
      (array_agg(coalesce(nullif(p.full_name,''),o.customer_name) order by o.created_at desc))[1] name,
      (array_agg(coalesce(u.email,o.customer_email) order by o.created_at desc))[1] email,
      (array_agg(coalesce(nullif(p.phone,''),o.customer_phone) order by o.created_at desc))[1] phone,
      count(*)::integer order_count,
      coalesce(sum(o.total) filter(where o.status<>'CANCELLED'),0)::integer spend,
      round(coalesce(avg(o.total) filter(where o.status<>'CANCELLED'),0))::integer average_order,
      max(o.created_at) last_order,min(o.created_at) first_order,
      max(u.created_at) account_created,max(u.last_sign_in_at) last_sign_in,
      max(coalesce(u.raw_app_meta_data->>'provider',case when u.id is not null then 'email' end)) provider
    from public.orders o
    left join auth.users u on u.id=o.customer_id
    left join public.profiles p on p.id=o.customer_id
    where o.business_id=p_business_id and o.customer_phone<>'Counter'
    group by coalesce(o.customer_id::text,o.customer_phone||'|'||coalesce(o.customer_email,'')),o.customer_id
  ), enriched as (
    select g.*,
      case when exists(select 1 from public.customer_restrictions r where r.business_id=p_business_id and r.is_active and r.status='BLOCKED' and (
        (g.customer_id is not null and r.auth_user_id=g.customer_id) or
        (g.email is not null and r.normalized_email=lower(btrim(g.email))) or
        (g.phone is not null and r.normalized_phone=regexp_replace(g.phone,'[^0-9]','','g'))
      )) then 'BLOCKED' else 'ACTIVE' end restriction_status,
      case when g.customer_id is null then 0 else (select count(*)::integer from public.customer_addresses a where a.customer_id=g.customer_id) end address_count,
      case when g.customer_id is null then 0 else (select count(*)::integer from public.customer_favourites f where f.user_id=g.customer_id) end favourite_count,
      case when g.customer_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('productId',f.product_id,'name',fp.name) order by f.created_at desc) from public.customer_favourites f join public.products fp on fp.id=f.product_id where f.user_id=g.customer_id),'[]'::jsonb) end favourites
    from grouped g
  ), filtered as (
    select * from enriched where name ilike '%'||left(p_query,100)||'%' or phone ilike '%'||left(p_query,100)||'%' or email ilike '%'||left(p_query,100)||'%'
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(row_to_json(page)),'[]')) into result
    from (select * from filtered order by last_order desc,customer_key limit 50 offset greatest(0,p_offset)) page;
  return result;
end $$;

update public.invoice_settings s set
  business_name=coalesce((select nullif(b.restaurant_name,'') from public.branches b where b.business_id=s.business_id and b.is_active order by b.sort_order limit 1),s.business_name),
  address=coalesce((select nullif(b.formatted_address,'') from public.branches b where b.business_id=s.business_id and b.is_active order by b.sort_order limit 1),s.address),
  thank_you='Thank you for ordering from '||coalesce((select nullif(b.restaurant_name,'') from public.branches b where b.business_id=s.business_id and b.is_active order by b.sort_order limit 1),s.business_name)||'!'
where s.business_name='Italian Pizza' or s.business_name=(select name from public.businesses where id=s.business_id);

update public.print_settings s set receipt_footer='Thank you for ordering from '||
  coalesce((select nullif(b.restaurant_name,'') from public.branches b where b.business_id=s.business_id and b.is_active order by b.sort_order limit 1),(select name from public.businesses where id=s.business_id))||'.'
where s.receipt_footer ilike '%Italian Pizza%';

alter table public.customer_restrictions enable row level security;
alter table public.order_notifications enable row level security;
drop policy if exists customer_restrictions_staff_read on public.customer_restrictions;
create policy customer_restrictions_staff_read on public.customer_restrictions for select to authenticated using(
  public.has_permission(business_id,'customers.read')
);
drop policy if exists customer_restrictions_staff_manage on public.customer_restrictions;
create policy customer_restrictions_staff_manage on public.customer_restrictions for all to authenticated using(public.has_permission(business_id,'customers.manage')) with check(public.has_permission(business_id,'customers.manage'));
drop policy if exists order_notifications_staff_read on public.order_notifications;
create policy order_notifications_staff_read on public.order_notifications for select to authenticated using(public.has_permission(business_id,'orders.read'));
drop policy if exists order_notifications_staff_manage on public.order_notifications;
create policy order_notifications_staff_manage on public.order_notifications for all to authenticated using(public.has_permission(business_id,'orders.manage')) with check(public.has_permission(business_id,'orders.manage'));

grant select,insert,update on public.customer_restrictions,public.order_notifications to authenticated;
revoke all on function public.set_customer_restriction(uuid,uuid,text,text,boolean,text,text,boolean,boolean) from public,anon;
grant execute on function public.set_customer_restriction(uuid,uuid,text,text,boolean,text,text,boolean,boolean) to authenticated;
revoke all on function public.customer_directory(uuid,integer,text) from public,anon;
grant execute on function public.customer_directory(uuid,integer,text) to authenticated;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='products'
  ) then alter publication supabase_realtime add table public.products; end if;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='deals'
  ) then alter publication supabase_realtime add table public.deals; end if;
end $$;

commit;
