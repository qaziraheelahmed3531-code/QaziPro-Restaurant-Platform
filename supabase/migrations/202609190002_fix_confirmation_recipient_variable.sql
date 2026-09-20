begin;

create or replace function public.queue_confirmed_order_email()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  target_recipient text;
begin
  if new.status='CONFIRMED' and old.status is distinct from 'CONFIRMED' then
    if new.customer_id is not null then
      select lower(btrim(email)) into target_recipient
      from auth.users
      where id=new.customer_id;
    end if;
    target_recipient:=coalesce(target_recipient,lower(nullif(btrim(new.customer_email),'')));
    if target_recipient is not null then
      insert into public.order_notifications(business_id,order_id,event_type,recipient)
      values(new.business_id,new.id,'ORDER_CONFIRMED',target_recipient)
      on conflict(order_id,event_type,recipient) do nothing;
    end if;
  end if;
  return new;
end;
$$;

commit;
