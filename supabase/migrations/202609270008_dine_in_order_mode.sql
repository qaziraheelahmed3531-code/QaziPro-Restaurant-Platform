-- Commit the enum value before the following migration uses it.
alter type public.order_service_mode add value if not exists 'DINE_IN';
