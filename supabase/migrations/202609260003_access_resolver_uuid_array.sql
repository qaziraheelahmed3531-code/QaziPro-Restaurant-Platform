begin;

do $$
declare definition text; corrected text;
begin
  select pg_get_functiondef('public.resolve_restaurant_admin_access(uuid)'::regprocedure) into definition;
  corrected:=replace(definition,'v_branch_ids uuid[]:=''{}'';','v_branch_ids uuid[]:=array[]::uuid[];');
  if corrected=definition then
    raise exception 'Expected resolver declaration was not found.';
  end if;
  execute corrected;
end;
$$;

commit;
