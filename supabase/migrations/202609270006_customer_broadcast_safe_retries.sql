begin;

-- Extend the existing campaign/outbox, not a second messaging system.
alter table public.customer_broadcasts add column if not exists request_id uuid;
create unique index if not exists customer_broadcast_request_idx
  on public.customer_broadcasts(business_id, created_by, request_id)
  where request_id is not null;

-- Backwards-compatible overload; current HTTP clients must supply a request key.
-- Recipient selection and audit creation remain in the canonical four-argument RPC.
create or replace function public.create_customer_broadcast(
  p_business_id uuid, p_deal_id uuid, p_subject text, p_message text, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare existing public.customer_broadcasts%rowtype; result jsonb;
begin
  if auth.uid() is null or not public.has_permission(p_business_id, 'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode='42501';
  end if;
  if p_request_id is null then raise exception 'A message request key is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || auth.uid()::text || ':' || p_request_id::text, 0));
  select * into existing from public.customer_broadcasts
  where business_id=p_business_id and created_by=auth.uid() and request_id=p_request_id;
  if found then
    if existing.subject is distinct from btrim(p_subject)
      or existing.message is distinct from btrim(p_message)
      or existing.deal_id is distinct from p_deal_id then
      raise exception 'This message request key already belongs to another draft.' using errcode='22023';
    end if;
    return jsonb_build_object('id', existing.id, 'recipientCount', existing.recipient_count, 'replayed', true);
  end if;
  result:=public.create_customer_broadcast(p_business_id,p_deal_id,p_subject,p_message);
  update public.customer_broadcasts set request_id=p_request_id
    where id=(result->>'id')::uuid and business_id=p_business_id and created_by=auth.uid();
  return result || jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.create_customer_broadcast(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.create_customer_broadcast(uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.claim_customer_broadcast_batch(p_broadcast_id uuid, p_limit integer default 20)
returns table(delivery_id bigint, recipient text)
language plpgsql security definer set search_path=public
as $$
declare target_business uuid;
begin
  select business_id into target_business from public.customer_broadcasts where id=p_broadcast_id;
  if target_business is null or not public.has_permission(target_business,'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode='42501';
  end if;
  -- SMTP cannot guarantee exactly-once delivery. Never reclaim SENDING rows on
  -- timeout: the provider may have accepted them before the worker disconnected.
  -- Provider failures also require reconciliation, rather than automatic resend.
  update public.customer_broadcasts set status='SENDING',updated_at=now()
    where id=p_broadcast_id and status in ('PENDING','SENDING','PARTIAL','FAILED');
  return query
  with claimed as (
    select d.id from public.customer_broadcast_deliveries d
    where d.broadcast_id=p_broadcast_id and d.business_id=target_business
      and (d.status='PENDING' or (d.status='FAILED' and d.last_error='Email provider is not configured.'))
      and d.attempts<3
    order by d.id for update skip locked limit least(50,greatest(1,coalesce(p_limit,20)))
  )
  update public.customer_broadcast_deliveries d
  set status='SENDING',attempts=d.attempts+1,last_error=null,updated_at=now()
  from claimed where d.id=claimed.id returning d.id,d.recipient;
end;
$$;
revoke all on function public.claim_customer_broadcast_batch(uuid,integer) from public,anon;
grant execute on function public.claim_customer_broadcast_batch(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
