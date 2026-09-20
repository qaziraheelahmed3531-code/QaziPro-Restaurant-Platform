-- Reissue creates a distinct invoice; it must not reuse the original save retry key.
-- The existing business lock serializes retries, including concurrent requests.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.transition_invoice(uuid,text,text)'::regprocedure) into definition;
 if position('v_draft:=to_jsonb(inv)||' in definition)=0 then
  raise exception 'Unexpected invoice transition definition; inspect before migrating.';
 end if;
 definition:=replace(definition,'v_draft:=to_jsonb(inv)||','v_draft:=(to_jsonb(inv)-''client_reference'')||');
 definition:=replace(definition,
  'if inv.order_id is not null then v_id:=',
  'select id into v_id from public.invoices where reissued_from=p_id and status<>''VOID'' order by created_at desc limit 1;
   if v_id is not null then return v_id; end if;
   if inv.order_id is not null then v_id:=');
 execute definition;
end $$;
