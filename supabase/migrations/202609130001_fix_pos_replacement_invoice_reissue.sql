begin;

-- A replacement writes its audit shell before rebuilding order_items. Do not
-- auto-create a finalized invoice from the first new line while that rebuild
-- is still in progress; replace_pos_order creates the complete invoice after
-- all lines, modifiers and authoritative order totals have been persisted.
create or replace function public.create_pos_invoice_after_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.orders orders
    where orders.id = new.order_id
      and (
        upper(coalesce(orders.customer_name, '')) like '%DO NOT FULFILL%'
        or upper(coalesce(orders.customer_name, '')) like 'QA %'
      )
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.pos_order_replacements replacement
    where replacement.order_id = new.order_id
      and replacement.new_items = '[]'::jsonb
  ) then
    return new;
  end if;

  perform public.ensure_order_invoice(new.order_id);
  return new;
end;
$$;

-- Finalized invoice values remain immutable. The only additional permitted
-- mutation is a one-time link to the void predecessor for the same order.
create or replace function public.guard_finalized_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('FINALIZED','VOID') and
    (to_jsonb(new) - array['status','void_reason','voided_at','updated_at','reissued_from'])
      is distinct from
    (to_jsonb(old) - array['status','void_reason','voided_at','updated_at','reissued_from']) then
    raise exception 'Finalized invoices cannot be rewritten. Void and reissue instead.' using errcode='22023';
  end if;

  if old.reissued_from is distinct from new.reissued_from and (
    old.reissued_from is not null
    or new.reissued_from is null
    or old.order_id is null
    or not exists (
      select 1 from public.invoices predecessor
      where predecessor.id = new.reissued_from
        and predecessor.order_id = old.order_id
        and predecessor.business_id = old.business_id
        and predecessor.status = 'VOID'
    )
  ) then
    raise exception 'Invoice reissue linkage is invalid.' using errcode='22023';
  end if;

  if old.status='VOID' or (old.status='FINALIZED' and new.status not in ('FINALIZED','VOID')) then
    raise exception 'Invalid invoice transition.' using errcode='22023';
  end if;
  return new;
end;
$$;

commit;
