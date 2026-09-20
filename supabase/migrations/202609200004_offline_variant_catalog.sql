begin;

-- Offline POS catalog proofs must use the same branch price and variant rules as
-- online POS. Legacy snapshots remain valid so queued orders are not stranded.
create or replace function public.register_desktop_pos_catalog(
  p_branch_id uuid,
  p_device_id uuid,
  p_device_name text,
  p_app_version text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business uuid;
  existing_device public.pos_offline_devices;
  snapshot_id uuid;
  snapshot_prices jsonb;
  snapshot_rules jsonb;
begin
  select branch.business_id into target_business
  from public.branches branch
  join public.businesses business on business.id = branch.business_id
  where branch.id = p_branch_id and branch.is_active and business.is_active;

  if target_business is null
    or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business, 'pos.use') then
    raise exception 'Desktop POS access denied.' using errcode = '42501';
  end if;
  if p_device_id is null or char_length(btrim(coalesce(p_device_name, ''))) not between 1 and 120
    or char_length(btrim(coalesce(p_app_version, ''))) not between 1 and 40 then
    raise exception 'Desktop device details are invalid.' using errcode = '22023';
  end if;

  select * into existing_device from public.pos_offline_devices where id = p_device_id for update;
  if found and (existing_device.business_id <> target_business or existing_device.branch_id <> p_branch_id) then
    raise exception 'This desktop device is already paired with another restaurant.' using errcode = '42501';
  end if;
  if found and not existing_device.is_active then
    raise exception 'This desktop POS device has been disabled by an administrator.' using errcode = '42501';
  end if;

  insert into public.pos_offline_devices(id, business_id, branch_id, device_name, app_version, registered_by, last_catalog_at)
  values(p_device_id, target_business, p_branch_id, left(btrim(p_device_name),120), left(btrim(p_app_version),40), auth.uid(), now())
  on conflict(id) do update set
    device_name = excluded.device_name,
    app_version = excluded.app_version,
    last_catalog_at = now(),
    updated_at = now();

  select coalesce(jsonb_object_agg(source.key, source.value), '{}'::jsonb) into snapshot_prices
  from (
    select 'product:' || product.id::text as key,
      to_jsonb(coalesce(override.price_override, product.sale_price, product.base_price)) as value
    from public.products product
    left join public.branch_product_overrides override
      on override.business_id=product.business_id and override.branch_id=p_branch_id and override.product_id=product.id
    where product.business_id=target_business and product.is_active
      and coalesce(override.is_available,product.is_available)
      and coalesce(override.stock_available,true)
      and coalesce(override.pos_visible,true)
    union all
    select 'product:' || product.id::text || ':' || variant.id::text,
      to_jsonb(coalesce(override.price_override, product.sale_price, product.base_price)+variant.price_adjustment)
    from public.products product
    join public.product_variants variant on variant.product_id=product.id and variant.is_active
    left join public.branch_product_overrides override
      on override.business_id=product.business_id and override.branch_id=p_branch_id and override.product_id=product.id
    where product.business_id=target_business and product.is_active
      and coalesce(override.is_available,product.is_available)
      and coalesce(override.stock_available,true)
      and coalesce(override.pos_visible,true)
      and coalesce(override.price_override, product.sale_price, product.base_price)+variant.price_adjustment>=0
    union all
    select 'deal:' || deal.id::text, to_jsonb(deal.deal_price)
    from public.deals deal
    where deal.business_id = target_business and deal.is_active
      and (deal.starts_at is null or deal.starts_at <= now())
      and (deal.ends_at is null or deal.ends_at > now())
    union all
    select 'modifier:' || assignment.product_id::text || ':' || groups.id::text || ':' || option.id::text,
      to_jsonb(option.price_adjustment)
    from public.product_modifier_groups assignment
    join public.products product on product.id = assignment.product_id
    join public.modifier_groups groups on groups.id = assignment.modifier_group_id
    join public.modifier_options option on option.modifier_group_id = groups.id
    left join public.branch_product_overrides override
      on override.business_id=product.business_id and override.branch_id=p_branch_id and override.product_id=product.id
    where product.business_id=target_business and product.is_active
      and coalesce(override.is_available,product.is_available)
      and coalesce(override.stock_available,true)
      and coalesce(override.pos_visible,true)
      and groups.is_active and option.is_active
  ) source;

  select coalesce(jsonb_object_agg(source.key, source.value), '{}'::jsonb) into snapshot_rules
  from (
    select 'group:' || assignment.product_id::text || ':' || groups.id::text as key,
      jsonb_build_object('min', groups.min_selections, 'max', groups.max_selections) as value
    from public.product_modifier_groups assignment
    join public.products product on product.id = assignment.product_id
    join public.modifier_groups groups on groups.id = assignment.modifier_group_id
    left join public.branch_product_overrides override
      on override.business_id=product.business_id and override.branch_id=p_branch_id and override.product_id=product.id
    where product.business_id=target_business and product.is_active
      and coalesce(override.is_available,product.is_available)
      and coalesce(override.stock_available,true)
      and coalesce(override.pos_visible,true)
      and groups.is_active
    union all
    select 'variant-required:' || product.id::text, 'true'::jsonb
    from public.products product
    left join public.branch_product_overrides override
      on override.business_id=product.business_id and override.branch_id=p_branch_id and override.product_id=product.id
    where product.business_id=target_business and product.is_active
      and coalesce(override.is_available,product.is_available)
      and coalesce(override.stock_available,true)
      and coalesce(override.pos_visible,true)
      and exists(select 1 from public.product_variants variant where variant.product_id=product.id and variant.is_active)
  ) source;

  insert into public.pos_catalog_snapshots(business_id, branch_id, device_id, prices, rules, created_by)
  values(target_business, p_branch_id, p_device_id, snapshot_prices, snapshot_rules, auth.uid())
  returning id into snapshot_id;

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_business, auth.uid(), 'DESKTOP_POS_CATALOG_DOWNLOADED', 'pos_offline_devices', p_device_id::text,
    jsonb_build_object('branchId', p_branch_id, 'catalogSnapshotId', snapshot_id, 'appVersion', left(btrim(p_app_version),40)));

  return snapshot_id;
