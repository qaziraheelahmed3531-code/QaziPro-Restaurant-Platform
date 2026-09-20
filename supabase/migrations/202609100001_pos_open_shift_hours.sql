-- A cashier who has explicitly opened a register shift may continue using the
-- counter POS outside public online-ordering hours. Website ordering remains
-- governed by the configured branch hours.
begin;

do $migration$
declare
  definition text;
  expected text := 'if found and (';
  replacement text := 'if coalesce(p_payload->>''channel'',''WEBSITE'') <> ''POS'' and found and (';
begin
  select pg_get_functiondef('public.create_order_authoritative(jsonb,uuid)'::regprocedure)
    into definition;

  if position(replacement in definition) > 0 then
    return;
  end if;
  if position(expected in definition) = 0 then
    raise exception 'Order function changed: review the POS hours patch before applying.';
  end if;

  definition := replace(definition, expected, replacement);
  execute definition;
end;
$migration$;

commit;
