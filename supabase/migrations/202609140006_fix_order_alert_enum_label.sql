begin;

create or replace function public.notify_new_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.channel <> 'WEBSITE' then
    return new;
  end if;
  insert into public.notifications(
    business_id, notification_type, title, message,
    entity_type, entity_id, dedupe_key
  ) values (
    new.business_id,
    'NEW_ORDER',
    'New website ' || lower(new.service_mode::text) || ' order',
    new.order_number || ' · Token ' || lpad(new.token_number::text, 3, '0'),
    'orders',
    new.id::text,
    'order-' || new.id
  ) on conflict do nothing;
  return new;
end;
$$;

commit;
