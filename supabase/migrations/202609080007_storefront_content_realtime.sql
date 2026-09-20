-- Publish only existing customer-readable content; RLS remains in force.
do $$ declare item text; begin
  foreach item in array array['businesses','business_branding','site_settings','social_links','footer_links','content_pages','branches','business_hours','delivery_rules','delivery_areas'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=item) then
      execute format('alter publication supabase_realtime add table public.%I',item);
    end if;
  end loop;
end $$;
