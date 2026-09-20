begin;
create or replace function public.customer_directory(p_business_id uuid,p_offset integer default 0,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.has_permission(p_business_id,'customers.read') then raise exception 'Customer access denied.' using errcode='42501'; end if;
  with grouped as (
    select coalesce(customer_id::text,customer_phone||'|'||coalesce(customer_email,'')) customer_key,
      (array_agg(customer_name order by created_at desc))[1] name,
      (array_agg(customer_email order by created_at desc))[1] email,
      (array_agg(customer_phone order by created_at desc))[1] phone,
      count(*) order_count,coalesce(sum(total) filter(where status<>'CANCELLED'),0) spend,
      max(created_at) last_order,min(created_at) first_order
    from public.orders where business_id=p_business_id and customer_phone<>'Counter'
    group by 1
  ), filtered as (
    select * from grouped where name ilike '%'||left(p_query,100)||'%' or phone ilike '%'||left(p_query,100)||'%' or email ilike '%'||left(p_query,100)||'%'
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce(jsonb_agg(row_to_json(page)),'[]')) into result
    from (select * from filtered order by last_order desc,customer_key limit 50 offset greatest(0,p_offset)) page;
  return result;
end; $$;
revoke all on function public.customer_directory(uuid,integer,text) from public,anon;
grant execute on function public.customer_directory(uuid,integer,text) to authenticated;
commit;
