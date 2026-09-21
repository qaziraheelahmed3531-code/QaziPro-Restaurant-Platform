begin;

-- Step 9 forward fix: legacy staff invitations still require a primary branch_id.
-- Keep branch_ids as the complete multi-branch assignment for an OWNER.
create or replace function public.platform_provision_restaurant(p_request_key uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  actor uuid:=auth.uid(); existing uuid; business uuid; package uuid; branch jsonb; capability text;
  requested_slug text:=lower(btrim(p_payload->>'slug'));
  requested_name text:=btrim(p_payload->>'name');
  owner_name text:=btrim(p_payload->>'ownerName');
  owner_email text:=lower(btrim(p_payload->>'ownerEmail'));
begin
  if not public.has_platform_permission('restaurants.create') or not public.has_platform_permission('onboarding.manage') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  if p_request_key is null then raise exception 'REQUEST_KEY_REQUIRED' using errcode='22023'; end if;
  select business_id into existing from public.restaurant_onboarding where request_key=p_request_key;
  if existing is not null then return existing; end if;
  if requested_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(requested_name) not between 2 and 120 or char_length(owner_name) not between 2 and 120 or owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_ONBOARDING_PAYLOAD' using errcode='22023'; end if;
  select id into package from public.service_packages where id::text=p_payload->>'packageId' and is_active;
  if package is null then raise exception 'ACTIVE_PACKAGE_REQUIRED' using errcode='22023'; end if;
  if nullif(p_payload->>'customerDomain','') is not null and lower(p_payload->>'customerDomain') !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'INVALID_CUSTOMER_DOMAIN' using errcode='22023'; end if;
  if nullif(p_payload->>'adminDomain','') is not null and lower(p_payload->>'adminDomain') !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' then raise exception 'INVALID_ADMIN_DOMAIN' using errcode='22023'; end if;
  if nullif(p_payload->>'androidId','') is not null and p_payload->>'androidId' !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*){1,}$' then raise exception 'INVALID_ANDROID_ID' using errcode='22023'; end if;
  if nullif(p_payload->>'iosId','') is not null and p_payload->>'iosId' !~ '^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*){1,}$' then raise exception 'INVALID_IOS_ID' using errcode='22023'; end if;
  insert into public.businesses(slug,name,short_description,phone,email,address,city,currency,timezone,is_active)
  values(requested_slug,requested_name,coalesce(p_payload->>'description',''),nullif(p_payload->>'phone',''),owner_email,nullif(p_payload->>'address',''),coalesce(nullif(p_payload->>'city',''),'Unconfigured'),coalesce(nullif(p_payload->>'currency',''),'PKR'),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),false)
  returning id into business;
  insert into public.business_branding(business_id,display_name,logo_url,primary_color,secondary_color)
  values(business,requested_name,nullif(p_payload->>'logoUrl',''),coalesce(nullif(p_payload->>'primaryColor',''),'#a92114'),coalesce(nullif(p_payload->>'secondaryColor',''),'#e7a81a'));
  insert into public.site_settings(business_id,announcement_enabled,announcement_text) values(business,false,'');
  for branch in select value from jsonb_array_elements(coalesce(p_payload->'branches','[]'::jsonb)) loop
    insert into public.branches(business_id,code,name,restaurant_name,address,formatted_address,city,country_code,timezone,pickup_enabled,delivery_enabled,online_ordering_enabled,is_active,slug)
    values(business,upper(left(btrim(branch->>'code'),24)),btrim(branch->>'name'),requested_name,nullif(branch->>'address',''),nullif(branch->>'address',''),coalesce(nullif(branch->>'city',''),coalesce(nullif(p_payload->>'city',''),'Unconfigured')),coalesce(nullif(branch->>'countryCode',''),'PK'),coalesce(nullif(branch->>'timezone',''),'Asia/Karachi'),coalesce((branch->>'pickupEnabled')::boolean,true),coalesce((branch->>'deliveryEnabled')::boolean,true),false,true,lower(regexp_replace(btrim(branch->>'name'),'[^a-zA-Z0-9]+','-','g')));
  end loop;
  if not exists(select 1 from public.branches where business_id=business) then raise exception 'AT_LEAST_ONE_BRANCH_REQUIRED' using errcode='22023'; end if;
  insert into public.restaurant_onboarding(request_key,business_id,lifecycle,legal_name,owner_name,owner_email,owner_phone,primary_contact_name,primary_contact_title,expected_locations,country_code,commercial_notes,created_by)
  values(p_request_key,business,'CONFIGURATION',nullif(p_payload->>'legalName',''),owner_name,owner_email,nullif(p_payload->>'ownerPhone',''),nullif(p_payload->>'contactName',''),nullif(p_payload->>'contactTitle',''),jsonb_array_length(p_payload->'branches'),coalesce(nullif(p_payload->>'countryCode',''),'PK'),coalesce(p_payload->>'commercialNotes',''),actor);
  insert into public.staff_invitations(business_id,branch_id,email,role,is_active,permissions,invited_by,branch_ids,delivery_status)
  select business,(array_agg(id order by sort_order,id))[1],owner_email,'OWNER',true,'{}',actor,array_agg(id order by sort_order,id),'NOT_SENT' from public.branches where business_id=business
  on conflict(business_id,email) do update set branch_id=excluded.branch_id,role='OWNER',is_active=true,status='PENDING',branch_ids=excluded.branch_ids,updated_at=now();
  insert into public.restaurant_subscriptions(business_id,package_id,status,currency,base_fee,setup_fee,billing_frequency)
  select business,package,'TRIAL',coalesce(nullif(p_payload->>'currency',''),'PKR'),coalesce((p_payload->>'baseFee')::integer,service_packages.base_fee),coalesce((p_payload->>'setupFee')::integer,service_packages.setup_fee),coalesce(nullif(p_payload->>'billingFrequency',''),service_packages.billing_frequency) from public.service_packages where id=package;
  insert into public.service_entitlements(business_id,capability_key,enabled,source,limit_value)
  select business,capability_key,enabled,'PACKAGE',limit_value from public.package_entitlements where package_id=package
  on conflict(business_id,capability_key,source) do update set enabled=excluded.enabled,limit_value=excluded.limit_value,updated_at=now();
  for capability in select jsonb_array_elements_text(coalesce(p_payload->'services','[]'::jsonb)) loop
    insert into public.service_entitlements(business_id,capability_key,enabled,source) values(business,capability,true,'OVERRIDE') on conflict(business_id,capability_key,source) do update set enabled=true,updated_at=now();
  end loop;
  insert into public.mobile_app_records(business_id,platform,enabled,app_name,application_identifier,restaurant_public_key,release_status)
  values
    (business,'ANDROID',coalesce((p_payload->>'androidEnabled')::boolean,false),nullif(p_payload->>'androidName',''),nullif(p_payload->>'androidId',''),requested_slug,case when coalesce((p_payload->>'androidEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end),
    (business,'IOS',coalesce((p_payload->>'iosEnabled')::boolean,false),nullif(p_payload->>'iosName',''),nullif(p_payload->>'iosId',''),requested_slug,case when coalesce((p_payload->>'iosEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end);
  if nullif(p_payload->>'customerDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'customerDomain'),'CUSTOMER'); end if;
  if nullif(p_payload->>'adminDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'adminDomain'),'ADMIN'); end if;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(actor,'RESTAURANT_PROVISIONED','business',business::text,business,coalesce(nullif(p_payload->>'reason',''),'New restaurant onboarding'),jsonb_build_object('slug',requested_slug,'services',coalesce(p_payload->'services','[]'::jsonb),'branchCount',jsonb_array_length(p_payload->'branches')));
  return business;
end;
$$;

commit;
