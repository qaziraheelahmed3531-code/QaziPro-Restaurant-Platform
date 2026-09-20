begin;

create or replace function public.create_order_authoritative(p_payload jsonb, p_customer_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_record record;
  product_record record;
  deal_record record;
  group_record record;
  option_record record;
  promotion_record record;
  area_record record;
  area_id_value uuid := null;
  area_name_value text := null;
  item jsonb;
  modifier jsonb;
  new_order_id uuid;
  new_item_id uuid;
  new_order_number text;
  tracking_token text;
  mode public.order_service_mode;
  payment public.payment_method;
  item_quantity integer;
  selected_count integer;
  unit_modifier_total integer;
  unit_total integer;
  subtotal_total integer := 0;
  discount_total integer := 0;
  delivery_total integer := 0;
  grand_total integer := 0;
  distance_value numeric(7,2);
  rule_record record;
  hours_record record;
begin
  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') < 1 or jsonb_array_length(p_payload->'items') > 50 then
    raise exception 'Order must contain between 1 and 50 items.' using errcode = '22023';
  end if;

  if p_customer_id is not null and not exists(select 1 from auth.users where id = p_customer_id) then
    raise exception 'Customer identity is invalid.' using errcode = '22023';
  end if;

  select b.*, business.id as resolved_business_id, business.timezone as resolved_timezone
  into branch_record
  from public.branches b
  join public.businesses business on business.id = b.business_id
  where b.id = (p_payload->>'branchId')::uuid
    and b.is_active and business.is_active and not b.temporarily_closed;

  if not found then raise exception 'Branch is not accepting orders.' using errcode = '22023'; end if;

  select * into hours_record from public.business_hours
  where branch_id = branch_record.id and day_of_week = extract(dow from (now() at time zone branch_record.resolved_timezone))::integer;
  if found and (
    hours_record.is_closed
    or (
      hours_record.opens_at <= hours_record.closes_at
      and (now() at time zone branch_record.resolved_timezone)::time not between hours_record.opens_at and hours_record.closes_at
    )
    or (
      hours_record.opens_at > hours_record.closes_at
      and (now() at time zone branch_record.resolved_timezone)::time < hours_record.opens_at
      and (now() at time zone branch_record.resolved_timezone)::time > hours_record.closes_at
    )
  ) then raise exception 'Restaurant is currently closed.' using errcode = '22023'; end if;

  mode := (p_payload->>'serviceMode')::public.order_service_mode;
  payment := coalesce((p_payload->>'paymentMethod')::public.payment_method, 'CASH_ON_DELIVERY');
  if payment <> 'CASH_ON_DELIVERY' then raise exception 'Online payment is not configured.' using errcode = '22023'; end if;
  if mode = 'DELIVERY' and not branch_record.delivery_enabled then raise exception 'Delivery is unavailable.' using errcode = '22023'; end if;
  if mode = 'PICKUP' and not branch_record.pickup_enabled then raise exception 'Pickup is unavailable.' using errcode = '22023'; end if;

  if mode = 'DELIVERY' then
    select * into area_record from public.delivery_areas
    where id = (p_payload->>'deliveryAreaId')::uuid and branch_id = branch_record.id and is_active;
    if not found then raise exception 'Delivery area is unavailable.' using errcode = '22023'; end if;
    area_id_value := area_record.id;
    area_name_value := area_record.name;
    if nullif(btrim(p_payload->>'deliveryAddress'), '') is null then raise exception 'Delivery address is required.' using errcode = '22023'; end if;
  end if;

  tracking_token := encode(extensions.gen_random_bytes(32), 'hex');
  new_order_number := 'IP-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');

  insert into public.orders(
    order_number, business_id, branch_id, customer_id, guest_tracking_hash,
    service_mode, payment_method, customer_name, customer_phone, customer_email,
    delivery_area_id, delivery_area_name, delivery_address, delivery_instructions,
    latitude, longitude, distance_km
  ) values (
    new_order_number, branch_record.business_id, branch_record.id, p_customer_id,
    case when p_customer_id is null then encode(digest(tracking_token, 'sha256'), 'hex') else null end,
    mode, payment,
    left(btrim(p_payload->>'customerName'), 120), left(btrim(p_payload->>'customerPhone'), 40), nullif(left(btrim(p_payload->>'customerEmail'), 254), ''),
    area_id_value,
    area_name_value,
    case when mode = 'DELIVERY' then left(btrim(p_payload->>'deliveryAddress'), 500) else null end,
    nullif(left(btrim(p_payload->>'deliveryInstructions'), 500), ''),
    nullif(p_payload->>'latitude', '')::numeric, nullif(p_payload->>'longitude', '')::numeric,
    nullif(p_payload->>'distanceKm', '')::numeric
  ) returning id, distance_km into new_order_id, distance_value;

  if nullif(btrim(p_payload->>'customerName'), '') is null or nullif(btrim(p_payload->>'customerPhone'), '') is null then
    raise exception 'Customer name and phone are required.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    item_quantity := (item->>'quantity')::integer;
    if item_quantity < 1 or item_quantity > 50 then raise exception 'Item quantity is invalid.' using errcode = '22023'; end if;

    select count(*) into selected_count from (
      select distinct selected->>'groupId', selected->>'optionId'
      from jsonb_array_elements(coalesce(item->'modifiers', '[]'::jsonb)) selected
    ) unique_modifiers;
    if selected_count <> jsonb_array_length(coalesce(item->'modifiers', '[]'::jsonb)) then
      raise exception 'Duplicate modifier selections are not allowed.' using errcode = '22023';
    end if;

    if coalesce(item->>'itemKind', 'product') = 'deal' then
      select d.*, d.deal_price as effective_price into deal_record
      from public.deals d
      where d.id = (item->>'productId')::uuid
        and d.business_id = branch_record.business_id and d.is_active
        and (d.starts_at is null or d.starts_at <= now())
        and (d.ends_at is null or d.ends_at > now());
      if not found then raise exception 'A selected deal is unavailable.' using errcode = '22023'; end if;

      insert into public.order_items(order_id, deal_id, product_name, quantity, unit_base_price, unit_price, line_total)
      values (new_order_id, deal_record.id, deal_record.name, item_quantity, deal_record.effective_price, deal_record.effective_price, deal_record.effective_price * item_quantity);
      subtotal_total := subtotal_total + deal_record.effective_price * item_quantity;
      continue;
    end if;

    select p.*, coalesce(p.sale_price, p.base_price) as effective_price
    into product_record
    from public.products p
    where p.id = (item->>'productId')::uuid
      and p.business_id = branch_record.business_id
      and p.is_active and p.is_available;
    if not found then raise exception 'A selected product is unavailable.' using errcode = '22023'; end if;

    for group_record in
      select g.* from public.modifier_groups g
      join public.product_modifier_groups pg on pg.modifier_group_id = g.id
      where pg.product_id = product_record.id and g.is_active
    loop
      select count(*) into selected_count
      from jsonb_array_elements(coalesce(item->'modifiers', '[]'::jsonb)) selected
      where selected->>'groupId' = group_record.id::text;
      if selected_count < group_record.min_selections
        or (group_record.max_selections is not null and selected_count > group_record.max_selections) then
        raise exception 'Modifier selections are invalid for %.', group_record.name using errcode = '22023';
      end if;
    end loop;

    insert into public.order_items(order_id, product_id, product_name, quantity, unit_base_price, unit_price, line_total)
    values (new_order_id, product_record.id, product_record.name, item_quantity, product_record.effective_price, product_record.effective_price, product_record.effective_price * item_quantity)
    returning id into new_item_id;

    unit_modifier_total := 0;
    for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers', '[]'::jsonb)) loop
      select option.id, option.name, option.price_adjustment, group_table.id as group_id, group_table.name as group_name
      into option_record
      from public.modifier_options option
      join public.modifier_groups group_table on group_table.id = option.modifier_group_id
      join public.product_modifier_groups assignment on assignment.modifier_group_id = group_table.id
      where assignment.product_id = product_record.id
        and group_table.id = (modifier->>'groupId')::uuid
        and option.id = (modifier->>'optionId')::uuid
        and group_table.is_active and option.is_active;
      if not found then raise exception 'A selected modifier is unavailable.' using errcode = '22023'; end if;

      unit_modifier_total := unit_modifier_total + option_record.price_adjustment;
      insert into public.order_item_modifiers(order_item_id, modifier_group_id, modifier_option_id, group_name, option_name, price_adjustment)
      values (new_item_id, option_record.group_id, option_record.id, option_record.group_name, option_record.name, option_record.price_adjustment);
    end loop;

    unit_total := product_record.effective_price + unit_modifier_total;
    update public.order_items set unit_modifier_price = unit_modifier_total, unit_price = unit_total, line_total = unit_total * item_quantity where id = new_item_id;
    subtotal_total := subtotal_total + unit_total * item_quantity;
  end loop;

  if nullif(upper(btrim(p_payload->>'promoCode')), '') is not null then
    select * into promotion_record from public.promotions
    where business_id = branch_record.business_id
      and code = upper(btrim(p_payload->>'promoCode')) and is_active
      and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now());
    if found then
      discount_total := case promotion_record.discount_type
        when 'FIXED' then least(subtotal_total, promotion_record.discount_value)
        else least(subtotal_total, floor(subtotal_total * promotion_record.discount_value / 100.0)::integer)
      end;
      if promotion_record.maximum_discount is not null then discount_total := least(discount_total, promotion_record.maximum_discount); end if;
    end if;
  end if;

  if mode = 'DELIVERY' then
    select * into rule_record from public.delivery_rules where branch_id = branch_record.id;
    if not found or distance_value is null or distance_value < 0 then raise exception 'Delivery distance is required.' using errcode = '22023'; end if;
    delivery_total := case when distance_value <= rule_record.free_distance_km then 0 else ceil(distance_value - rule_record.free_distance_km)::integer * rule_record.extra_km_rate end;
  end if;

  grand_total := greatest(0, subtotal_total - discount_total + delivery_total);
  update public.orders set subtotal=subtotal_total, discount=discount_total, delivery_fee=delivery_total, total=grand_total where id=new_order_id;

  return jsonb_build_object(
    'id', new_order_id,
    'orderNumber', new_order_number,
    'status', 'RECEIVED',
    'subtotal', subtotal_total,
    'discount', discount_total,
    'deliveryFee', delivery_total,
    'total', grand_total,
    'guestTrackingToken', case when p_customer_id is null then tracking_token else null end
  );
end;
$$;

revoke all on function public.create_order_authoritative(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_order_authoritative(jsonb, uuid) to service_role;

commit;
