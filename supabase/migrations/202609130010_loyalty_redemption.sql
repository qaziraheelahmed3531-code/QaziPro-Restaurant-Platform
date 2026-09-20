begin;

alter table public.loyalty_settings
  add column if not exists redemption_enabled boolean not null default true,
  add column if not exists minimum_redeem_coins integer not null default 1 check(minimum_redeem_coins between 1 and 100000),
  add column if not exists max_redeem_percent integer not null default 100 check(max_redeem_percent between 1 and 100);

alter table public.orders
  add column if not exists loyalty_coins_redeemed integer not null default 0 check(loyalty_coins_redeemed >= 0),
  add column if not exists loyalty_discount integer not null default 0 check(loyalty_discount >= 0);

alter table public.loyalty_transactions drop constraint if exists loyalty_transactions_transaction_type_check;
alter table public.loyalty_transactions add constraint loyalty_transactions_transaction_type_check
  check(transaction_type in ('EARN','REDEEM','REDEEM_REFUND','MANUAL_CREDIT','MANUAL_DEBIT'));

-- Earning, spending and cancellation refunds are separate immutable entries for
-- the same order, each allowed exactly once.
drop index if exists public.loyalty_order_credit_once_idx;
create unique index if not exists loyalty_order_earn_once_idx on public.loyalty_transactions(order_id) where order_id is not null and transaction_type='EARN';
create unique index if not exists loyalty_order_redeem_once_idx on public.loyalty_transactions(order_id) where order_id is not null and transaction_type='REDEEM';
create unique index if not exists loyalty_order_refund_once_idx on public.loyalty_transactions(order_id) where order_id is not null and transaction_type='REDEEM_REFUND';

create or replace function public.create_order_with_loyalty(p_payload jsonb,p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  result jsonb;
  target public.orders;
  setting public.loyalty_settings;
  wallet public.loyalty_wallets;
  requested_text text:=coalesce(nullif(btrim(p_payload->>'loyaltyCoinsToRedeem'),''),'0');
  requested integer;
  eligible_value integer;
  percent_value integer;
  maximum_coins integer;
  redemption_value integer;
  email_value text;
begin
  if requested_text !~ '^[0-9]+$' or length(requested_text)>7 then
    raise exception 'Choose a valid number of loyalty coins.' using errcode='22023';
  end if;
  requested:=requested_text::integer;
  if requested>1000000 then raise exception 'Choose a valid number of loyalty coins.' using errcode='22023'; end if;

  -- The base order and wallet debit share this database transaction. Any
  -- loyalty validation failure rolls the entire order back.
  result:=public.create_order_authoritative(p_payload,p_customer_id);
  select * into target from public.orders where id=(result->>'id')::uuid for update;
  if requested=0 then
    return result||jsonb_build_object('loyaltyCoinsRedeemed',0,'loyaltyDiscount',0);
  end if;
  if p_customer_id is null then raise exception 'Sign in to use loyalty coins.' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target.business_id::text||':'||p_customer_id::text,0));
  select * into setting from public.loyalty_settings where business_id=target.business_id;
  if not found or not setting.is_enabled or not setting.redemption_enabled then
    raise exception 'Loyalty coin redemption is currently unavailable.' using errcode='22023';
  end if;

  select lower(email) into email_value from auth.users where id=p_customer_id and email_confirmed_at is not null;
  if email_value is null then raise exception 'Verify your email before using loyalty coins.' using errcode='22023'; end if;
  wallet:=public.refresh_loyalty_wallet(target.business_id,p_customer_id,email_value);

  eligible_value:=greatest(0,target.subtotal-target.discount);
  percent_value:=floor(eligible_value::numeric*setting.max_redeem_percent/100)::integer;
  maximum_coins:=least(wallet.balance_coins,floor(least(eligible_value,percent_value)::numeric/setting.coin_value_pkr)::integer);
  if requested<setting.minimum_redeem_coins then
    raise exception 'Use at least % loyalty coins.',setting.minimum_redeem_coins using errcode='22023';
  end if;
  if requested>maximum_coins then
    raise exception 'You can use up to % loyalty coins on this order.',maximum_coins using errcode='22023';
  end if;

  redemption_value:=requested*setting.coin_value_pkr;
  update public.orders set
    loyalty_coins_redeemed=requested,
    loyalty_discount=redemption_value,
    discount=discount+redemption_value,
    total=greatest(0,total-redemption_value)
  where id=target.id;

  insert into public.loyalty_transactions(
    business_id,customer_id,normalized_email,order_id,transaction_type,coins,pkr_value,description,claimed_at
  ) values(
    target.business_id,p_customer_id,email_value,target.id,'REDEEM',-requested,redemption_value,
    'Used on order '||target.order_number,now()
  );
  wallet:=public.refresh_loyalty_wallet(target.business_id,p_customer_id,email_value);

  return result||jsonb_build_object(
    'discount',(result->>'discount')::integer+redemption_value,
    'total',greatest(0,(result->>'total')::integer-redemption_value),
    'loyaltyCoinsRedeemed',requested,
    'loyaltyDiscount',redemption_value,
    'loyaltyBalanceCoins',wallet.balance_coins
  );