end;
$$;

create or replace function public.apply_offline_pos_items(
  p_order_id uuid,
  p_business_id uuid,
  p_snapshot_id uuid,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  snapshot public.pos_catalog_snapshots;
  item jsonb;
  modifier jsonb;
  rule_entry record;
  product_record record;
  deal_record record;
  option_record record;
  new_item_id uuid;
  item_id uuid;
  variant_id uuid;
  group_id uuid;
  option_id uuid;
  item_kind text;
  price_key text;
  variant_name_value text;
  quantity integer;
  base_price integer;
  modifier_price integer;
  unit_price integer;
  expected_price integer;
  selected_count integer;
  subtotal integer := 0;
begin
  select * into snapshot from public.pos_catalog_snapshots where id = p_snapshot_id and business_id = p_business_id;
  if not found then raise exception 'Offline catalog snapshot is invalid.' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Offline order must contain between 1 and 50 items.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    item_kind := coalesce(nullif(item->>'itemKind',''), 'product');
    if item_kind not in ('product','deal') then raise exception 'Offline item type is invalid.' using errcode = '22023'; end if;
    item_id := (item->>'productId')::uuid;
    variant_id := nullif(item->>'variantId','')::uuid;
    quantity := nullif(item->>'quantity','')::integer;
    base_price := nullif(item->>'unitBasePrice','')::integer;
    modifier_price := coalesce(nullif(item->>'unitModifierPrice','')::integer, 0);
    unit_price := nullif(item->>'unitPrice','')::integer;
    if quantity is null or quantity < 1 or quantity > 50 or base_price is null or base_price < 0
      or modifier_price < 0 or unit_price is null or unit_price <> base_price + modifier_price then
      raise exception 'Offline item totals are invalid.' using errcode = '22023';
    end if;

    if item_kind='deal' and variant_id is not null then
      raise exception 'Offline deals cannot contain a product variant.' using errcode='22023';
    end if;
    price_key:=item_kind||':'||item_id::text||case when variant_id is null then '' else ':'||variant_id::text end;
    expected_price := nullif(snapshot.prices->>price_key, '')::integer;
    if expected_price is null or expected_price <> base_price then
      raise exception 'Offline item price does not match its downloaded catalog.' using errcode = '22023';
    end if;

    select count(*) into selected_count from (
      select distinct chosen->>'groupId', chosen->>'optionId'
      from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) chosen
    ) unique_choices;
    if selected_count <> jsonb_array_length(coalesce(item->'modifiers','[]'::jsonb)) then
      raise exception 'Duplicate offline modifiers are not allowed.' using errcode = '22023';
    end if;

    if item_kind = 'deal' then
      if jsonb_array_length(coalesce(item->'modifiers','[]'::jsonb)) <> 0 then
        raise exception 'Offline deals cannot contain product modifiers.' using errcode = '22023';
      end if;
      select id, name into deal_record from public.deals where id = item_id and business_id = p_business_id;
      if not found then raise exception 'An offline deal no longer exists.' using errcode = '22023'; end if;
      insert into public.order_items(order_id, deal_id, product_name, quantity, unit_base_price, unit_modifier_price, unit_price, line_total)
      values(p_order_id, deal_record.id, deal_record.name, quantity, base_price, 0, unit_price, unit_price * quantity);
      subtotal := subtotal + unit_price * quantity;
      continue;
    end if;

    select id, name into product_record from public.products where id = item_id and business_id = p_business_id;
    if not found then raise exception 'An offline product no longer exists.' using errcode = '22023'; end if;
    if variant_id is null and coalesce((snapshot.rules->>('variant-required:'||item_id::text))::boolean,false) then
      raise exception 'Choose a product variant.' using errcode='22023';
    end if;
    if variant_id is not null then
      select variant.name into variant_name_value
      from public.product_variants variant
      where variant.id=variant_id and variant.product_id=item_id;
      if not found then raise exception 'An offline product variant no longer exists.' using errcode='22023'; end if;
    end if;

    for rule_entry in select key, value from jsonb_each(snapshot.rules)
      where key like 'group:' || item_id::text || ':%'
    loop
      group_id := split_part(rule_entry.key, ':', 3)::uuid;
      select count(*) into selected_count
      from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) chosen
      where chosen->>'groupId' = group_id::text;
      if selected_count < (rule_entry.value->>'min')::integer
        or ((rule_entry.value->>'max') is not null and selected_count > (rule_entry.value->>'max')::integer) then
        raise exception 'Offline modifier selections do not satisfy the downloaded catalog.' using errcode = '22023';
      end if;
    end loop;

    insert into public.order_items(order_id, product_id, variant_id, variant_name, product_name, quantity, unit_base_price, unit_modifier_price, unit_price, line_total)
    values(p_order_id, product_record.id, variant_id, variant_name_value, product_record.name, quantity, base_price, modifier_price, unit_price, unit_price * quantity)
    returning id into new_item_id;

    expected_price := 0;
    for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers','[]'::jsonb)) loop
      group_id := (modifier->>'groupId')::uuid;
      option_id := (modifier->>'optionId')::uuid;
      if not snapshot.prices ? ('modifier:' || item_id::text || ':' || group_id::text || ':' || option_id::text) then
        raise exception 'Offline modifier is not part of this product catalog.' using errcode = '22023';
      end if;
      if (snapshot.prices->>('modifier:' || item_id::text || ':' || group_id::text || ':' || option_id::text))::integer
          <> nullif(modifier->>'price','')::integer then
        raise exception 'Offline modifier price does not match its downloaded catalog.' using errcode = '22023';
      end if;
      select groups.id as group_id, groups.name as group_name, option.id, option.name
      into option_record
      from public.modifier_groups groups
      join public.modifier_options option on option.modifier_group_id = groups.id
      where groups.id = group_id and option.id = option_id;
      if not found then raise exception 'An offline modifier no longer exists.' using errcode = '22023'; end if;
      expected_price := expected_price + (modifier->>'price')::integer;
      insert into public.order_item_modifiers(order_item_id, modifier_group_id, modifier_option_id, group_name, option_name, price_adjustment)
      values(new_item_id, group_id, option_id, option_record.group_name, option_record.name, (modifier->>'price')::integer);
    end loop;
    if expected_price <> modifier_price then raise exception 'Offline modifier total is invalid.' using errcode = '22023'; end if;
    subtotal := subtotal + unit_price * quantity;
  end loop;
  return subtotal;
end;
$$;

revoke all on function public.register_desktop_pos_catalog(uuid,uuid,text,text) from public,anon;
grant execute on function public.register_desktop_pos_catalog(uuid,uuid,text,text) to authenticated;
revoke all on function public.apply_offline_pos_items(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

commit;
