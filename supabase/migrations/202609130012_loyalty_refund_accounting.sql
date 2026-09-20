begin;

create or replace function public.refresh_loyalty_wallet(p_business_id uuid,p_customer_id uuid,p_email text default null)
returns public.loyalty_wallets language plpgsql security definer set search_path=public as $$
declare
  setting public.loyalty_settings;
  result public.loyalty_wallets;
  completed integer;
  balance integer;
  earned integer;
  email_value text:=lower(nullif(btrim(p_email),''));
begin
  select * into setting from public.loyalty_settings where business_id=p_business_id;
  if not found then return null; end if;
  if email_value is null then select lower(email) into email_value from auth.users where id=p_customer_id; end if;

  select count(distinct id)::integer into completed
  from public.orders
  where business_id=p_business_id and status='DELIVERED'
    and (customer_id=p_customer_id or (email_value is not null and lower(nullif(btrim(customer_email),''))=email_value));

  select coalesce(sum(coins),0)::integer,
         coalesce(sum(coins) filter(where transaction_type in ('EARN','MANUAL_CREDIT')),0)::integer
  into balance,earned
  from public.loyalty_transactions
  where business_id=p_business_id and customer_id=p_customer_id;

  insert into public.loyalty_wallets(
    business_id,customer_id,balance_coins,lifetime_earned,completed_orders,tier,last_earned_at
  ) values(
    p_business_id,p_customer_id,greatest(0,balance),earned,completed,
    public.loyalty_tier(completed,setting.loyal_order_threshold,setting.vip_order_threshold),
    (select max(created_at) from public.loyalty_transactions where business_id=p_business_id and customer_id=p_customer_id and transaction_type='EARN')
  )
  on conflict(business_id,customer_id) do update set
    balance_coins=excluded.balance_coins,
    lifetime_earned=excluded.lifetime_earned,
    completed_orders=excluded.completed_orders,
    tier=excluded.tier,
    last_earned_at=excluded.last_earned_at,
    updated_at=now()
  returning * into result;
  return result;
end;
$$;

create or replace function public.loyalty_admin_dashboard(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_permission(p_business_id,'loyalty.manage') then
    raise exception 'Loyalty access denied.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'members',(select count(*) from public.loyalty_wallets where business_id=p_business_id),
    'outstandingCoins',(select coalesce(sum(balance_coins),0) from public.loyalty_wallets where business_id=p_business_id),
    'lifetimeIssued',(select coalesce(sum(coins),0) from public.loyalty_transactions where business_id=p_business_id and transaction_type in ('EARN','MANUAL_CREDIT')),
    'loyalCustomers',(select count(*) from public.loyalty_wallets where business_id=p_business_id and tier in ('LOYAL','VIP')),
    'vipCustomers',(select count(*) from public.loyalty_wallets where business_id=p_business_id and tier='VIP'),
    'wallets',coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.completed_orders desc,row_data.customer_name) from (
      select wallet.customer_id,
        coalesce(nullif(profile.full_name,''),auth_user.raw_user_meta_data->>'full_name',split_part(auth_user.email,'@',1)) customer_name,
        auth_user.email,wallet.balance_coins,wallet.lifetime_earned,wallet.completed_orders,wallet.tier,wallet.last_earned_at
      from public.loyalty_wallets wallet
      join auth.users auth_user on auth_user.id=wallet.customer_id
      left join public.profiles profile on profile.id=wallet.customer_id
      where wallet.business_id=p_business_id
    ) row_data),'[]'::jsonb)
  );
end;
$$;

commit;
