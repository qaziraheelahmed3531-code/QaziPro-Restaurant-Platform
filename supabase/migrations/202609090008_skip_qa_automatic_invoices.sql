begin;

create or replace function public.create_order_invoice_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(coalesce(new.customer_name, '')) like '%DO NOT FULFILL%'
     or upper(coalesce(new.customer_name, '')) like 'QA %' then
    return new;
  end if;
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
  perform public.ensure_order_invoice(new.order_id);
  return new;
end;
$$;

commit;
