begin;

create table if not exists public.pos_order_replacements (
  id uuid primary key default extensions.gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  replaced_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  old_items jsonb not null,
  new_items jsonb not null,
  old_total integer not null check (old_total >= 0),
  new_total integer not null check (new_total >= 0),
  cash_adjustment integer not null,
  created_at timestamptz not null default now(),
  unique(order_id)
);

create index if not exists pos_order_replacements_business_created_idx
  on public.pos_order_replacements(business_id, created_at desc);

alter table public.pos_order_replacements enable row level security;

drop policy if exists pos_replacements_staff_read on public.pos_order_replacements;
create policy pos_replacements_staff_read on public.pos_order_replacements
for select to authenticated
using (
  public.has_permission(business_id, 'pos.use')
  or public.has_permission(business_id, 'orders.read')
  or public.has_permission(business_id, 'reports.read')
);

create or replace function public.replace_pos_order(p_order_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders;
  shift_record public.register_shifts;
  product_record record;
  deal_record record;
  group_record record;
  option_record record;
  payment_record public.payment_transactions;
  item jsonb;
  modifier jsonb;
  old_snapshot jsonb;
  new_snapshot jsonb;
  replacement_id uuid;
  old_invoice_id uuid;
  new_invoice_id uuid;
  new_item_id uuid;
  item_quantity integer;
  selected_count integer;
  unit_modifier_total integer;
  unit_total integer;
  subtotal_total integer := 0;
  difference integer;
  cash_received integer := 0;
begin
  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or not public.has_permission(target_order.business_id, 'pos.use') then
    raise exception 'POS replacement access denied.' using errcode = '42501';
  end if;
  if target_order.channel <> 'POS' then
    raise exception 'Only counter POS orders can be replaced.' using errcode = '22023';
  end if;
  if target_order.status <> 'CONFIRMED' then
    raise exception 'Replacement is available only before kitchen preparation starts.' using errcode = '22023';
  end if;
  if target_order.created_at < now() - interval '10 minutes' then
    raise exception 'The 10-minute replacement window has expired.' using errcode = '22023';
  end if;
  if exists(select 1 from public.pos_order_replacements where order_id = target_order.id) then
    raise exception 'This POS order has already been replaced once.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array'
    or jsonb_array_length(p_payload->'items') < 1
    or jsonb_array_length(p_payload->'items') > 50 then
    raise exception 'Replacement must contain between 1 and 50 items.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_payload->>'reason', ''))) < 3 then
    raise exception 'Enter a short reason for this replacement.' using errcode = '22023';
  end if;

  select * into shift_record
  from public.register_shifts
  where id = (p_payload->>'shiftId')::uuid
    and branch_id = target_order.branch_id
    and opened_by = auth.uid()
    and status = 'OPEN'
  for update;
  if not found then
    raise exception 'Open your register shift before replacing a counter order.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', line.id,
    'productId', line.product_id,
    'dealId', line.deal_id,
    'name', line.product_name,
    'quantity', line.quantity,
    'unitPrice', line.unit_price,
    'lineTotal', line.line_total,
    'modifiers', coalesce((select jsonb_agg(jsonb_build_object(
      'groupId', chosen.modifier_group_id,
      'optionId', chosen.modifier_option_id,
      'groupName', chosen.group_name,
      'optionName', chosen.option_name,
      'priceAdjustment', chosen.price_adjustment
    ) order by chosen.created_at) from public.order_item_modifiers chosen where chosen.order_item_id = line.id), '[]'::jsonb)
  ) order by line.created_at, line.id), '[]'::jsonb)
  into old_snapshot
  from public.order_items line
  where line.order_id = target_order.id;

  insert into public.pos_order_replacements(
    business_id, branch_id, order_id, replaced_by, reason,
    old_items, new_items, old_total, new_total, cash_adjustment
  ) values (
    target_order.business_id, target_order.branch_id, target_order.id, auth.uid(),
    left(btrim(p_payload->>'reason'), 500), old_snapshot, '[]'::jsonb,
    target_order.total, 0, 0
  ) returning id into replacement_id;

  select id into old_invoice_id
  from public.invoices
  where order_id = target_order.id and status <> 'VOID'
  limit 1
  for update;
  if old_invoice_id is not null then
    update public.invoices
    set status = 'VOID',
        void_reason = 'POS order replaced within the approved 10-minute correction window.',
        voided_at = now(),
        updated_at = now()
    where id = old_invoice_id;
  end if;

  delete from public.order_items where order_id = target_order.id;

  for item in select value from jsonb_array_elements(p_payload->'items') loop
    item_quantity := nullif(item->>'quantity', '')::integer;
    if item_quantity is null or item_quantity < 1 or item_quantity > 50 then
      raise exception 'Item quantity is invalid.' using errcode = '22023';
    end if;

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
        and d.business_id = target_order.business_id
        and d.is_active
        and (d.starts_at is null or d.starts_at <= now())
        and (d.ends_at is null or d.ends_at > now());
      if not found then raise exception 'A selected deal is unavailable.' using errcode = '22023'; end if;

      insert into public.order_items(order_id, deal_id, product_name, quantity, unit_base_price, unit_price, line_total)
      values(target_order.id, deal_record.id, deal_record.name, item_quantity, deal_record.effective_price, deal_record.effective_price, deal_record.effective_price * item_quantity);
      subtotal_total := subtotal_total + deal_record.effective_price * item_quantity;
      continue;
    end if;

    select p.*, coalesce(p.sale_price, p.base_price) as effective_price into product_record
    from public.products p
    where p.id = (item->>'productId')::uuid
      and p.business_id = target_order.business_id
      and p.is_active and p.is_available;
    if not found then raise exception 'A selected product is unavailable.' using errcode = '22023'; end if;

    for group_record in
      select groups.*
      from public.modifier_groups groups
      join public.product_modifier_groups assignment on assignment.modifier_group_id = groups.id
      where assignment.product_id = product_record.id and groups.is_active
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
    values(target_order.id, product_record.id, product_record.name, item_quantity, product_record.effective_price, product_record.effective_price, product_record.effective_price * item_quantity)
    returning id into new_item_id;

    unit_modifier_total := 0;
    for modifier in select value from jsonb_array_elements(coalesce(item->'modifiers', '[]'::jsonb)) loop
      select option.id, option.name, option.price_adjustment, groups.id as group_id, groups.name as group_name
      into option_record
      from public.modifier_options option
      join public.modifier_groups groups on groups.id = option.modifier_group_id
      join public.product_modifier_groups assignment on assignment.modifier_group_id = groups.id
      where assignment.product_id = product_record.id
        and groups.id = (modifier->>'groupId')::uuid
        and option.id = (modifier->>'optionId')::uuid
        and groups.is_active and option.is_active;
      if not found then raise exception 'A selected modifier is unavailable.' using errcode = '22023'; end if;

      unit_modifier_total := unit_modifier_total + option_record.price_adjustment;
      insert into public.order_item_modifiers(order_item_id, modifier_group_id, modifier_option_id, group_name, option_name, price_adjustment)
      values(new_item_id, option_record.group_id, option_record.id, option_record.group_name, option_record.name, option_record.price_adjustment);
    end loop;

    unit_total := product_record.effective_price + unit_modifier_total;
    update public.order_items
    set unit_modifier_price = unit_modifier_total,
        unit_price = unit_total,
        line_total = unit_total * item_quantity
    where id = new_item_id;
    subtotal_total := subtotal_total + unit_total * item_quantity;
  end loop;

  difference := subtotal_total - target_order.total;
  cash_received := coalesce(nullif(p_payload->>'cashReceived', '')::integer, 0);

  if difference > 0 then
    if cash_received < difference then
      raise exception 'Collect the additional cash before saving this replacement.' using errcode = '22023';
    end if;
    insert into public.payment_transactions(
      business_id, branch_id, order_id, shift_id, provider, payment_method,
      idempotency_key, amount, status, paid_at, metadata_safe
    ) values (
      target_order.business_id, target_order.branch_id, target_order.id, shift_record.id,
      'CASH', 'CASH', 'pos-replacement-charge-' || replacement_id, difference, 'PAID', now(),
      jsonb_build_object('replacementId', replacement_id, 'kind', 'ADDITIONAL_CASH')
    );
  elsif difference < 0 then
    select * into payment_record
    from public.payment_transactions
    where order_id = target_order.id
      and payment_method = 'CASH'
      and status in ('PAID', 'PARTIALLY_REFUNDED')
    order by created_at
    limit 1
    for update;
    if not found or payment_record.amount < abs(difference) then
      raise exception 'The original cash payment cannot cover this replacement refund.' using errcode = '22023';
    end if;
    insert into public.refunds(
      business_id, payment_id, order_id, amount, reason, status,
      requested_by, completed_at, cash_shift_id
    ) values (
      target_order.business_id, payment_record.id, target_order.id, abs(difference),
      'POS item replacement: ' || left(btrim(p_payload->>'reason'), 440),
      'SUCCEEDED', auth.uid(), now(), shift_record.id
    );
    update public.payment_transactions
    set status = case when payment_record.amount = abs(difference) then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
        refunded_at = now(),
        updated_at = now()
    where id = payment_record.id;
  end if;

  update public.orders
  set subtotal = subtotal_total,
      discount = 0,
      delivery_fee = 0,
      tax = 0,
      total = subtotal_total,
      payment_status = 'PAID',
      updated_at = now()
  where id = target_order.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', line.id,
    'productId', line.product_id,
    'dealId', line.deal_id,
    'name', line.product_name,
    'quantity', line.quantity,
    'unitPrice', line.unit_price,
    'lineTotal', line.line_total,
    'modifiers', coalesce((select jsonb_agg(jsonb_build_object(
      'groupId', chosen.modifier_group_id,
      'optionId', chosen.modifier_option_id,
      'groupName', chosen.group_name,
      'optionName', chosen.option_name,
      'priceAdjustment', chosen.price_adjustment
    ) order by chosen.created_at) from public.order_item_modifiers chosen where chosen.order_item_id = line.id), '[]'::jsonb)
  ) order by line.created_at, line.id), '[]'::jsonb)
  into new_snapshot
  from public.order_items line
  where line.order_id = target_order.id;

  update public.pos_order_replacements
  set new_items = new_snapshot,
      new_total = subtotal_total,
      cash_adjustment = difference
  where id = replacement_id;

  insert into public.order_status_history(order_id, status, changed_by, note)
  values(target_order.id, target_order.status, auth.uid(), 'POS items replaced before preparation: ' || left(btrim(p_payload->>'reason'), 380));

  insert into public.audit_logs(business_id, actor_id, action, entity_type, entity_id, metadata)
  values(target_order.business_id, auth.uid(), 'POS_ORDER_REPLACED', 'orders', target_order.id::text,
    jsonb_build_object('replacementId', replacement_id, 'oldTotal', target_order.total, 'newTotal', subtotal_total, 'cashAdjustment', difference));

  if old_invoice_id is not null then
    new_invoice_id := public.ensure_order_invoice(target_order.id);
    if new_invoice_id is not null then
      update public.invoices set reissued_from = old_invoice_id where id = new_invoice_id;
    end if;
  end if;

  return jsonb_build_object(
    'id', target_order.id,
    'orderNumber', target_order.order_number,
    'tokenNumber', target_order.token_number,
    'replacementId', replacement_id,
    'oldTotal', target_order.total,
    'total', subtotal_total,
    'cashAdjustment', difference,
    'change', greatest(0, cash_received - greatest(0, difference)),
    'refund', greatest(0, -difference)
  );
end;
$$;

revoke all on function public.replace_pos_order(uuid, jsonb) from public, anon;
grant execute on function public.replace_pos_order(uuid, jsonb) to authenticated;
grant select on public.pos_order_replacements to authenticated;

commit;
