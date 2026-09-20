begin;

insert into public.admin_permissions(code,description,permission_group)
values ('loyalty.manage','Loyalty coins, customer wallets and reward settings','Customers')
on conflict(code) do update set description=excluded.description,permission_group=excluded.permission_group;

insert into public.admin_role_permissions(role,permission_code)
values ('MANAGER','loyalty.manage')
on conflict do nothing;

create table public.loyalty_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  is_enabled boolean not null default true,
  program_name text not null default 'Rewards Wallet' check(char_length(btrim(program_name)) between 2 and 80),
  coin_name text not null default 'Loyalty Coins' check(char_length(btrim(coin_name)) between 2 and 40),
  coins_per_100_pkr integer not null default 1 check(coins_per_100_pkr between 1 and 100),
  coin_value_pkr integer not null default 1 check(coin_value_pkr between 1 and 100),
  start_earning_order integer not null default 2 check(start_earning_order between 1 and 100),
  minimum_order_pkr integer not null default 300 check(minimum_order_pkr between 0 and 1000000),
  max_coins_per_order integer not null default 200 check(max_coins_per_order between 1 and 100000),
  loyal_order_threshold integer not null default 5 check(loyal_order_threshold between 1 and 10000),
  vip_order_threshold integer not null default 10 check(vip_order_threshold between 2 and 10000),
  website_orders_only boolean not null default true,
  show_earning_message boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(vip_order_threshold > loyal_order_threshold)
);

insert into public.loyalty_settings(business_id)
select id from public.businesses
on conflict do nothing;

create or replace function public.create_default_loyalty_settings()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.loyalty_settings(business_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger business_default_loyalty after insert on public.businesses
for each row execute function public.create_default_loyalty_settings();

create table public.loyalty_wallets (
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  balance_coins integer not null default 0 check(balance_coins >= 0),
  lifetime_earned integer not null default 0 check(lifetime_earned >= 0),
  completed_orders integer not null default 0 check(completed_orders >= 0),
  tier text not null default 'MEMBER' check(tier in ('MEMBER','LOYAL','VIP')),
  last_earned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(business_id,customer_id)
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid references auth.users(id) on delete cascade,
  normalized_email text,
  order_id uuid references public.orders(id) on delete cascade,
  transaction_type text not null check(transaction_type in ('EARN','MANUAL_CREDIT','MANUAL_DEBIT')),
  coins integer not null check(coins <> 0),
  pkr_value integer not null check(pkr_value >= 0),
  description text not null check(char_length(btrim(description)) between 2 and 240),
  created_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  check(customer_id is not null or normalized_email is not null)
);

create unique index loyalty_order_credit_once_idx on public.loyalty_transactions(order_id) where order_id is not null;
create index loyalty_transactions_customer_idx on public.loyalty_transactions(business_id,customer_id,created_at desc);
create index loyalty_transactions_pending_email_idx on public.loyalty_transactions(business_id,normalized_email) where customer_id is null;
create index loyalty_wallets_tier_idx on public.loyalty_wallets(business_id,tier,completed_orders desc);

create trigger loyalty_settings_updated_at before update on public.loyalty_settings
for each row execute function public.set_updated_at();
create trigger loyalty_wallets_updated_at before update on public.loyalty_wallets
for each row execute function public.set_updated_at();

create or replace function public.loyalty_tier(p_orders integer,p_loyal integer,p_vip integer)
returns text language sql immutable set search_path=public as $$
  select case when p_orders>=p_vip then 'VIP' when p_orders>=p_loyal then 'LOYAL' else 'MEMBER' end;
$$;

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
         coalesce(sum(coins) filter(where coins>0),0)::integer
  into balance,earned
  from public.loyalty_transactions
  where business_id=p_business_id and customer_id=p_customer_id;

  insert into public.loyalty_wallets(
    business_id,customer_id,balance_coins,lifetime_earned,completed_orders,tier,last_earned_at
  ) values(
    p_business_id,p_customer_id,greatest(0,balance),earned,completed,
    public.loyalty_tier(completed,setting.loyal_order_threshold,setting.vip_order_threshold),
    (select max(created_at) from public.loyalty_transactions where business_id=p_business_id and customer_id=p_customer_id and coins>0)
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

  if setting.is_enabled
     and completed>=setting.start_earning_order
     and eligible_spend>=setting.minimum_order_pkr
     and (not setting.website_orders_only or new.channel='WEBSITE') then
    award:=least(setting.max_coins_per_order,greatest(1,floor(eligible_spend::numeric/100)::integer*setting.coins_per_100_pkr));
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

create trigger order_loyalty_award after update of status on public.orders
for each row execute function public.award_order_loyalty();

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
      select id,order_id,transaction_type,coins,pkr_value,description,created_at
      from public.loyalty_transactions
      where business_id=p_business_id and customer_id=customer
      order by created_at desc limit 20
    ) recent),'[]'::jsonb)
  );
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
    'lifetimeIssued',(select coalesce(sum(coins),0) from public.loyalty_transactions where business_id=p_business_id and coins>0),
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

alter table public.loyalty_settings enable row level security;
alter table public.loyalty_wallets enable row level security;
alter table public.loyalty_transactions enable row level security;

grant select on public.loyalty_settings to anon,authenticated;
grant insert,update on public.loyalty_settings to authenticated;
grant select on public.loyalty_wallets,public.loyalty_transactions to authenticated;

create policy loyalty_settings_public_read on public.loyalty_settings for select using(true);
create policy loyalty_settings_admin_insert on public.loyalty_settings for insert to authenticated
with check(public.has_permission(business_id,'loyalty.manage'));
create policy loyalty_settings_admin_update on public.loyalty_settings for update to authenticated
using(public.has_permission(business_id,'loyalty.manage')) with check(public.has_permission(business_id,'loyalty.manage'));
create policy loyalty_wallet_read on public.loyalty_wallets for select to authenticated
using(customer_id=auth.uid() or public.has_permission(business_id,'loyalty.manage'));
create policy loyalty_transaction_read on public.loyalty_transactions for select to authenticated
using(customer_id=auth.uid() or public.has_permission(business_id,'loyalty.manage'));

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='loyalty_transactions') then
    alter publication supabase_realtime add table public.loyalty_transactions;
  end if;
end;
$$;

revoke all on function public.create_default_loyalty_settings(),public.loyalty_tier(integer,integer,integer),public.refresh_loyalty_wallet(uuid,uuid,text),public.customer_loyalty_wallet(uuid),public.loyalty_admin_dashboard(uuid),public.adjust_customer_loyalty(uuid,uuid,integer,text) from public,anon;
grant execute on function public.customer_loyalty_wallet(uuid) to authenticated;
grant execute on function public.loyalty_admin_dashboard(uuid),public.adjust_customer_loyalty(uuid,uuid,integer,text) to authenticated;

commit;
