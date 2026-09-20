-- Enum values are isolated so PostgreSQL commits them before the next migration uses them.
alter type public.staff_role add value if not exists 'CASHIER';
alter type public.staff_role add value if not exists 'KITCHEN';

alter type public.payment_status add value if not exists 'AUTHORIZED';
alter type public.payment_status add value if not exists 'CANCELLED';
alter type public.payment_status add value if not exists 'PARTIALLY_REFUNDED';
