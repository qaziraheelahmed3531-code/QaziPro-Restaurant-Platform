begin;
-- Browser delivery uses the existing device registry and notification outbox.
alter table public.customer_device_tokens drop constraint customer_device_tokens_platform_check;
alter table public.customer_device_tokens add constraint customer_device_tokens_platform_check check(platform in ('android','ios','web'));
alter table public.customer_device_tokens add column web_subscription jsonb;
alter table public.customer_device_tokens add column storefront_origin text;
alter table public.customer_device_tokens add column branch_id uuid references public.branches(id) on delete cascade;
alter table public.customer_device_tokens add column marketing_opt_in boolean not null default false;
alter table public.customer_device_tokens add constraint browser_device_context check(
  platform<>'web' or (web_subscription is not null and storefront_origin is not null and storefront_origin ~ '^https://[^/]+$' and branch_id is not null)
);

-- Web rows are only registered through the hostname-validating server endpoint.
drop policy customer_device_tokens_own_all on public.customer_device_tokens;
create policy customer_device_tokens_own_read on public.customer_device_tokens for select to authenticated using(customer_id=auth.uid());
create policy customer_device_tokens_mobile_insert on public.customer_device_tokens for insert to authenticated with check(customer_id=auth.uid() and platform in ('android','ios'));
create policy customer_device_tokens_mobile_update on public.customer_device_tokens for update to authenticated using(customer_id=auth.uid() and platform in ('android','ios')) with check(customer_id=auth.uid() and platform in ('android','ios'));
create policy customer_device_tokens_own_delete on public.customer_device_tokens for delete to authenticated using(customer_id=auth.uid());

create or replace function public.register_browser_device(p_business_id uuid,p_branch_id uuid,p_customer_id uuid,p_device_id text,p_subscription jsonb,p_origin text,p_marketing boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare endpoint_value text:=p_subscription->>'endpoint'; device uuid;
begin
  if coalesce(p_origin,'') !~ '^https://[a-z0-9.-]+$'
    or not exists(select 1 from public.resolve_storefront_business(replace(p_origin,'https://','')) where resolved_business_id=p_business_id)
    or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active)
    or p_customer_id is null or char_length(coalesce(p_device_id,'')) not between 8 and 200
    or coalesce(endpoint_value,'') !~ '^https://(fcm[.]googleapis[.]com|web[.]push[.]apple[.]com|[a-z0-9.-]+[.]push[.]services[.]mozilla[.]com|[a-z0-9.-]+[.]notify[.]windows[.]com)/'
    or coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}$'
    or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Invalid browser subscription.' using errcode='22023';
  end if;
  delete from public.customer_device_tokens where business_id=p_business_id and push_token=endpoint_value
    and (customer_id<>p_customer_id or device_id<>p_device_id);
  insert into public.customer_device_tokens(business_id,branch_id,customer_id,device_id,platform,push_token,web_subscription,storefront_origin,marketing_opt_in)
  values(p_business_id,p_branch_id,p_customer_id,p_device_id,'web',endpoint_value,p_subscription,p_origin,coalesce(p_marketing,false))
  on conflict(business_id,customer_id,device_id) do update set platform='web',push_token=excluded.push_token,
    web_subscription=excluded.web_subscription,storefront_origin=excluded.storefront_origin,branch_id=excluded.branch_id,marketing_opt_in=excluded.marketing_opt_in,is_enabled=true,last_seen_at=now()
  returning id into device;
  return device;
