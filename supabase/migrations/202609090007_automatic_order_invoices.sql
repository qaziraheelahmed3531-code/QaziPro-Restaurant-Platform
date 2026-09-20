begin;

-- System-generated order invoices do not have an Admin author. Manual invoices
-- continue to record auth.uid() through save_invoice.
alter table public.invoices alter column created_by drop not null;

create or replace function public.ensure_order_invoice(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_order public.orders;
  settings public.invoice_settings;
  invoice_id uuid;
  sequence_value integer;
  v_invoice_year integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 0));

  select * into source_order from public.orders where id = p_order_id;
  if not found or source_order.status not in ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED') then
    return null;
  end if;

  select id into invoice_id
  from public.invoices
  where order_id = p_order_id and status <> 'VOID'
  limit 1;
  if invoice_id is not null then return invoice_id; end if;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then return null; end if;
  select * into settings from public.invoice_settings where business_id = source_order.business_id;
  if not found then return null; end if;

  perform 1 from public.businesses where id = source_order.business_id for update;
  v_invoice_year := extract(year from source_order.created_at at time zone 'Asia/Karachi');
  insert into public.invoice_sequences(business_id, invoice_year, next_value)
  values(source_order.business_id, v_invoice_year, 2)
  on conflict(business_id, invoice_year)
  do update set next_value = public.invoice_sequences.next_value + 1
  returning next_value - 1 into sequence_value;

  insert into public.invoices(
    business_id, branch_id, order_id, order_number, invoice_number,
    invoice_date, customer_name, customer_phone, customer_email,
    billing_address, status, subtotal, discount, tax, charges, total,
    notes, terms, template_snapshot, created_by, finalized_at
  ) values (
    source_order.business_id, source_order.branch_id, source_order.id,
    source_order.order_number,
    settings.invoice_prefix || '-' || v_invoice_year || '-' || lpad(sequence_value::text, greatest(6, length(sequence_value::text)), '0'),
    (source_order.created_at at time zone 'Asia/Karachi')::date,
    source_order.customer_name, source_order.customer_phone,
    source_order.customer_email, source_order.delivery_address, 'DRAFT',
    source_order.subtotal, source_order.discount, source_order.tax,
    source_order.delivery_fee, source_order.total, source_order.order_notes,
    settings.terms, to_jsonb(settings), null, null
  ) returning id into invoice_id;

  insert into public.invoice_lines(
    invoice_id, description, quantity, unit_price, discount, tax,
    line_total, sort_order
  )
  select
    invoice_id,
    item.product_name || coalesce((
      select ' · ' || string_agg(modifier.group_name || ': ' || modifier.option_name, ', ' order by modifier.created_at)
      from public.order_item_modifiers modifier
      where modifier.order_item_id = item.id
    ), ''),
    item.quantity, item.unit_price, 0, 0, item.line_total,
    row_number() over(order by item.created_at, item.id)::integer
  from public.order_items item
  where item.order_id = p_order_id;

  update public.invoices
  set status = 'FINALIZED', finalized_at = now(), updated_at = now()
  where id = invoice_id;

  return invoice_id;
end;
$$;

revoke all on function public.ensure_order_invoice(uuid) from public, anon, authenticated;

create or replace function public.create_order_invoice_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_order_invoice(new.id);
  return new;
end;
$$;

create or replace function public.create_pos_invoice_after_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_order_invoice(new.order_id);
  return new;
end;
$$;

drop trigger if exists orders_automatic_invoice on public.orders;
create trigger orders_automatic_invoice
after update of status on public.orders
for each row
when (
  old.status is distinct from new.status and
  new.status in ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
)
execute function public.create_order_invoice_on_status();

drop trigger if exists pos_order_automatic_invoice on public.order_items;
create constraint trigger pos_order_automatic_invoice
after insert or update on public.order_items
deferrable initially deferred
for each row
execute function public.create_pos_invoice_after_items();

-- Bring existing valid orders into the same order-invoice view without
-- touching cancelled orders or rewriting any historical order snapshot.
do $$
declare row_data record;
begin
  for row_data in
    select orders.id
    from public.orders orders
    where orders.status in ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED')
      and exists (select 1 from public.order_items items where items.order_id = orders.id)
      and not exists (select 1 from public.invoices invoices where invoices.order_id = orders.id and invoices.status <> 'VOID')
  loop
    perform public.ensure_order_invoice(row_data.id);
  end loop;
end;
$$;

commit;
