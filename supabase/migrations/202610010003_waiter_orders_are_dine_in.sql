begin;

-- Waiter table orders predate the DINE_IN service-mode enum. Their canonical
-- helper already marks operational_order_type as DINE_IN, but the legacy
-- pricing call initially inserts PICKUP. Normalize the same order row during
-- that helper's update so POS/KDS/reports all see one consistent order mode.
create or replace function public.normalize_waiter_dine_in_service_mode()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.waiter_id is not null
    and new.operational_order_type='DINE_IN'
    and nullif(btrim(new.table_reference),'') is not null then
    new.service_mode:='DINE_IN';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_waiter_dine_in_service_mode on public.orders;
create trigger normalize_waiter_dine_in_service_mode
before insert or update of waiter_id,operational_order_type,table_reference
on public.orders for each row
execute function public.normalize_waiter_dine_in_service_mode();

update public.orders
set service_mode='DINE_IN'
where waiter_id is not null
  and operational_order_type='DINE_IN'
  and nullif(btrim(table_reference),'') is not null
  and service_mode<>'DINE_IN';

revoke all on function public.normalize_waiter_dine_in_service_mode() from public,anon,authenticated;

commit;
