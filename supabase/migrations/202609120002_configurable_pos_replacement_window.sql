begin;

alter table public.business_operating_settings
  add column if not exists pos_replacement_window_minutes integer not null default 10
  check (pos_replacement_window_minutes between 1 and 1440);

create or replace function public.pos_replacement_window_minutes(target_business uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select settings.pos_replacement_window_minutes
       from public.business_operating_settings settings
      where settings.business_id = target_business),
    10
  );
$$;

grant execute on function public.pos_replacement_window_minutes(uuid) to authenticated;

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.replace_pos_order(uuid,jsonb)'::regprocedure)
    into definition;

  if position('now() - interval ''10 minutes''' in definition) = 0 then
    raise exception 'replace_pos_order no longer contains the expected fixed replacement window';
  end if;

  definition := replace(
    definition,
    'now() - interval ''10 minutes''',
    'now() - make_interval(mins => public.pos_replacement_window_minutes(target_order.business_id))'
  );
  definition := replace(
    definition,
    '''The 10-minute replacement window has expired.''',
    '''The configured POS replacement window has expired.'''
  );
  definition := replace(
    definition,
    '''POS order replaced within the approved 10-minute correction window.''',
    '''POS order replaced within the configured correction window.'''
  );

  execute definition;
end;
$migration$;

commit;
