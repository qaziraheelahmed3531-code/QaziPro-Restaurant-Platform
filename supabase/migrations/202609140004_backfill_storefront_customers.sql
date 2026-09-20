begin;

insert into public.storefront_customer_memberships(business_id,user_id,first_seen_at,last_seen_at)
select business_id,customer_id,min(created_at),max(created_at)
from public.orders
where customer_id is not null
group by business_id,customer_id
on conflict (business_id,user_id) do update
set first_seen_at=least(public.storefront_customer_memberships.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(public.storefront_customer_memberships.last_seen_at,excluded.last_seen_at);

create or replace function public.capture_order_customer_membership() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.customer_id is not null then
    insert into public.storefront_customer_memberships(business_id,user_id,first_seen_at,last_seen_at)
    values(new.business_id,new.customer_id,coalesce(new.created_at,now()),now())
    on conflict (business_id,user_id) do update set last_seen_at=now();
  end if;
  return new;
end; $$;

drop trigger if exists capture_order_customer_membership on public.orders;
create trigger capture_order_customer_membership
after insert or update of customer_id,business_id on public.orders
for each row execute function public.capture_order_customer_membership();

revoke all on function public.capture_order_customer_membership() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
