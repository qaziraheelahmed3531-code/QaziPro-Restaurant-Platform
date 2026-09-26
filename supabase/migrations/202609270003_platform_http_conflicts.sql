begin;
-- Business version conflicts are HTTP 409, NOT serialization failures.
-- PostgREST may retry SQLSTATE 40001 indefinitely instead of returning it.
do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.platform_save_branding(text,text,integer)'::regprocedure,
    'public.platform_set_entitlement(uuid,text,boolean,timestamptz,uuid)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    execute replace(definition, 'errcode=''40001''', 'errcode=''PT409''');
  end loop;
end $$;
commit;
