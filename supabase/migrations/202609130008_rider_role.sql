-- PostgreSQL requires a committed enum value before it can be used by the
-- following rider workflow migration.
alter type public.staff_role add value if not exists 'RIDER';
