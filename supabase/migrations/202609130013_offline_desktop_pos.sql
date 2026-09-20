begin;

create table public.pos_offline_devices (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_name text not null check (char_length(btrim(device_name)) between 1 and 120),
  app_version text not null check (char_length(app_version) between 1 and 40),
  is_active boolean not null default true,
  registered_by uuid not null references auth.users(id) on delete restrict,
  last_catalog_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pos_offline_devices_business_idx on public.pos_offline_devices(business_id, updated_at desc);

create table public.pos_catalog_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_id uuid not null references public.pos_offline_devices(id) on delete cascade,
  prices jsonb not null check (jsonb_typeof(prices) = 'object'),
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index pos_catalog_snapshots_device_created_idx on public.pos_catalog_snapshots(device_id, created_at desc);

alter table public.register_shifts add column if not exists offline_device_id uuid references public.pos_offline_devices(id) on delete set null;
alter table public.register_shifts add column if not exists offline_shift_id text;
create unique index if not exists register_offline_shift_unique
  on public.register_shifts(business_id, offline_device_id, offline_shift_id)
  where offline_device_id is not null and offline_shift_id is not null;

alter table public.orders add column if not exists offline_device_id uuid references public.pos_offline_devices(id) on delete set null;
alter table public.orders add column if not exists offline_order_id text;
alter table public.orders add column if not exists offline_sold_at timestamptz;
alter table public.orders add column if not exists catalog_snapshot_id uuid references public.pos_catalog_snapshots(id) on delete set null;
create unique index if not exists orders_offline_order_unique
  on public.orders(business_id, offline_device_id, offline_order_id)
  where offline_device_id is not null and offline_order_id is not null;

create trigger pos_offline_devices_updated_at before update on public.pos_offline_devices
for each row execute function public.set_updated_at();

alter table public.pos_offline_devices enable row level security;
alter table public.pos_catalog_snapshots enable row level security;

create policy pos_offline_devices_read on public.pos_offline_devices
for select to authenticated using (
  public.has_permission(business_id, 'pos.use') or public.has_permission(business_id, 'settings.manage')
);
create policy pos_catalog_snapshots_read on public.pos_catalog_snapshots
for select to authenticated using (public.has_permission(business_id, 'pos.use'));

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

  if target_business is null or not public.has_permission(target_business, 'pos.use') then
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
    select 'product:' || product.id::text as key, to_jsonb(coalesce(product.sale_price, product.base_price)) as value
    from public.products product
    where product.business_id = target_business and product.is_active and product.is_available
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
    where product.business_id = target_business and product.is_active and product.is_available
      and groups.is_active and option.is_active
  ) source;

  select coalesce(jsonb_object_agg(source.key, source.value), '{}'::jsonb) into snapshot_rules
  from (
    select 'group:' || assignment.product_id::text || ':' || groups.id::text as key,
      jsonb_build_object('min', groups.min_selections, 'max', groups.max_selections) as value
    from public.product_modifier_groups assignment
    join public.products product on product.id = assignment.product_id
    join public.modifier_groups groups on groups.id = assignment.modifier_group_id
    where product.business_id = target_business and product.is_active and product.is_available and groups.is_active
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
  group_id uuid;
  option_id uuid;
  item_kind text;
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
    quantity := nullif(item->>'quantity','')::integer;
    base_price := nullif(item->>'unitBasePrice','')::integer;
    modifier_price := coalesce(nullif(item->>'unitModifierPrice','')::integer, 0);
    unit_price := nullif(item->>'unitPrice','')::integer;
    if quantity is null or quantity < 1 or quantity > 50 or base_price is null or base_price < 0
      or modifier_price < 0 or unit_price is null or unit_price <> base_price + modifier_price then
      raise exception 'Offline item totals are invalid.' using errcode = '22023';
    end if;

    expected_price := nullif(snapshot.prices->>(item_kind || ':' || item_id::text), '')::integer;
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

    insert into public.order_items(order_id, product_id, product_name, quantity, unit_base_price, unit_modifier_price, unit_price, line_total)
    values(p_order_id, product_record.id, product_record.name, quantity, base_price, modifier_price, unit_price, unit_price * quantity)
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

create or replace function public.sync_offline_pos_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_business uuid;
  business_timezone text;
  device public.pos_offline_devices;
  snapshot public.pos_catalog_snapshots;
  shift_record public.register_shifts;
  target_order public.orders;
  existing_order public.orders;
  replacement_record public.pos_order_replacements;
  old_invoice_id uuid;
  new_invoice_id uuid;
  device_id uuid;
  branch_id uuid;
  snapshot_id uuid;
  sold_at timestamptz;
  new_order_number text;
  offline_order text;
  offline_shift text;
  order_type text;
  subtotal integer;
  old_total integer;
  cash_received integer;
  old_items jsonb;
  replacement_items jsonb;
  is_replacement boolean;
  order_already_synced boolean := false;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 262144 then
    raise exception 'Offline order payload is invalid.' using errcode = '22023';
  end if;
  device_id := (p_payload->>'deviceId')::uuid;
  branch_id := (p_payload->>'branchId')::uuid;
  snapshot_id := (p_payload->>'catalogVersionId')::uuid;
  offline_order := btrim(coalesce(p_payload->>'offlineOrderId',''));
  offline_shift := btrim(coalesce(p_payload->>'offlineShiftId',''));
  sold_at := (p_payload->>'soldAt')::timestamptz;
  order_type := coalesce(nullif(p_payload->>'orderType',''), 'TAKEAWAY');
  cash_received := coalesce(nullif(p_payload->>'cashReceived','')::integer, 0);
  is_replacement := jsonb_typeof(p_payload->'replacement') = 'object';

  if char_length(offline_order) not between 8 and 100 or char_length(offline_shift) not between 8 and 100
    or offline_order !~ '^[A-Za-z0-9._:-]+$' or offline_shift !~ '^[A-Za-z0-9._:-]+$'
    or order_type not in ('TAKEAWAY','DINE_IN') or sold_at > now() + interval '5 minutes' then
    raise exception 'Offline order identity is invalid.' using errcode = '22023';
  end if;

  select branch.business_id, business.timezone into target_business, business_timezone
  from public.branches branch join public.businesses business on business.id = branch.business_id
  where branch.id = branch_id and branch.is_active and business.is_active;
  if target_business is null or not public.has_permission(target_business, 'pos.use') then
    raise exception 'Offline POS sync access denied.' using errcode = '42501';
  end if;

  select * into device from public.pos_offline_devices offline_device
  where offline_device.id = device_id and offline_device.business_id = target_business and offline_device.branch_id = branch_id for update;
  if not found or not device.is_active then raise exception 'This offline POS device is not active.' using errcode = '42501'; end if;
  select * into snapshot from public.pos_catalog_snapshots catalog_snapshot
  where catalog_snapshot.id = snapshot_id and catalog_snapshot.device_id = device_id
    and catalog_snapshot.business_id = target_business and catalog_snapshot.branch_id = branch_id;
  if not found then raise exception 'Offline catalog proof is invalid.' using errcode = '42501'; end if;
  if sold_at < snapshot.created_at - interval '10 minutes' then
    raise exception 'This sale predates the catalog downloaded by the device.' using errcode = '22023';
  end if;

  select * into existing_order from public.orders synced_order
  where synced_order.business_id = target_business and synced_order.offline_device_id = device_id and synced_order.offline_order_id = offline_order
  for update;
  order_already_synced := found;
  if found and not is_replacement then
    return jsonb_build_object('id',existing_order.id,'orderNumber',existing_order.order_number,
      'tokenNumber',existing_order.token_number,'total',existing_order.total,'change',greatest(0,cash_received-existing_order.total),'idempotent',true);
  end if;
  if found and exists(select 1 from public.pos_order_replacements where order_id = existing_order.id) then
    return jsonb_build_object('id',existing_order.id,'orderNumber',existing_order.order_number,
      'tokenNumber',existing_order.token_number,'total',existing_order.total,'change',greatest(0,cash_received-existing_order.total),'idempotent',true,'replaced',true);
  end if;

  select * into shift_record from public.register_shifts synced_shift
  where synced_shift.business_id = target_business and synced_shift.offline_device_id = device_id and synced_shift.offline_shift_id = offline_shift for update;
  if not found then
    insert into public.register_shifts(
      business_id, branch_id, opened_by, closed_by, status, opening_cash, expected_cash,
      counted_cash, difference, notes, opened_at, closed_at, offline_device_id, offline_shift_id
    ) values (
      target_business, branch_id, auth.uid(), auth.uid(), 'CLOSED',
      greatest(0,coalesce(nullif(p_payload->>'openingCash','')::integer,0)), 0,
      case when nullif(p_payload->>'countedCash','') is null then null else greatest(0,(p_payload->>'countedCash')::integer) end,
      null, 'Synced from offline desktop POS',
      least(coalesce(nullif(p_payload->>'shiftOpenedAt','')::timestamptz,sold_at),sold_at),
      greatest(coalesce(nullif(p_payload->>'shiftClosedAt','')::timestamptz,sold_at),sold_at),
      device_id, offline_shift
    ) returning * into shift_record;
  end if;

  if order_already_synced then
    target_order := existing_order;
    if target_order.channel <> 'POS' or target_order.status <> 'CONFIRMED' then
      raise exception 'Only an unprepared offline POS order can be replaced.' using errcode = '22023';
    end if;
    old_total := target_order.total;
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId', line.product_id, 'dealId', line.deal_id, 'name', line.product_name,
      'quantity', line.quantity, 'unitPrice', line.unit_price, 'lineTotal', line.line_total,
      'modifiers', coalesce((select jsonb_agg(jsonb_build_object('groupId',chosen.modifier_group_id,'optionId',chosen.modifier_option_id,
        'groupName',chosen.group_name,'optionName',chosen.option_name,'priceAdjustment',chosen.price_adjustment))
        from public.order_item_modifiers chosen where chosen.order_item_id=line.id),'[]'::jsonb)
    ) order by line.created_at,line.id),'[]'::jsonb) into old_items
    from public.order_items line where line.order_id = target_order.id;
    insert into public.pos_order_replacements(business_id,branch_id,order_id,replaced_by,reason,old_items,new_items,old_total,new_total,cash_adjustment)
    values(target_business,branch_id,target_order.id,auth.uid(),left(btrim(p_payload->'replacement'->>'reason'),500),old_items,'[]'::jsonb,old_total,0,0)
    returning * into replacement_record;
    select id into old_invoice_id from public.invoices where order_id=target_order.id and status<>'VOID' limit 1 for update;
    if old_invoice_id is not null then
      update public.invoices set status='VOID',void_reason='Offline POS order replacement.',voided_at=now(),updated_at=now() where id=old_invoice_id;
    end if;
    delete from public.order_items where order_id=target_order.id;
  else
    new_order_number := 'IP-' || to_char((sold_at at time zone business_timezone)::date,'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text,6,'0');
    insert into public.orders(
      order_number,business_id,branch_id,channel,operational_order_type,service_mode,status,payment_method,payment_status,
      customer_name,customer_phone,customer_email,subtotal,discount,delivery_fee,tax,total,placed_at,created_at,
      business_date,client_reference,order_notes,table_reference,offline_device_id,offline_order_id,offline_sold_at,catalog_snapshot_id
    ) values (
      new_order_number,target_business,branch_id,'POS',order_type,'PICKUP','RECEIVED','CASH_ON_DELIVERY','UNPAID',
      coalesce(nullif(left(btrim(p_payload->>'customerName'),120),''),'Counter guest'),
      coalesce(nullif(left(btrim(p_payload->>'customerPhone'),40),''),'Counter'),null,
      0,0,0,0,0,sold_at,sold_at,(sold_at at time zone business_timezone)::date,
      'offline:'||device_id::text||':'||offline_order,nullif(left(btrim(p_payload->>'notes'),500),''),
      case when order_type='DINE_IN' then nullif(left(btrim(p_payload->>'tableReference'),80),'') else null end,
      device_id,offline_order,sold_at,snapshot_id
    ) returning * into target_order;
    old_total := coalesce(nullif(p_payload->'replacement'->>'oldTotal','')::integer,0);
    old_items := coalesce(p_payload->'replacement'->'oldItems','[]'::jsonb);
  end if;

  subtotal := public.apply_offline_pos_items(target_order.id,target_business,snapshot_id,p_payload->'items');
  if cash_received < subtotal then raise exception 'Cash received is less than the offline order total.' using errcode='22023'; end if;
  update public.orders set subtotal=subtotal,discount=0,delivery_fee=0,tax=0,total=subtotal,
    payment_status='PAID',payment_reference='OFFLINE_CASH',status='CONFIRMED',updated_at=now(),catalog_snapshot_id=snapshot_id
  where id=target_order.id returning * into target_order;

  insert into public.payment_transactions(
    business_id,branch_id,order_id,shift_id,provider,payment_method,idempotency_key,amount,status,paid_at,metadata_safe
  ) values (
    target_business,branch_id,target_order.id,shift_record.id,'OFFLINE_POS_CASH','CASH',
    'offline-pos:'||device_id::text||':'||offline_order,subtotal,'PAID',sold_at,
    jsonb_build_object('deviceId',device_id,'offlineOrderId',offline_order,'catalogSnapshotId',snapshot_id)
  ) on conflict(business_id,idempotency_key) do update set amount=excluded.amount,updated_at=now();

  if is_replacement then
    if replacement_record.id is null then
      if jsonb_typeof(old_items)<>'array' or char_length(btrim(coalesce(p_payload->'replacement'->>'reason','')))<3 then
        raise exception 'Offline replacement audit details are invalid.' using errcode='22023';
      end if;
      insert into public.pos_order_replacements(business_id,branch_id,order_id,replaced_by,reason,old_items,new_items,old_total,new_total,cash_adjustment)
      values(target_business,branch_id,target_order.id,auth.uid(),left(btrim(p_payload->'replacement'->>'reason'),500),old_items,'[]'::jsonb,old_total,0,0)
      returning * into replacement_record;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'productId',line.product_id,'dealId',line.deal_id,'name',line.product_name,'quantity',line.quantity,
      'unitPrice',line.unit_price,'lineTotal',line.line_total,
      'modifiers',coalesce((select jsonb_agg(jsonb_build_object('groupId',chosen.modifier_group_id,'optionId',chosen.modifier_option_id,
        'groupName',chosen.group_name,'optionName',chosen.option_name,'priceAdjustment',chosen.price_adjustment))
        from public.order_item_modifiers chosen where chosen.order_item_id=line.id),'[]'::jsonb)
    ) order by line.created_at,line.id),'[]'::jsonb) into replacement_items
    from public.order_items line where line.order_id=target_order.id;
    update public.pos_order_replacements set new_items=replacement_items,new_total=subtotal,cash_adjustment=subtotal-old_total where id=replacement_record.id;
    insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
    values(target_business,auth.uid(),'OFFLINE_POS_ORDER_REPLACED','orders',target_order.id::text,
      jsonb_build_object('replacementId',replacement_record.id,'oldTotal',old_total,'newTotal',subtotal,'deviceId',device_id));
    if old_invoice_id is not null then
      new_invoice_id := public.ensure_order_invoice(target_order.id);
      if new_invoice_id is not null then update public.invoices set reissued_from=old_invoice_id where id=new_invoice_id; end if;
    end if;
  end if;

  update public.register_shifts set
    expected_cash = opening_cash + coalesce((select sum(payment.amount) from public.payment_transactions payment
      where payment.shift_id=shift_record.id and payment.payment_method='CASH' and payment.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')),0),
    difference = case when counted_cash is null then null else counted_cash - (opening_cash + coalesce((select sum(payment.amount)
      from public.payment_transactions payment where payment.shift_id=shift_record.id and payment.payment_method='CASH'
      and payment.status in ('PAID','PARTIALLY_REFUNDED','REFUNDED')),0)) end,
    closed_at=greatest(coalesce(closed_at,sold_at),sold_at),updated_at=now()
  where id=shift_record.id;
  update public.pos_offline_devices offline_device set last_sync_at=now(),updated_at=now() where offline_device.id=device_id;

  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target_business,auth.uid(),'OFFLINE_POS_ORDER_SYNCED','orders',target_order.id::text,
    jsonb_build_object('deviceId',device_id,'offlineOrderId',offline_order,'catalogSnapshotId',snapshot_id,'replaced',is_replacement));

  return jsonb_build_object('id',target_order.id,'orderNumber',target_order.order_number,'tokenNumber',target_order.token_number,
    'total',target_order.total,'change',cash_received-target_order.total,'idempotent',false,'replaced',is_replacement);
end;
$$;

create or replace function public.set_desktop_pos_device_active(p_device_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare target public.pos_offline_devices;
begin
  select * into target from public.pos_offline_devices where id=p_device_id for update;
  if not found or not public.has_permission(target.business_id,'settings.manage') then
    raise exception 'Desktop POS device management denied.' using errcode='42501';
  end if;
  update public.pos_offline_devices set is_active=p_active,updated_at=now() where id=p_device_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(target.business_id,auth.uid(),case when p_active then 'DESKTOP_POS_DEVICE_ENABLED' else 'DESKTOP_POS_DEVICE_DISABLED' end,
    'pos_offline_devices',p_device_id::text,jsonb_build_object('branchId',target.branch_id));
end;
$$;

revoke all on function public.register_desktop_pos_catalog(uuid,uuid,text,text) from public,anon;
revoke all on function public.apply_offline_pos_items(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.sync_offline_pos_order(jsonb) from public,anon;
revoke all on function public.set_desktop_pos_device_active(uuid,boolean) from public,anon;
grant execute on function public.register_desktop_pos_catalog(uuid,uuid,text,text) to authenticated;
grant execute on function public.sync_offline_pos_order(jsonb) to authenticated;
grant execute on function public.set_desktop_pos_device_active(uuid,boolean) to authenticated;
grant select on public.pos_offline_devices,public.pos_catalog_snapshots to authenticated;

commit;
