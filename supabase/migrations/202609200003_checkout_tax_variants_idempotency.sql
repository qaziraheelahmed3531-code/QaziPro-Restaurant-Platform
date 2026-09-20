begin;

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_name text;
create index if not exists order_items_variant_idx on public.order_items(variant_id) where variant_id is not null;

create table public.checkout_idempotency (
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null check(length(request_hash)=64),
  order_id uuid not null references public.orders(id) on delete cascade,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  primary key (business_id,branch_id,idempotency_key),
  check(char_length(idempotency_key) between 8 and 128)
);
create index checkout_idempotency_expiry_idx on public.checkout_idempotency(expires_at);
alter table public.checkout_idempotency enable row level security;
revoke all on public.checkout_idempotency from public,anon,authenticated;

create or replace function public.create_order_authoritative(p_payload jsonb,p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  branch_record record; product_record record; variant_record record; override_record record;
  deal_record record; group_record record; option_record record; promotion_record record;
  area_record record; rule_record record; hours_record record;
  item jsonb; modifier jsonb; result jsonb; existing_request public.checkout_idempotency;
  new_order_id uuid; new_item_id uuid; new_order_number text; tracking_token text;
  area_id_value uuid:=null; area_name_value text:=null; v_idempotency_key text;
  payload_hash text; channel_value text; business_prefix text;
  mode public.order_service_mode; payment public.payment_method;
  item_quantity integer; selected_count integer; unit_modifier_total integer;
  unit_total integer; subtotal_total integer:=0; discount_total integer:=0;
  delivery_total integer:=0; tax_total integer:=0; grand_total integer:=0;
  effective_base_price integer; distance_value numeric(7,2); tax_rate_value integer:=0;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>100000 then
    raise exception 'Order request is invalid.' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items')<1 or jsonb_array_length(p_payload->'items')>50 then
    raise exception 'Order must contain between 1 and 50 items.' using errcode='22023';
  end if;
  if p_customer_id is not null and not exists(select 1 from auth.users where id=p_customer_id) then raise exception 'Customer identity is invalid.' using errcode='22023'; end if;

  channel_value:=case when p_payload->>'channel'='POS' then 'POS' else 'WEBSITE' end;
  select b.*,business.timezone resolved_timezone,business.slug business_slug into branch_record
  from public.branches b join public.businesses business on business.id=b.business_id
  where b.id=(p_payload->>'branchId')::uuid and b.is_active and business.is_active and not b.temporarily_closed;
  if not found then raise exception 'Branch is not accepting orders.' using errcode='22023'; end if;
  if channel_value='WEBSITE' and not branch_record.online_ordering_enabled then raise exception 'Online ordering is currently paused.' using errcode='22023'; end if;

  v_idempotency_key:=nullif(btrim(p_payload->>'idempotencyKey'),'');
  if channel_value='WEBSITE' and (v_idempotency_key is null or v_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$') then
    raise exception 'A valid idempotency key is required.' using errcode='22023';
  end if;
  if v_idempotency_key is not null then
    payload_hash:=encode(extensions.digest((p_payload-'idempotencyKey')::text,'sha256'),'hex');
    perform pg_advisory_xact_lock(hashtextextended(branch_record.business_id::text||':'||branch_record.id::text||':'||v_idempotency_key,0));
    select request.* into existing_request
    from public.checkout_idempotency request
    where request.business_id=branch_record.business_id
      and request.branch_id=branch_record.id
      and request.idempotency_key=v_idempotency_key;
    if found then
      if existing_request.request_hash<>payload_hash then raise exception 'Idempotency key was already used for a different order.' using errcode='22023'; end if;
      return existing_request.response_payload||jsonb_build_object('idempotent',true);
    end if;
  end if;

  select * into hours_record from public.business_hours where branch_id=branch_record.id and day_of_week=extract(dow from (now() at time zone branch_record.resolved_timezone))::integer;
  if found and (hours_record.is_closed or (hours_record.opens_at<=hours_record.closes_at and (now() at time zone branch_record.resolved_timezone)::time not between hours_record.opens_at and hours_record.closes_at) or (hours_record.opens_at>hours_record.closes_at and (now() at time zone branch_record.resolved_timezone)::time<hours_record.opens_at and (now() at time zone branch_record.resolved_timezone)::time>hours_record.closes_at)) then
    raise exception 'Restaurant is currently closed.' using errcode='22023';
  end if;

  begin mode:=(p_payload->>'serviceMode')::public.order_service_mode; exception when others then raise exception 'Order service mode is invalid.' using errcode='22023'; end;
  payment:=coalesce((p_payload->>'paymentMethod')::public.payment_method,'CASH_ON_DELIVERY');
  if payment<>'CASH_ON_DELIVERY' then raise exception 'Online payment is not configured.' using errcode='22023'; end if;
  if mode='DELIVERY' and not branch_record.delivery_enabled then raise exception 'Delivery is unavailable.' using errcode='22023'; end if;
  if mode='PICKUP' and not branch_record.pickup_enabled then raise exception 'Pickup is unavailable.' using errcode='22023'; end if;
  if nullif(btrim(p_payload->>'customerName'),'') is null or nullif(btrim(p_payload->>'customerPhone'),'') is null then raise exception 'Customer name and phone are required.' using errcode='22023'; end if;

  if mode='DELIVERY' then
    select * into area_record from public.delivery_areas where id=(p_payload->>'deliveryAreaId')::uuid and branch_id=branch_record.id and is_active;
    if not found then raise exception 'Delivery area is unavailable.' using errcode='22023'; end if;
    area_id_value:=area_record.id; area_name_value:=area_record.name;
    if nullif(btrim(p_payload->>'deliveryAddress'),'') is null then raise exception 'Delivery address is required.' using errcode='22023'; end if;
  end if;

  tracking_token:=encode(extensions.gen_random_bytes(32),'hex');
  business_prefix:=upper(left(regexp_replace(branch_record.business_slug,'[^a-zA-Z0-9]','','g'),4));
  if business_prefix='' then business_prefix:='QP'; end if;
  new_order_number:=business_prefix||'-'||to_char(current_date,'YYYYMMDD')||'-'||lpad(nextval('public.order_number_seq')::text,6,'0');
  insert into public.orders(order_number,business_id,branch_id,customer_id,guest_tracking_hash,channel,operational_order_type,service_mode,payment_method,customer_name,customer_phone,customer_email,delivery_area_id,delivery_area_name,delivery_address,delivery_instructions,latitude,longitude,distance_km,location_source)
  values(new_order_number,branch_record.business_id,branch_record.id,p_customer_id,case when p_customer_id is null then encode(extensions.digest(tracking_token,'sha256'),'hex') end,channel_value,case when channel_value='POS' then 'TAKEAWAY' else mode::text end,mode,payment,left(btrim(p_payload->>'customerName'),120),left(btrim(p_payload->>'customerPhone'),40),nullif(left(btrim(p_payload->>'customerEmail'),254),''),area_id_value,area_name_value,case when mode='DELIVERY' then left(btrim(p_payload->>'deliveryAddress'),500) end,nullif(left(btrim(p_payload->>'deliveryInstructions'),500),''),nullif(p_payload->>'latitude','')::numeric,nullif(p_payload->>'longitude','')::numeric,nullif(p_payload->>'distanceKm','')::numeric,case when mode='DELIVERY' then case when p_payload->>'locationSource' in ('GPS','AUTOCOMPLETE','MAP_PIN','SAVED_ADDRESS','MANUAL_AREA') then p_payload->>'locationSource' else 'MANUAL_AREA' end end)
  returning id,distance_km into new_order_id,distance_value;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    begin item_quantity:=(item->>'quantity')::integer; exception when others then raise exception 'Item quantity is invalid.' using errcode='22023'; end;
    if item_quantity<1 or item_quantity>50 then raise exception 'Item quantity is invalid.' using errcode='22023'; end if;
    select count(*) into selected_count from (select distinct selected->>'groupId',selected->>'optionId' from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) selected) unique_modifiers;
    if selected_count<>jsonb_array_length(coalesce(item->'modifiers','[]'::jsonb)) then raise exception 'Duplicate modifier selections are not allowed.' using errcode='22023'; end if;

    if coalesce(item->>'itemKind','product')='deal' then
      select d.*,d.deal_price effective_price into deal_record from public.deals d where d.id=(item->>'productId')::uuid and d.business_id=branch_record.business_id and d.is_active and (d.starts_at is null or d.starts_at<=now()) and (d.ends_at is null or d.ends_at>now());
      if not found then raise exception 'A selected deal is unavailable.' using errcode='22023'; end if;
      insert into public.order_items(order_id,deal_id,product_name,quantity,unit_base_price,unit_price,line_total) values(new_order_id,deal_record.id,deal_record.name,item_quantity,deal_record.effective_price,deal_record.effective_price,deal_record.effective_price*item_quantity);
      subtotal_total:=subtotal_total+deal_record.effective_price*item_quantity; continue;
    end if;

    select p.* into product_record from public.products p where p.id=(item->>'productId')::uuid and p.business_id=branch_record.business_id and p.is_active;
    if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
    select * into override_record from public.branch_product_overrides where business_id=branch_record.business_id and branch_id=branch_record.id and product_id=product_record.id;
    if not coalesce(override_record.is_available,product_record.is_available) or not coalesce(override_record.stock_available,true)
      or (channel_value='POS' and not coalesce(override_record.pos_visible,true))
      or (channel_value='WEBSITE' and not coalesce(override_record.online_visible,true)) then raise exception 'A selected product is unavailable at this branch.' using errcode='22023'; end if;
    effective_base_price:=coalesce(override_record.price_override,product_record.sale_price,product_record.base_price);

    if nullif(item->>'variantId','') is not null then
      select * into variant_record from public.product_variants where id=(item->>'variantId')::uuid and product_id=product_record.id and is_active;
      if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
    elsif exists(select 1 from public.product_variants where product_id=product_record.id and is_active) then
      select * into variant_record from public.product_variants where product_id=product_record.id and is_active and is_default order by sort_order,id limit 1;
      if not found then raise exception 'Choose a product variant.' using errcode='22023'; end if;
    else
      select * into variant_record from public.product_variants where false;
    end if;
    effective_base_price:=effective_base_price+coalesce(variant_record.price_adjustment,0);
    if effective_base_price<0 then raise exception 'Product variant pricing is invalid.' using errcode='22023'; end if;

    for group_record in select g.* from public.modifier_groups g join public.product_modifier_groups pg on pg.modifier_group_id=g.id where pg.product_id=product_record.id and g.is_active loop
      select count(*) into selected_count from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) selected where selected->>'groupId'=group_record.id::text;
      if selected_count<group_record.min_selections or (group_record.max_selections is not null and selected_count>group_record.max_selections) then raise exception 'Modifier selections are invalid for %.',group_record.name using errcode='22023'; end if;
    end loop;
    insert into public.order_items(order_id,product_id,variant_id,variant_name,product_name,quantity,unit_base_price,unit_price,line_total)
    values(new_order_id,product_record.id,variant_record.id,variant_record.name,product_record.name,item_quantity,effective_base_price,effective_base_price,effective_base_price*item_quantity) returning id into new_item_id;
    unit_modifier_total:=0;
    for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) loop
      select option.id,option.name,option.price_adjustment,group_table.id group_id,group_table.name group_name into option_record
      from public.modifier_options option join public.modifier_groups group_table on group_table.id=option.modifier_group_id join public.product_modifier_groups assignment on assignment.modifier_group_id=group_table.id
      where assignment.product_id=product_record.id and group_table.id=(modifier->>'groupId')::uuid and option.id=(modifier->>'optionId')::uuid and group_table.is_active and option.is_active;
      if not found then raise exception 'A selected modifier is unavailable.' using errcode='22023'; end if;
      unit_modifier_total:=unit_modifier_total+option_record.price_adjustment;
      insert into public.order_item_modifiers(order_item_id,modifier_group_id,modifier_option_id,group_name,option_name,price_adjustment) values(new_item_id,option_record.group_id,option_record.id,option_record.group_name,option_record.name,option_record.price_adjustment);
    end loop;
    unit_total:=effective_base_price+unit_modifier_total;
    update public.order_items set unit_modifier_price=unit_modifier_total,unit_price=unit_total,line_total=unit_total*item_quantity where id=new_item_id;
    subtotal_total:=subtotal_total+unit_total*item_quantity;
  end loop;

  if nullif(upper(btrim(p_payload->>'promoCode')),'') is not null then
    select * into promotion_record from public.promotions where business_id=branch_record.business_id and code=upper(btrim(p_payload->>'promoCode')) and is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now());
    if found then discount_total:=case promotion_record.discount_type when 'FIXED' then least(subtotal_total,promotion_record.discount_value) else least(subtotal_total,floor(subtotal_total*promotion_record.discount_value/100.0)::integer) end; if promotion_record.maximum_discount is not null then discount_total:=least(discount_total,promotion_record.maximum_discount); end if; end if;
  end if;
  if mode='DELIVERY' then
    select * into rule_record from public.delivery_rules where branch_id=branch_record.id;
    if not found or distance_value is null or distance_value<0 then raise exception 'Delivery distance is required.' using errcode='22023'; end if;
    if rule_record.maximum_distance_km is not null and distance_value>rule_record.maximum_distance_km then raise exception 'Delivery address is outside this branch service range.' using errcode='22023'; end if;
    delivery_total:=case when distance_value<=rule_record.free_distance_km then 0 else ceil(distance_value-rule_record.free_distance_km)::integer*rule_record.extra_km_rate end;
  end if;
  select coalesce(settings.tax_rate_bps,0) into tax_rate_value
  from public.business_operating_settings settings
  where settings.business_id=branch_record.business_id;
  tax_rate_value:=coalesce(tax_rate_value,0);
  tax_total:=round(greatest(0,subtotal_total-discount_total)::numeric*tax_rate_value/10000)::integer;
  grand_total:=greatest(0,subtotal_total-discount_total+tax_total+delivery_total);
  update public.orders set subtotal=subtotal_total,discount=discount_total,tax=tax_total,delivery_fee=delivery_total,total=grand_total where id=new_order_id;
  result:=jsonb_build_object('id',new_order_id,'orderNumber',new_order_number,'status','RECEIVED','subtotal',subtotal_total,'discount',discount_total,'tax',tax_total,'deliveryFee',delivery_total,'total',grand_total,'guestTrackingToken',case when p_customer_id is null then tracking_token end,'idempotent',false);
  if v_idempotency_key is not null then insert into public.checkout_idempotency(business_id,branch_id,idempotency_key,request_hash,order_id,response_payload) values(branch_record.business_id,branch_record.id,v_idempotency_key,payload_hash,new_order_id,result); end if;
  return result;
