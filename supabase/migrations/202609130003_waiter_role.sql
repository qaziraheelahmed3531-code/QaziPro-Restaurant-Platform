-- PostgreSQL enum values must be committed before they can be used by later
-- migrations. The waiter workflow is installed in the next migration.
alter type public.staff_role add value if not exists 'WAITER';
