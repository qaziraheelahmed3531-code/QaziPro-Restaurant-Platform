begin;
-- Dine-in is not delivery. Preserve delivery's mandatory serviceable address.
alter table public.orders drop constraint orders_check;
alter table public.orders add constraint orders_check check (
  service_mode in ('PICKUP','DINE_IN') or (delivery_area_id is not null and delivery_address is not null)
);
commit;
