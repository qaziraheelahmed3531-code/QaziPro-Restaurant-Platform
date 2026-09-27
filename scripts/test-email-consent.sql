-- Verified staging only. No SMTP calls; all campaign/outbox/consent changes roll back.
begin;
do $$
declare b uuid; actor uuid; campaign jsonb; second jsonb; request_key uuid:=gen_random_uuid(); claimed integer;
begin
  select m.business_id,m.user_id into b,actor from public.staff_memberships m join auth.users u on u.id=m.user_id
  where m.role='OWNER' and m.is_active and lower(btrim(u.email)) !~ '@([^@]+[.])?(invalid|test)$|@qa[.]example$'
    and exists(select 1 from public.runtime_entitlement_internal(m.business_id,null,'admin.restaurant') where enabled)
    and exists(select 1 from public.runtime_entitlement_internal(m.business_id,null,'website.ordering') where enabled) limit 1;
  if actor is null then raise exception 'No eligible staging owner'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  update public.storefront_customer_memberships set email_marketing_opt_in=false where business_id=b;
  perform public.set_customer_email_consent(b,false);
  campaign:=public.create_customer_broadcast(b,null,'Consent test','Rollback only: never sent',gen_random_uuid());
  if (campaign->>'recipientCount')::integer<>0 then raise exception 'Sign-in alone counted as consent'; end if;
  perform public.set_customer_email_consent(b,true);
  campaign:=public.create_customer_broadcast(b,null,'Consent test','Rollback only: never sent',request_key);
  second:=public.create_customer_broadcast(b,null,'Consent test','Rollback only: never sent',request_key);
  if (campaign->>'recipientCount')::integer<>1 or campaign->>'id'<>second->>'id' then raise exception 'Consent or idempotency failure'; end if;
  perform public.set_customer_email_consent(b,false);
  select count(*) into claimed from public.claim_customer_broadcast_batch((campaign->>'id')::uuid,20);
  if claimed<>0 or not exists(select 1 from public.customer_broadcast_deliveries where broadcast_id=(campaign->>'id')::uuid and status='SKIPPED') then
    raise exception 'Queued email ignored unsubscribe'; end if;
  perform public.set_customer_email_consent(b,true);
  campaign:=public.create_customer_broadcast(b,null,'Consent test','Rollback only: never sent',gen_random_uuid());
  select count(*) into claimed from public.claim_customer_broadcast_batch((campaign->>'id')::uuid,20);
  if claimed<>1 then raise exception 'Consenting recipient cannot be claimed'; end if;
  select count(*) into claimed from public.claim_customer_broadcast_batch((campaign->>'id')::uuid,20);
  if claimed<>0 then raise exception 'Double send claim accepted'; end if;
  update public.customer_broadcast_deliveries set status='FAILED',last_error='SMTP result uncertain' where broadcast_id=(campaign->>'id')::uuid;
  select count(*) into claimed from public.claim_customer_broadcast_batch((campaign->>'id')::uuid,20);
  if claimed<>0 then raise exception 'Uncertain provider result automatically retried'; end if;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin
    perform public.set_customer_email_consent(b,true);
    raise exception 'Anonymous consent accepted';
  exception when sqlstate '42501' then null; end;
end; $$;
rollback;
select 'PASS: explicit opt-in, no implied consent, idempotent email draft, unsubscribe rechecked at claim, duplicate claim denied, uncertain SMTP retry denied, anonymous consent denied. No email sent; fixtures rolled back.' as result;
