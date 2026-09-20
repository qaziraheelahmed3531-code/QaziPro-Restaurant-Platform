begin;
create or replace function public.customer_directory(p_business_id uuid,p_offset integer default 0,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_permission(p_business_id,'customers.read') then raise exception 'Customer access denied.' using errcode='42501'; end if;
  with grouped as (
    select coalesce(o.customer_id::text,o.customer_phone||'|'||coalesce(o.customer_email,'')) customer_key,
      (array_agg(coalesce(p.full_name,o.customer_name) order by o.created_at desc))[1] name,
      (array_agg(coalesce(u.email,o.customer_email) order by o.created_at desc))[1] email,
      (array_agg(coalesce(p.phone,o.customer_phone) order by o.created_at desc))[1] phone,
      count(*) order_count,coalesce(sum(o.total) filter(where o.status<>'CANCELLED'),0) spend,
      round(coalesce(avg(o.total) filter(where o.status<>'CANCELLED'),0)) average_order,
      max(o.created_at) last_order,min(o.created_at) first_order,
      max(u.created_at) account_created,max(u.last_sign_in_at) last_sign_in,
      max(coalesce(u.raw_app_meta_data->>'provider', case when u.id is not null then 'email' end)) provider,
      count(distinct a.id) address_count,
      coalesce((select jsonb_agg(jsonb_build_object('productId',f.product_id,'name',fp.name) order by f.created_at desc) from public.customer_favourites f join public.products fp on fp.id=f.product_id where f.user_id=o.customer_id),'[]'::jsonb) favourites
    from public.orders o
    left join auth.users u on u.id=o.customer_id
    left join public.profiles p on p.id=o.customer_id
    left join public.customer_addresses a on a.customer_id=o.customer_id
    where o.business_id=p_business_id and o.customer_phone<>'Counter'
    group by 1,o.customer_id
  ), filtered as (
    select * from grouped where name ilike '%'||left(p_query,100)||'%' or phone ilike '%'||left(p_query,100)||'%' or email ilike '%'||left(p_query,100)||'%'
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(row_to_json(page)),'[]')) into result
    from (select * from filtered order by last_order desc,customer_key limit 50 offset greatest(0,p_offset)) page;
  return result;
end; $$;
revoke all on function public.customer_directory(uuid,integer,text) from public,anon;
grant execute on function public.customer_directory(uuid,integer,text) to authenticated;
commit;