end;
$$;

create or replace function public.refund_cancelled_order_loyalty()
returns trigger language plpgsql security definer set search_path=public as $$
declare spent public.loyalty_transactions;
begin
  if new.status<>'CANCELLED' or old.status='CANCELLED' then return new; end if;
  select * into spent from public.loyalty_transactions where order_id=new.id and transaction_type='REDEEM';
  if not found then return new; end if;
  insert into public.loyalty_transactions(
    business_id,customer_id,normalized_email,order_id,transaction_type,coins,pkr_value,description,claimed_at
  ) values(
    spent.business_id,spent.customer_id,spent.normalized_email,new.id,'REDEEM_REFUND',abs(spent.coins),spent.pkr_value,
    'Returned from cancelled order '||new.order_number,now()
  ) on conflict(order_id) where order_id is not null and transaction_type='REDEEM_REFUND' do nothing;
  if spent.customer_id is not null then perform public.refresh_loyalty_wallet(spent.business_id,spent.customer_id,spent.normalized_email); end if;
  return new;
end;
$$;
create trigger refund_cancelled_order_loyalty after update of status on public.orders
for each row execute function public.refund_cancelled_order_loyalty();

create or replace function public.customer_loyalty_wallet(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  customer uuid:=auth.uid();
  email_value text;
  setting public.loyalty_settings;
  wallet public.loyalty_wallets;
begin
  if customer is null then raise exception 'Sign in to view your rewards wallet.' using errcode='42501'; end if;
  select lower(email) into email_value from auth.users where id=customer and email_confirmed_at is not null;
  if email_value is null then raise exception 'Verify your email to use rewards.' using errcode='42501'; end if;
  select * into setting from public.loyalty_settings where business_id=p_business_id;
  if not found then raise exception 'Rewards are not configured.' using errcode='22023'; end if;

  update public.loyalty_transactions set customer_id=customer,claimed_at=coalesce(claimed_at,now())
  where business_id=p_business_id and customer_id is null and normalized_email=email_value;
  wallet:=public.refresh_loyalty_wallet(p_business_id,customer,email_value);

  return jsonb_build_object(
    'enabled',setting.is_enabled,
    'programName',setting.program_name,
    'coinName',setting.coin_name,
    'coinValuePkr',setting.coin_value_pkr,
    'showEarningMessage',setting.show_earning_message,
    'redemptionEnabled',setting.redemption_enabled,
    'minimumRedeemCoins',setting.minimum_redeem_coins,
    'maxRedeemPercent',setting.max_redeem_percent,
    'balanceCoins',wallet.balance_coins,
    'balancePkr',wallet.balance_coins*setting.coin_value_pkr,
    'lifetimeEarned',wallet.lifetime_earned,
    'completedOrders',wallet.completed_orders,
    'tier',wallet.tier,
    'startEarningOrder',setting.start_earning_order,
    'loyalOrderThreshold',setting.loyal_order_threshold,
    'vipOrderThreshold',setting.vip_order_threshold,
    'nextTierAt',case when wallet.completed_orders<setting.loyal_order_threshold then setting.loyal_order_threshold when wallet.completed_orders<setting.vip_order_threshold then setting.vip_order_threshold else null end,
    'transactions',coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc) from (
      select id,order_id,transaction_type,coins,pkr_value,
        case transaction_type
          when 'MANUAL_CREDIT' then 'Wallet credit from restaurant'
          when 'MANUAL_DEBIT' then 'Wallet correction by restaurant'
          else description
        end description,
        created_at
      from public.loyalty_transactions
      where business_id=p_business_id and customer_id=customer
      order by created_at desc limit 20
    ) recent),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_order_with_loyalty(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_order_with_loyalty(jsonb,uuid) to service_role;

commit;
