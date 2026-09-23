-- Run against an isolated database after migrations. No fixture data is changed.
\set ON_ERROR_STOP on
begin;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'branches'
      and policyname = 'scoped_cms_write'
      and qual like '%staff_can_access_branch%'
  ) then
    raise exception 'Branch writes are not scoped to assigned branches';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('branches', 'business_hours', 'delivery_areas', 'delivery_rules')
      and policyname in ('branches_staff_write', 'hours_staff_write', 'areas_staff_write', 'rules_staff_write')
  ) then
    raise exception 'Legacy broad branch write policy is still active';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.platform_demo_requests'::regclass) then
    raise exception 'Demo leads RLS is disabled';
  end if;
  if has_table_privilege('anon', 'public.platform_demo_requests', 'SELECT')
    or has_table_privilege('anon', 'public.platform_demo_requests', 'INSERT')
    or has_table_privilege('authenticated', 'public.platform_demo_requests', 'SELECT')
    or has_table_privilege('authenticated', 'public.platform_demo_requests', 'INSERT') then
    raise exception 'Demo leads are exposed to a browser role';
  end if;
end;
$$;

rollback;
