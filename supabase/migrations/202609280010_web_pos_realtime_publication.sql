begin;
-- One unpublished relation can prevent the combined POS changefeed from joining.
-- Publish only existing operational tables; existing SELECT grants/RLS continue
-- to govern every recipient. Never expose private auth or payment records.
do $migration$
declare relation text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    raise exception 'Canonical realtime publication is missing';
  end if;
  foreach relation in array array['branch_product_overrides','pos_sections',
    'restaurant_tables','restaurant_table_sessions','business_operating_settings'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation and c.relrowsecurity) then
      raise exception 'RLS must be enabled before publishing %',relation;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename=relation) then
      execute format('alter publication supabase_realtime add table public.%I',relation);
    end if;
  end loop;
end;
$migration$;
commit;
