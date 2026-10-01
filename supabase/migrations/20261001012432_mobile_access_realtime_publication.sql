begin;

-- Restaurant staff may observe only the entitlement rows for a business where
-- they currently hold an active membership. This lets an already-open mobile
-- app stop privileged work as soon as Super Admin revokes a service, without
-- exposing another restaurant's plan or allowing any entitlement mutation.
drop policy if exists restaurant_staff_entitlements_read on public.service_entitlements;
create policy restaurant_staff_entitlements_read
on public.service_entitlements
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_memberships membership
    where membership.business_id = service_entitlements.business_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
  )
);

-- Postgres Changes only emits tables in the publication. Do not touch objects
-- in the locked-down realtime schema.
do $$
declare relation_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach relation_name in array array['service_entitlements','staff_memberships'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = relation_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', relation_name);
      end if;
    end loop;
  end if;
end $$;

commit;
