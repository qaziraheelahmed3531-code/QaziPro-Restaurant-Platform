begin;
create function public.platform_set_entitlement(p_business_id uuid,p_capability text,p_enabled boolean,p_expected_updated_at timestamptz,p_request_id uuid)
returns timestamptz language plpgsql security definer set search_path=public,auth as $$
declare previous public.service_entitlements; saved public.service_entitlements;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_capability not in ('admin.restaurant','pos.web','pos.desktop','inventory','kitchen','waiter','rider','website.ordering','ordering.delivery','ordering.pickup','loyalty','reports.advanced','mobile.android','mobile.ios') or p_enabled is null or p_request_id is null then
    raise exception 'Invalid entitlement' using errcode='22023';
  end if;
  perform 1 from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Restaurant unavailable' using errcode='22023'; end if;
  select * into previous from public.service_entitlements where business_id=p_business_id and capability_key=p_capability and source='OVERRIDE';
  if exists(select 1 from public.platform_audit_logs where request_id=p_request_id::text and actor_user_id=auth.uid() and action='ENTITLEMENT_OVERRIDE_SAVED' and business_id=p_business_id) then return previous.updated_at; end if;
  if previous.updated_at is distinct from p_expected_updated_at then raise exception 'Entitlement changed; reload' using errcode='40001'; end if;
  insert into public.service_entitlements(business_id,capability_key,source,enabled,effective_until,notes,updated_at)
    values(p_business_id,p_capability,'OVERRIDE',p_enabled,null,'Restaurant 360 service override',clock_timestamp())
    on conflict(business_id,capability_key,source) do update set enabled=excluded.enabled,effective_until=null,notes=excluded.notes,updated_at=excluded.updated_at
    returning * into saved;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,request_id,before_data,after_data)
    values(auth.uid(),'ENTITLEMENT_OVERRIDE_SAVED','service_entitlements',saved.id,p_business_id,'Restaurant 360 service override',p_request_id::text,to_jsonb(previous),to_jsonb(saved));
  return saved.updated_at;
end $$;
revoke all on function public.platform_set_entitlement(uuid,text,boolean,timestamptz,uuid) from public,anon;
grant execute on function public.platform_set_entitlement(uuid,text,boolean,timestamptz,uuid) to authenticated;
commit;
