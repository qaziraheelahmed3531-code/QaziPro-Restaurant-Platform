begin;

-- Universal branch geography. Existing Tarbela data remains valid; these
-- columns let a branch describe any country/city and an optional hierarchy.
alter table public.branches
  add column if not exists country_code text,
  add column if not exists region text,
  add column if not exists formatted_address text,
  add column if not exists timezone text;

update public.branches b
set timezone = coalesce(nullif(b.timezone, ''), bs.timezone, 'Asia/Karachi')
from public.businesses bs
where bs.id = b.business_id and b.timezone is null;

alter table public.branches
  alter column timezone set default 'Asia/Karachi';

alter table public.delivery_rules
  add column if not exists origin_address text;

alter table public.delivery_areas
  add column if not exists parent_id uuid references public.delivery_areas(id) on delete set null,
  add column if not exists level text not null default 'SUB_AREA',
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists provider_place_id text,
  add column if not exists provider_source text;

alter table public.delivery_areas
  drop constraint if exists delivery_area_level_check;
alter table public.delivery_areas
  add constraint delivery_area_level_check check (level in ('CITY','MAIN_AREA','SUB_AREA','LOCALITY','CUSTOM_ZONE'));

create index if not exists delivery_areas_branch_parent_sort_idx
  on public.delivery_areas(branch_id, parent_id, sort_order, name);
create unique index if not exists delivery_areas_branch_provider_idx
  on public.delivery_areas(branch_id, provider_place_id);

-- Keep Admin CRM metrics account-based and avoid multiplying orders by the
-- number of saved addresses. Accounts with no orders are included as well.
create or replace function public.customer_directory(p_business_id uuid,p_offset integer default 0,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_permission(p_business_id,'customers.read') then
    raise exception 'Customer access denied.' using errcode='42501';
  end if;
  with account_rows as (
    select
      u.id::text as customer_key,
      u.id as customer_id,
      coalesce(nullif(p.full_name,''), nullif(u.raw_user_meta_data->>'full_name',''), nullif(u.raw_user_meta_data->>'name',''), split_part(coalesce(u.email,''),'@',1), 'Customer') as name,
      u.email,
      p.phone,
      coalesce(metrics.order_count,0)::bigint as order_count,
      coalesce(metrics.spend,0)::bigint as spend,
      coalesce(metrics.average_order,0)::bigint as average_order,
      metrics.last_order,
      metrics.first_order,
      u.created_at as account_created,
      u.last_sign_in_at as last_sign_in,
      coalesce(u.raw_app_meta_data->>'provider',u.raw_user_meta_data->>'provider',case when u.id is not null then 'email' end) as provider,
      (select count(*) from public.customer_addresses a where a.customer_id=u.id)::bigint as address_count,
      (select count(*) from public.customer_favourites f where f.user_id=u.id)::bigint as favourite_count,
      coalesce((select jsonb_agg(jsonb_build_object('productId',f.product_id,'name',fp.name) order by f.created_at desc) from public.customer_favourites f join public.products fp on fp.id=f.product_id where f.user_id=u.id),'[]'::jsonb) as favourites
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join lateral (
      select count(*)::bigint order_count,
             coalesce(sum(o.total) filter(where o.status<>'CANCELLED'),0)::bigint spend,
             coalesce(round(avg(o.total) filter(where o.status<>'CANCELLED')),0)::bigint average_order,
             max(o.created_at) last_order,
             min(o.created_at) first_order
      from public.orders o
      where o.business_id=p_business_id and o.customer_id=u.id
    ) metrics on true
    where exists (select 1 from public.orders owned_order where owned_order.business_id=p_business_id and owned_order.customer_id=u.id)
       or exists (select 1 from public.customer_addresses owned_address join public.delivery_areas owned_area on owned_area.id=owned_address.delivery_area_id join public.branches owned_branch on owned_branch.id=owned_area.branch_id where owned_address.customer_id=u.id and owned_branch.business_id=p_business_id)
       or exists (select 1 from public.customer_favourites owned_favourite join public.products owned_product on owned_product.id=owned_favourite.product_id where owned_favourite.user_id=u.id and owned_product.business_id=p_business_id)
  ), guest_rows as (
    select
      (o.customer_phone||'|'||coalesce(o.customer_email,'')) as customer_key,
      null::uuid as customer_id,
      (array_agg(o.customer_name order by o.created_at desc))[1] as name,
      (array_agg(o.customer_email order by o.created_at desc))[1] as email,
      (array_agg(o.customer_phone order by o.created_at desc))[1] as phone,
      count(*)::bigint as order_count,
      coalesce(sum(o.total) filter(where o.status<>'CANCELLED'),0)::bigint as spend,
      coalesce(round(avg(o.total) filter(where o.status<>'CANCELLED')),0)::bigint as average_order,
      max(o.created_at) last_order,
      min(o.created_at) first_order,
      null::timestamptz as account_created,
      null::timestamptz as last_sign_in,
      'guest'::text as provider,
      0::bigint as address_count,
      0::bigint as favourite_count,
      '[]'::jsonb as favourites
    from public.orders o
    where o.business_id=p_business_id and o.customer_id is null and o.customer_phone<>'Counter'
    group by o.customer_phone,o.customer_email
  ), grouped as (
    select * from account_rows
    union all
    select * from guest_rows
  ), filtered as (
    select * from grouped
    where name ilike '%'||left(coalesce(p_query,''),100)||'%'
       or coalesce(phone,'') ilike '%'||left(coalesce(p_query,''),100)||'%'
       or coalesce(email,'') ilike '%'||left(coalesce(p_query,''),100)||'%'
  )
  select jsonb_build_object(
    'total',(select count(*) from filtered),
    'rows',coalesce((select jsonb_agg(row_to_json(page)) from (select * from filtered order by last_order desc nulls last,name,customer_key limit 50 offset greatest(0,p_offset)) page),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

revoke all on function public.customer_directory(uuid,integer,text) from public,anon;
grant execute on function public.customer_directory(uuid,integer,text) to authenticated;

create or replace function public.customer_order_history(p_business_id uuid,p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'customers.read') then raise exception 'Customer access denied.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select id,order_number,total,status,created_at from public.orders where business_id=p_business_id and customer_id=p_customer_id order by created_at desc limit 50) o),'[]');
end; $$;
revoke all on function public.customer_order_history(uuid,uuid) from public,anon;
grant execute on function public.customer_order_history(uuid,uuid) to authenticated;

commit;
