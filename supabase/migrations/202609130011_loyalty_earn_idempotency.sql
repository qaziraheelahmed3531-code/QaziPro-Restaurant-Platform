begin;

create or replace function public.award_order_loyalty()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  setting public.loyalty_settings;
  target_customer uuid:=new.customer_id;
  email_value text:=lower(nullif(btrim(new.customer_email),''));
  completed integer;
  eligible_spend integer:=greatest(0,new.subtotal-new.discount);
  award integer;
  inserted_id uuid;
begin
  if new.status<>'DELIVERED' or old.status='DELIVERED' then return new; end if;
  select * into setting from public.loyalty_settings where business_id=new.business_id;
  if not found then return new; end if;

  if target_customer is null and email_value is not null then
    select id into target_customer from auth.users
    where lower(email)=email_value and email_confirmed_at is not null limit 1;
  end if;
  if target_customer is null and email_value is null then return new; end if;

  select count(distinct id)::integer into completed
  from public.orders
  where business_id=new.business_id and status='DELIVERED'
    and (
      (target_customer is not null and customer_id=target_customer)
      or (email_value is not null and lower(nullif(btrim(customer_email),''))=email_value)
    );

  award:=least(
    setting.max_coins_per_order,
    floor(eligible_spend::numeric/100)::integer*setting.coins_per_100_pkr
  );
  if setting.is_enabled
     and completed>=setting.start_earning_order
     and eligible_spend>=setting.minimum_order_pkr
     and award>0
     and (not setting.website_orders_only or new.channel='WEBSITE') then
    insert into public.loyalty_transactions(
      business_id,customer_id,normalized_email,order_id,transaction_type,coins,pkr_value,description,claimed_at
    ) values(
      new.business_id,target_customer,email_value,new.id,'EARN',award,award*setting.coin_value_pkr,
      'Earned from delivered order '||new.order_number,case when target_customer is not null then now() end
    ) on conflict(order_id) where order_id is not null and transaction_type='EARN' do nothing returning id into inserted_id;
  end if;

  if target_customer is not null then
    perform public.refresh_loyalty_wallet(new.business_id,target_customer,email_value);
  end if;
  return new;
end;
$$;

commit;
