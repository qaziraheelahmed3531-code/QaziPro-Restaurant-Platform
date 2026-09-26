begin;
-- Require a concrete compare-and-swap token even for direct authenticated RPCs.
create or replace function public.platform_save_branding(p_logo_path text,p_icon_path text,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public,auth as $$
declare previous public.platform_branding; next_version integer;
begin
  if not public.has_platform_permission('team.manage') or not exists (
    select 1 from public.platform_staff_roles a join public.platform_roles r on r.id=a.role_id
    where a.staff_user_id=auth.uid() and r.key='PLATFORM_OWNER'
  ) then raise exception 'Platform owner required' using errcode='42501'; end if;
  select * into previous from public.platform_branding where singleton for update;
  if not found or previous.version is distinct from p_expected_version then raise exception 'Branding changed; reload before saving' using errcode='40001'; end if;
  if (p_logo_path is not null and not exists(select 1 from storage.objects where bucket_id='platform-branding' and name=p_logo_path))
    or (p_icon_path is not null and not exists(select 1 from storage.objects where bucket_id='platform-branding' and name=p_icon_path))
    then raise exception 'Asset not found' using errcode='22023'; end if;
  if previous.logo_path is not distinct from p_logo_path and previous.icon_path is not distinct from p_icon_path then return previous.version; end if;
  update public.platform_branding set logo_path=p_logo_path,icon_path=p_icon_path,version=previous.version+1,updated_at=now() where singleton returning version into next_version;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,reason,before_data,after_data)
    values(auth.uid(),'PLATFORM_BRANDING_UPDATED','platform_branding','platform','Platform owner updated QaziPro identity',to_jsonb(previous),jsonb_build_object('logo_path',p_logo_path,'icon_path',p_icon_path,'version',next_version));
  return next_version;
end $$;

create or replace function public.platform_set_entitlement(p_business_id uuid,p_capability text,p_enabled boolean,p_expected_updated_at timestamptz,p_request_id uuid)
returns timestamptz language plpgsql security definer set search_path=public,auth as $$
declare previous public.service_entitlements; saved public.service_entitlements; replay jsonb;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_capability is null or p_capability not in ('admin.restaurant','pos.web','pos.desktop','inventory','kitchen','waiter','rider','website.ordering','ordering.delivery','ordering.pickup','loyalty','reports.advanced','mobile.android','mobile.ios') or p_enabled is null or p_request_id is null then
    raise exception 'Invalid entitlement' using errcode='22023';
  end if;
  perform 1 from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Restaurant unavailable' using errcode='22023'; end if;
  select after_data into replay from public.platform_audit_logs where request_id=p_request_id::text and actor_user_id=auth.uid() and action='ENTITLEMENT_OVERRIDE_SAVED' and business_id=p_business_id limit 1;
  if found then
    if replay->>'capability_key' is distinct from p_capability or (replay->>'enabled')::boolean is distinct from p_enabled then
      raise exception 'Request already used for another change' using errcode='40001';
    end if;
    return (replay->>'updated_at')::timestamptz;
  end if;
  select * into previous from public.service_entitlements where business_id=p_business_id and capability_key=p_capability and source='OVERRIDE';
  if previous.updated_at is distinct from p_expected_updated_at then raise exception 'Entitlement changed; reload' using errcode='40001'; end if;
  insert into public.service_entitlements(business_id,capability_key,source,enabled,effective_from,effective_until,notes,updated_at)
    values(p_business_id,p_capability,'OVERRIDE',p_enabled,now(),null,'Restaurant 360 service override',clock_timestamp())
    on conflict(business_id,capability_key,source) do update set enabled=excluded.enabled,effective_from=excluded.effective_from,effective_until=null,notes=excluded.notes,updated_at=excluded.updated_at
    returning * into saved;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,request_id,before_data,after_data)
    values(auth.uid(),'ENTITLEMENT_OVERRIDE_SAVED','service_entitlements',saved.id,p_business_id,'Restaurant 360 service override',p_request_id::text,to_jsonb(previous),to_jsonb(saved));
  return saved.updated_at;
end $$;
commit;
