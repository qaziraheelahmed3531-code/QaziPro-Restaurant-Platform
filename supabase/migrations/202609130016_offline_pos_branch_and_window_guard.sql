begin;

alter function public.register_desktop_pos_catalog(uuid,uuid,text,text)
  rename to register_desktop_pos_catalog_internal;
alter function public.sync_offline_pos_order(jsonb)
  rename to sync_offline_pos_order_internal;

create function public.register_desktop_pos_catalog(
  p_branch_id uuid,
  p_device_id uuid,
  p_device_name text,
  p_app_version text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare target_business uuid;
begin
  select business_id into target_business from public.branches where id=p_branch_id and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,p_branch_id)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'Desktop POS restaurant access denied.' using errcode='42501';
  end if;
  return public.register_desktop_pos_catalog_internal(p_branch_id,p_device_id,p_device_name,p_app_version);
end;
$$;

create function public.sync_offline_pos_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  target_branch uuid;
  target_business uuid;
  existing_sale public.orders;
  sold_at timestamptz;
  replaced_at timestamptz;
  replacement_minutes integer;
begin
  target_branch := (p_payload->>'branchId')::uuid;
  select business_id into target_business from public.branches where id=target_branch and is_active;
  if target_business is null or not public.staff_can_access_branch(target_business,target_branch)
    or not public.has_permission(target_business,'pos.use') then
    raise exception 'Offline POS restaurant access denied.' using errcode='42501';
  end if;

  if jsonb_typeof(p_payload->'replacement')='object' then
    select * into existing_sale from public.orders
    where business_id=target_business
      and offline_device_id=(p_payload->>'deviceId')::uuid
      and offline_order_id=p_payload->>'offlineOrderId';
    sold_at := coalesce(existing_sale.offline_sold_at,(p_payload->>'soldAt')::timestamptz);
    replaced_at := (p_payload->'replacement'->>'createdAt')::timestamptz;
    select coalesce(pos_replacement_window_minutes,10) into replacement_minutes
    from public.business_operating_settings where business_id=target_business;
    replacement_minutes := coalesce(replacement_minutes,10);
    if replaced_at < sold_at or replaced_at > sold_at + make_interval(mins=>replacement_minutes)
      or replaced_at > now()+interval '5 minutes' then
      raise exception 'The configured POS replacement window has expired.' using errcode='22023';
    end if;
  end if;

  return public.sync_offline_pos_order_internal(p_payload);
end;
$$;

revoke all on function public.register_desktop_pos_catalog_internal(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.sync_offline_pos_order_internal(jsonb) from public,anon,authenticated;
revoke all on function public.register_desktop_pos_catalog(uuid,uuid,text,text) from public,anon;
revoke all on function public.sync_offline_pos_order(jsonb) from public,anon;
grant execute on function public.register_desktop_pos_catalog(uuid,uuid,text,text) to authenticated;
grant execute on function public.sync_offline_pos_order(jsonb) to authenticated;

commit;
