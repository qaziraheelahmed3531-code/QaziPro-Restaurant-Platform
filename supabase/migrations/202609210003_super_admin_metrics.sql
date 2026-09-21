begin;

-- Platform-wide aggregate: never truncate GMV after the first page of orders.
create index if not exists orders_platform_created_idx on public.orders(created_at desc);

create or replace function public.platform_today_order_metrics()
returns jsonb language plpgsql stable security definer set search_path=public,auth as $$
declare v_orders bigint; v_gmv numeric;
begin
  if not public.has_platform_permission('restaurants.view') then
    raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501';
  end if;
  select count(*), coalesce(sum(total) filter (where status <> 'CANCELLED'),0)
    into v_orders,v_gmv
  from public.orders
  where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'
    and created_at < (date_trunc('day',now() at time zone 'UTC') + interval '1 day') at time zone 'UTC';
  return jsonb_build_object('ordersToday',v_orders,'gmvToday',v_gmv,'timezone','UTC');
end;
$$;

grant execute on function public.platform_today_order_metrics() to authenticated;
revoke all on function public.platform_today_order_metrics() from public,anon;

commit;