end;
$$;

create or replace function public.create_order_with_loyalty(p_payload jsonb,p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; target public.orders; setting public.loyalty_settings; wallet public.loyalty_wallets;
  requested_text text:=coalesce(nullif(btrim(p_payload->>'loyaltyCoinsToRedeem'),''),'0'); requested integer;
  eligible_value integer; percent_value integer; maximum_coins integer; redemption_value integer; email_value text; tax_rate_value integer:=0;
begin
  if requested_text !~ '^[0-9]+$' or length(requested_text)>7 then raise exception 'Choose a valid number of loyalty coins.' using errcode='22023'; end if;
  requested:=requested_text::integer; if requested>1000000 then raise exception 'Choose a valid number of loyalty coins.' using errcode='22023'; end if;
  result:=public.create_order_authoritative(p_payload,p_customer_id);
  select * into target from public.orders where id=(result->>'id')::uuid for update;
  if coalesce((result->>'idempotent')::boolean,false) then
    return result||jsonb_build_object('loyaltyCoinsRedeemed',target.loyalty_coins_redeemed,'loyaltyDiscount',target.loyalty_discount,'discount',target.discount,'tax',target.tax,'total',target.total);
  end if;
  if requested=0 then return result||jsonb_build_object('loyaltyCoinsRedeemed',0,'loyaltyDiscount',0); end if;
  if p_customer_id is null then raise exception 'Sign in to use loyalty coins.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target.business_id::text||':'||p_customer_id::text,0));
  select * into setting from public.loyalty_settings where business_id=target.business_id;
  if not found or not setting.is_enabled or not setting.redemption_enabled then raise exception 'Loyalty coin redemption is currently unavailable.' using errcode='22023'; end if;
  select lower(email) into email_value from auth.users where id=p_customer_id and email_confirmed_at is not null;
  if email_value is null then raise exception 'Verify your email before using loyalty coins.' using errcode='22023'; end if;
  wallet:=public.refresh_loyalty_wallet(target.business_id,p_customer_id,email_value);
  eligible_value:=greatest(0,target.subtotal-target.discount); percent_value:=floor(eligible_value::numeric*setting.max_redeem_percent/100)::integer;
  maximum_coins:=least(wallet.balance_coins,floor(least(eligible_value,percent_value)::numeric/setting.coin_value_pkr)::integer);
  if requested<setting.minimum_redeem_coins then raise exception 'Use at least % loyalty coins.',setting.minimum_redeem_coins using errcode='22023'; end if;
  if requested>maximum_coins then raise exception 'You can use up to % loyalty coins on this order.',maximum_coins using errcode='22023'; end if;
  redemption_value:=requested*setting.coin_value_pkr;
  select coalesce(settings.tax_rate_bps,0) into tax_rate_value
  from public.business_operating_settings settings
  where settings.business_id=target.business_id;
  tax_rate_value:=coalesce(tax_rate_value,0);
  update public.orders set loyalty_coins_redeemed=requested,loyalty_discount=redemption_value,discount=discount+redemption_value,
    tax=round(greatest(0,subtotal-(discount+redemption_value))::numeric*tax_rate_value/10000)::integer,
    total=greatest(0,subtotal-(discount+redemption_value)+round(greatest(0,subtotal-(discount+redemption_value))::numeric*tax_rate_value/10000)::integer+delivery_fee)
  where id=target.id returning * into target;
  insert into public.loyalty_transactions(business_id,customer_id,normalized_email,order_id,transaction_type,coins,pkr_value,description,claimed_at) values(target.business_id,p_customer_id,email_value,target.id,'REDEEM',-requested,redemption_value,'Used on order '||target.order_number,now());
  wallet:=public.refresh_loyalty_wallet(target.business_id,p_customer_id,email_value);
  result:=result||jsonb_build_object('discount',target.discount,'tax',target.tax,'total',target.total,'loyaltyCoinsRedeemed',requested,'loyaltyDiscount',redemption_value,'loyaltyBalanceCoins',wallet.balance_coins);
  update public.checkout_idempotency set response_payload=result where order_id=target.id;
  return result;
end;
$$;

revoke all on function public.create_order_authoritative(jsonb,uuid),public.create_order_with_loyalty(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_order_authoritative(jsonb,uuid),public.create_order_with_loyalty(jsonb,uuid) to service_role;

commit;
