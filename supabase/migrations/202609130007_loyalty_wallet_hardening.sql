begin;

-- A ratio of X coins per Rs 100 should never award a coin for a zero-value or
-- sub-Rs-100 order. Keep the database calculation authoritative and exact.
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
    ) on conflict(order_id) where order_id is not null do nothing returning id into inserted_id;
  end if;

  if target_customer is not null then
    perform public.refresh_loyalty_wallet(new.business_id,target_customer,email_value);
  end if;
  return new;
end;
$$;

-- Serialize manual mutations per wallet so two simultaneous debits cannot both
-- pass the balance check and drive the immutable ledger below zero.
create or replace function public.adjust_customer_loyalty(p_business_id uuid,p_customer_id uuid,p_coins integer,p_note text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  setting public.loyalty_settings;
  wallet public.loyalty_wallets;
  email_value text;
begin
  if not public.has_permission(p_business_id,'loyalty.manage') then
    raise exception 'Loyalty access denied.' using errcode='42501';
  end if;
  if p_coins=0 or abs(p_coins)>100000 then raise exception 'Enter a coin adjustment from -100000 to 100000.' using errcode='22023'; end if;
  if nullif(btrim(p_note),'') is null then raise exception 'An internal adjustment reason is required.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_customer_id::text,0));
  select * into setting from public.loyalty_settings where business_id=p_business_id;
  select lower(email) into email_value from auth.users where id=p_customer_id;
  if email_value is null then raise exception 'Customer account was not found.' using errcode='22023'; end if;
  wallet:=public.refresh_loyalty_wallet(p_business_id,p_customer_id,email_value);
  if p_coins<0 and wallet.balance_coins<abs(p_coins) then raise exception 'Customer does not have enough coins.' using errcode='22023'; end if;

  insert into public.loyalty_transactions(
    business_id,customer_id,normalized_email,transaction_type,coins,pkr_value,description,created_by,claimed_at
  ) values(
    p_business_id,p_customer_id,email_value,
    case when p_coins>0 then 'MANUAL_CREDIT' else 'MANUAL_DEBIT' end,
    p_coins,abs(p_coins)*setting.coin_value_pkr,left(btrim(p_note),240),auth.uid(),now()
  );
  wallet:=public.refresh_loyalty_wallet(p_business_id,p_customer_id,email_value);
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'LOYALTY_ADJUSTED','loyalty_wallets',p_customer_id::text,jsonb_build_object('coins',p_coins,'reason',left(btrim(p_note),240)));
  return jsonb_build_object('balanceCoins',wallet.balance_coins,'lifetimeEarned',wallet.lifetime_earned,'tier',wallet.tier);
end;
$$;

revoke all on function public.adjust_customer_loyalty(uuid,uuid,integer,text) from public,anon;
grant execute on function public.adjust_customer_loyalty(uuid,uuid,integer,text) to authenticated;

commit;
