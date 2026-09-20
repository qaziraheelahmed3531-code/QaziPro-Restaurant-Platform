begin;

-- pgcrypto is installed in the extensions schema. Recreate existing order RPCs
-- from their current definitions with explicit resolution, without replacing
-- the authoritative order logic with a second hand-maintained implementation.
create schema if not exists extensions;
do $$
declare installed_schema text;
begin
  select n.nspname into installed_schema
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  if installed_schema is null then
    execute 'create extension pgcrypto with schema extensions';
  elsif installed_schema <> 'extensions' then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end $$;

do $$
declare
  item record;
  definition text;
begin
  for item in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* '(^|[^.[:alnum:]_])gen_random_bytes\('
  loop
    definition := pg_get_functiondef(item.oid);
    definition := replace(definition, 'extensions.gen_random_bytes(', '__IP_GEN_RANDOM_BYTES__(');
    definition := replace(definition, 'gen_random_bytes(', 'extensions.gen_random_bytes(');
    definition := replace(definition, '__IP_GEN_RANDOM_BYTES__(', 'extensions.gen_random_bytes(');
    definition := replace(definition, 'extensions.digest(', '__IP_DIGEST__(');
    definition := replace(definition, 'digest(', 'extensions.digest(');
    definition := replace(definition, '__IP_DIGEST__(', 'extensions.digest(');
    execute definition;
  end loop;

  perform extensions.gen_random_bytes(16);
end $$;

-- The order command migration must never resolve crypto functions through a
-- caller-controlled search_path.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ~* '(^|[^.[:alnum:]_])gen_random_bytes\('
  ) then
    raise exception 'An order function still uses unqualified gen_random_bytes.';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
