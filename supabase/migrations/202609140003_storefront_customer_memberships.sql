begin;

create table if not exists public.storefront_customer_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table public.storefront_customer_memberships enable row level security;
drop policy if exists storefront_customer_own_read on public.storefront_customer_memberships;
create policy storefront_customer_own_read on public.storefront_customer_memberships
  for select to authenticated using (user_id = auth.uid() or public.has_permission(business_id, 'content.manage'));

create or replace function public.register_storefront_customer(p_business_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.businesses where id=p_business_id and is_active) then
    raise exception 'A valid customer session and restaurant are required.' using errcode='42501';
  end if;
  insert into public.storefront_customer_memberships(business_id,user_id)
  values(p_business_id,auth.uid())
  on conflict (business_id,user_id) do update set last_seen_at=now();
end; $$;

revoke all on function public.register_storefront_customer(uuid) from public,anon;
grant execute on function public.register_storefront_customer(uuid) to authenticated;
grant select on public.storefront_customer_memberships to authenticated;

create or replace function public.create_customer_broadcast(
  p_business_id uuid,
  p_deal_id uuid,
  p_subject text,
  p_message text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare campaign_id uuid; recipients integer;
begin
  if not public.has_permission(p_business_id, 'content.manage') then
    raise exception 'Customer messaging access denied.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 3 and 140 then
    raise exception 'Subject must contain 3 to 140 characters.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_message, ''))) not between 3 and 2000 then
    raise exception 'Message must contain 3 to 2000 characters.' using errcode = '22023';
  end if;
  if p_deal_id is not null and not exists (
    select 1 from public.deals where id=p_deal_id and business_id=p_business_id and is_active
  ) then raise exception 'Selected deal is not available for this restaurant.' using errcode='22023'; end if;

  insert into public.customer_broadcasts(business_id,deal_id,subject,message,created_by)
  values(p_business_id,p_deal_id,btrim(p_subject),btrim(p_message),auth.uid()) returning id into campaign_id;

  insert into public.customer_broadcast_deliveries(broadcast_id,business_id,recipient)
  select campaign_id,p_business_id,lower(btrim(u.email))
  from public.storefront_customer_memberships m join auth.users u on u.id=m.user_id
  where m.business_id=p_business_id and u.email is not null
    and lower(btrim(u.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    and lower(btrim(u.email)) !~ '@example[.](test|invalid)$'
  on conflict (broadcast_id,recipient) do nothing;

  get diagnostics recipients = row_count;
  update public.customer_broadcasts set recipient_count=recipients,
    status=case when recipients=0 then 'SENT' else 'PENDING' end,
    completed_at=case when recipients=0 then now() else null end,updated_at=now()
  where id=campaign_id;
  insert into public.audit_logs(business_id,actor_id,action,entity_type,entity_id,metadata)
  values(p_business_id,auth.uid(),'CUSTOMER_BROADCAST_CREATED','customer_broadcast',campaign_id::text,jsonb_build_object('recipientCount',recipients,'dealId',p_deal_id));
  return jsonb_build_object('id',campaign_id,'recipientCount',recipients);
end; $$;

revoke all on function public.create_customer_broadcast(uuid,uuid,text,text) from public,anon;
grant execute on function public.create_customer_broadcast(uuid,uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
