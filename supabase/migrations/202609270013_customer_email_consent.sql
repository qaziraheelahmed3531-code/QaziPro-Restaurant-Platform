begin;
-- Consent belongs to the canonical restaurant/customer relationship.
-- Signing in is not consent. Existing memberships deliberately remain opted out.
alter table public.storefront_customer_memberships add column email_marketing_opt_in boolean not null default false;
alter table public.storefront_customer_memberships add column email_consent_updated_at timestamptz;

create or replace function public.set_customer_email_consent(p_business_id uuid,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or p_enabled is null or not exists(select 1 from public.businesses where id=p_business_id) then
    raise exception 'A valid customer session is required.' using errcode='42501';
  end if;
  if p_enabled and not exists(select 1 from public.runtime_entitlement_internal(p_business_id,null,'website.ordering') where enabled) then
    raise exception 'Restaurant unavailable.' using errcode='42501';
  end if;
  insert into public.storefront_customer_memberships(business_id,user_id,email_marketing_opt_in,email_consent_updated_at)
  values(p_business_id,auth.uid(),p_enabled,now())
  on conflict(business_id,user_id) do update set email_marketing_opt_in=excluded.email_marketing_opt_in,email_consent_updated_at=now();
  return p_enabled;
end; $$;
revoke all on function public.set_customer_email_consent(uuid,boolean) from public,anon;
grant execute on function public.set_customer_email_consent(uuid,boolean) to authenticated;

create or replace function public.create_customer_broadcast(p_business_id uuid,p_deal_id uuid,p_subject text,p_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare campaign_id uuid; recipients integer;
begin
  if not public.has_permission(p_business_id,'content.manage') then raise exception 'Customer messaging access denied.' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_subject,''))) not between 3 and 140 or char_length(btrim(coalesce(p_message,''))) not between 3 and 2000 then
    raise exception 'Check the subject and message length.' using errcode='22023'; end if;
  if p_deal_id is not null and not exists(select 1 from public.deals where id=p_deal_id and business_id=p_business_id and is_active) then
    raise exception 'Selected deal is not available.' using errcode='22023'; end if;
  insert into public.customer_broadcasts(business_id,deal_id,subject,message,created_by,channel)
  values(p_business_id,p_deal_id,btrim(p_subject),btrim(p_message),auth.uid(),'EMAIL') returning id into campaign_id;
  insert into public.customer_broadcast_deliveries(broadcast_id,business_id,recipient)
  select campaign_id,p_business_id,lower(btrim(u.email)) from public.storefront_customer_memberships m join auth.users u on u.id=m.user_id
  where m.business_id=p_business_id and m.email_marketing_opt_in and u.email is not null
    and lower(btrim(u.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and lower(btrim(u.email)) !~ '@([^@]+[.])?(invalid|test)$|@qa[.]example$'
  on conflict(broadcast_id,recipient) do nothing;
  get diagnostics recipients=row_count;
  update public.customer_broadcasts set recipient_count=recipients,status=case when recipients=0 then 'SENT' else 'PENDING' end,
    completed_at=case when recipients=0 then now() else null end where id=campaign_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'CUSTOMER_BROADCAST_CREATED','customer_broadcast',campaign_id::text,jsonb_build_object('recipientCount',recipients,'consentRequired',true));
  return jsonb_build_object('id',campaign_id,'recipientCount',recipients);
end; $$;

create or replace function public.claim_customer_broadcast_batch(p_broadcast_id uuid,p_limit integer default 20)
returns table(delivery_id bigint,recipient text) language plpgsql security definer set search_path=public as $$
declare target_business uuid;
begin
  select business_id into target_business from public.customer_broadcasts where id=p_broadcast_id and channel='EMAIL';
  if target_business is null or not public.has_permission(target_business,'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode='42501'; end if;
  -- Consent can change while a campaign waits. Do not reclaim SENDING rows:
  -- SMTP acceptance after a timeout is uncertain and requires reconciliation.
  update public.customer_broadcast_deliveries d set status='SKIPPED',last_error='Customer is not opted into restaurant emails.',updated_at=now()
  where d.broadcast_id=p_broadcast_id and d.business_id=target_business and d.status in ('PENDING','FAILED')
    and not exists(select 1 from public.storefront_customer_memberships m join auth.users u on u.id=m.user_id
      where m.business_id=target_business and m.email_marketing_opt_in and lower(btrim(u.email))=d.recipient);
  update public.customer_broadcasts set status='SENDING',updated_at=now() where id=p_broadcast_id and status in ('PENDING','SENDING','PARTIAL','FAILED');
  return query with claimed as (
    select d.id from public.customer_broadcast_deliveries d where d.broadcast_id=p_broadcast_id and d.business_id=target_business
      and (d.status='PENDING' or (d.status='FAILED' and d.last_error='Email provider is not configured.')) and d.attempts<3
    order by d.id for update skip locked limit least(50,greatest(1,coalesce(p_limit,20)))
  ) update public.customer_broadcast_deliveries d set status='SENDING',attempts=d.attempts+1,last_error=null,updated_at=now()
  from claimed where d.id=claimed.id returning d.id,d.recipient;
end; $$;
notify pgrst,'reload schema';
commit;