end; $$;
revoke all on function public.register_browser_device(uuid,uuid,uuid,text,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.register_browser_device(uuid,uuid,uuid,text,jsonb,text,boolean) to service_role;

-- Reuse the outbox delivery checkpoint, not a second notification ledger.
alter table public.customer_notification_outbox add column delivered_device_ids uuid[] not null default '{}';
alter table public.customer_broadcasts add column channel text not null default 'EMAIL' check(channel in ('EMAIL','WEB_PUSH'));
alter table public.customer_broadcasts add column branch_id uuid references public.branches(id);
alter table public.customer_broadcasts add column destination text;
alter table public.customer_notification_outbox add column broadcast_id uuid references public.customer_broadcasts(id);
create index customer_notification_broadcast_idx on public.customer_notification_outbox(business_id,broadcast_id) where broadcast_id is not null;

-- Browser campaigns can only be created by the branch-authorized, idempotent
-- RPC. Keep existing email mutations intact; do not permit direct push writes.
drop policy customer_broadcast_staff_access on public.customer_broadcasts;
create policy customer_broadcast_staff_read on public.customer_broadcasts for select to authenticated
using(public.has_permission(business_id,'content.manage') and (channel='EMAIL' or public.staff_can_access_branch(business_id,branch_id)));
create policy customer_broadcast_email_insert on public.customer_broadcasts for insert to authenticated
with check(channel='EMAIL' and public.has_permission(business_id,'content.manage'));
create policy customer_broadcast_email_update on public.customer_broadcasts for update to authenticated
using(channel='EMAIL' and public.has_permission(business_id,'content.manage'))
with check(channel='EMAIL' and public.has_permission(business_id,'content.manage'));
create policy customer_broadcast_email_delete on public.customer_broadcasts for delete to authenticated
using(channel='EMAIL' and public.has_permission(business_id,'content.manage'));

create or replace function public.create_customer_push_broadcast(p_business_id uuid,p_branch_id uuid,p_title text,p_message text,p_path text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare campaign public.customer_broadcasts; recipients integer;
begin
  if not public.has_permission(p_business_id,'content.manage') or not public.staff_can_access_branch(p_business_id,p_branch_id)
    or not exists(select 1 from public.branches where id=p_branch_id and business_id=p_business_id and is_active) then
    raise exception 'Messaging access denied.' using errcode='42501';
  end if;
  if p_request_id is null or char_length(btrim(coalesce(p_title,''))) not between 3 and 140
    or char_length(btrim(coalesce(p_message,''))) not between 3 and 500
    or coalesce(p_path,'') !~ '^/(orders(/[A-Za-z0-9-]+)?|pages/[a-z0-9-]+)?(#[A-Za-z0-9_-]+)?$' then
    raise exception 'Invalid notification draft.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||auth.uid()::text||p_request_id::text,0));
  select * into campaign from public.customer_broadcasts where business_id=p_business_id and created_by=auth.uid() and request_id=p_request_id;
  if found then
    if campaign.channel<>'WEB_PUSH' or campaign.subject<>btrim(p_title) or campaign.message<>btrim(p_message) or campaign.destination is distinct from p_path or campaign.branch_id is distinct from p_branch_id then
      raise exception 'Request key already used for another draft.' using errcode='22023';
    end if;
    return jsonb_build_object('id',campaign.id,'recipientCount',campaign.recipient_count,'replayed',true);
  end if;
  insert into public.customer_broadcasts(business_id,branch_id,subject,message,created_by,request_id,channel,destination)
  values(p_business_id,p_branch_id,btrim(p_title),btrim(p_message),auth.uid(),p_request_id,'WEB_PUSH',p_path) returning * into campaign;
  insert into public.customer_notification_outbox(business_id,branch_id,customer_id,event_type,title,message,payload,dedupe_key,broadcast_id)
  select p_business_id,p_branch_id,d.customer_id,'SYSTEM',btrim(p_title),btrim(p_message),jsonb_build_object('path',p_path,'marketing',true),
    'broadcast-'||campaign.id||'-'||d.customer_id,campaign.id
  from public.customer_device_tokens d where d.business_id=p_business_id and d.platform='web' and d.is_enabled and d.marketing_opt_in
    and d.branch_id=p_branch_id
  group by d.customer_id;
  get diagnostics recipients=row_count;
  update public.customer_broadcasts set recipient_count=recipients,status=case when recipients=0 then 'SENT' else 'PENDING' end where id=campaign.id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'CUSTOMER_PUSH_CREATED','customer_broadcast',campaign.id::text,jsonb_build_object('branch_id',p_branch_id,'recipient_count',recipients));
  return jsonb_build_object('id',campaign.id,'recipientCount',recipients,'replayed',false);
end; $$;
revoke all on function public.create_customer_push_broadcast(uuid,uuid,text,text,text,uuid) from public,anon;
grant execute on function public.create_customer_push_broadcast(uuid,uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
