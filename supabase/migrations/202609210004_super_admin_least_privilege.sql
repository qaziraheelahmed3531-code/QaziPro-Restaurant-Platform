begin;

-- Platform dashboard uses an authorized aggregate RPC. A directory permission
-- must not grant row-level access to every customer's full order/PII record.
drop policy if exists platform_orders_summary_read on public.orders;

commit;
