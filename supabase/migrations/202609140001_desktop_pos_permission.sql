begin;

insert into public.admin_permissions(code, description, permission_group)
values ('desktop_pos.use', 'Use QaziPRO POS Desktop online and offline', 'Operations')
on conflict (code) do update
set description = excluded.description,
    permission_group = excluded.permission_group;

insert into public.admin_role_permissions(role, permission_code)
values ('CASHIER', 'desktop_pos.use')
on conflict do nothing;

do $$
declare
  routine regprocedure;
  source text;
begin
  foreach routine in array array[
    'public.register_desktop_pos_catalog(uuid,uuid,text,text)'::regprocedure,
    'public.sync_offline_pos_order(jsonb)'::regprocedure
  ] loop
    source := pg_get_functiondef(routine);
    if position('desktop_pos.use' in source) = 0 then
      source := regexp_replace(
        source,
        'not public\.has_permission\(([^,]+),\s*''pos\.use''\)',
        'not public.has_permission(\1, ''pos.use'') or not public.has_permission(\1, ''desktop_pos.use'')',
        'g'
      );
      execute source;
    end if;
  end loop;
end;
$$;

commit;
