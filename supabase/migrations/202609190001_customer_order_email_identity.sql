begin;

-- For account orders the verified auth identity is the single source of truth.
-- Guest orders continue to use the email entered at checkout.
create or replace function public.apply_order_customer_email()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  account_email text;
begin
  if new.customer_id is not null then
    select lower(btrim(email)) into account_email
    from auth.users
    where id=new.customer_id and email is not null;
    if account_email is not null then new.customer_email:=account_email; end if;
  elsif new.customer_email is not null then
    new.customer_email:=lower(btrim(new.customer_email));
  end if;
  return new;
end;
$$;

drop trigger if exists apply_order_customer_email on public.orders;
create trigger apply_order_customer_email
before insert or update of customer_id,customer_email on public.orders
for each row execute function public.apply_order_customer_email();

update public.orders o
set customer_email=lower(btrim(u.email))
from auth.users u
where o.customer_id=u.id
  and u.email is not null
  and o.customer_email is distinct from lower(btrim(u.email));

create or replace function public.queue_confirmed_order_email()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  recipient text;
begin
  if new.status='CONFIRMED' and old.status is distinct from 'CONFIRMED' then
    if new.customer_id is not null then
      select lower(btrim(email)) into recipient from auth.users where id=new.customer_id;
    end if;
    recipient:=coalesce(recipient,lower(nullif(btrim(new.customer_email),'')));
    if recipient is not null then
      insert into public.order_notifications(business_id,order_id,event_type,recipient)
      values(new.business_id,new.id,'ORDER_CONFIRMED',recipient)
      on conflict(order_id,event_type,recipient) do nothing;
    end if;
  end if;
  return new;
end;
$$;

commit;
