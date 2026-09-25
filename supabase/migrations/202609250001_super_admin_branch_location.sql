begin;

-- Keep the canonical provisioning transaction while preserving operator-entered
-- branch location metadata. New branches remain offline for ordering/delivery
-- until their operational rules are explicitly reviewed.
create or replace function public.platform_provision_restaurant(p_request_key uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  actor uuid:=auth.uid(); existing uuid; business uuid; package uuid; branch jsonb; capability text;
  requested_slug text:=lower(btrim(p_payload->>'slug'));
  requested_name text:=btrim(p_payload->>'name');
  owner_name text:=btrim(p_payload->>'ownerName');
  owner_email text:=lower(btrim(p_payload->>'ownerEmail'));
  branch_lat numeric; branch_lng numeric; has_location boolean;
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
  if nullif(p_payload->>'androidId','') is not null and lower(p_payload->>'androidId') !~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$' then raise exception 'INVALID_ANDROID_ID' using errcode='22023'; end if;
  if nullif(p_payload->>'iosId','') is not null and lower(p_payload->>'iosId') !~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$' then raise exception 'INVALID_IOS_ID' using errcode='22023'; end if;
  insert into public.businesses(slug,name,short_description,phone,email,address,city,currency,timezone,is_active)
  values(requested_slug,requested_name,coalesce(p_payload->>'description',''),nullif(p_payload->>'ownerPhone',''),owner_email,nullif(p_payload->>'address',''),coalesce(nullif(p_payload->>'city',''),'Unconfigured'),coalesce(nullif(p_payload->>'currency',''),'PKR'),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),false)
  returning id into business;
  insert into public.business_branding(business_id,display_name,logo_url,primary_color,secondary_color)
  values(business,requested_name,nullif(p_payload->>'logoUrl',''),coalesce(nullif(p_payload->>'primaryColor',''),'#a92114'),coalesce(nullif(p_payload->>'secondaryColor',''),'#e7a81a'));
  insert into public.site_settings(business_id,announcement_enabled,announcement_text) values(business,false,'');
  for branch in select value from jsonb_array_elements(coalesce(p_payload->'branches','[]'::jsonb)) loop
    branch_lat:=nullif(branch->>'latitude','')::numeric;
    branch_lng:=nullif(branch->>'longitude','')::numeric;
    has_location:=branch_lat is not null and branch_lng is not null;
    if (branch_lat is null) <> (branch_lng is null) or (has_location and (branch_lat not between -90 and 90 or branch_lng not between -180 and 180 or (branch_lat=0 and branch_lng=0))) then raise exception 'INVALID_BRANCH_LOCATION' using errcode='22023'; end if;
    if char_length(btrim(coalesce(branch->>'name',''))) not between 2 and 120 or char_length(btrim(coalesce(branch->>'code',''))) not between 1 and 24 or coalesce(btrim(branch->>'address'),'')='' or coalesce(btrim(branch->>'city'),'')='' or upper(coalesce(branch->>'countryCode','')) !~ '^[A-Z]{2}$' then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
    insert into public.branches(
      business_id,code,name,restaurant_name,phone,address,formatted_address,city,region,country_code,country_name,postal_code,timezone,
      latitude,longitude,location_provider,provider_place_id,location_name,location_locality,
      pickup_enabled,delivery_enabled,online_ordering_enabled,is_active,slug
    ) values(
      business,upper(left(btrim(branch->>'code'),24)),btrim(branch->>'name'),requested_name,nullif(branch->>'phone',''),btrim(branch->>'address'),btrim(branch->>'address'),btrim(branch->>'city'),nullif(btrim(branch->>'region'),''),upper(branch->>'countryCode'),nullif(btrim(branch->>'countryName'),''),nullif(btrim(branch->>'postalCode'),''),coalesce(nullif(branch->>'timezone',''),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi')),
      branch_lat,branch_lng,case when has_location then 'geoapify' else null end,nullif(branch->>'providerPlaceId',''),nullif(branch->>'locationName',''),btrim(branch->>'city'),
      coalesce((branch->>'pickupEnabled')::boolean,true),false,false,true,lower(trim(both '-' from regexp_replace(btrim(branch->>'name'),'[^a-zA-Z0-9]+','-','g')))
    );
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
    (business,'ANDROID',coalesce((p_payload->>'androidEnabled')::boolean,false),nullif(p_payload->>'androidName',''),nullif(lower(p_payload->>'androidId'),''),requested_slug,case when coalesce((p_payload->>'androidEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end),
    (business,'IOS',coalesce((p_payload->>'iosEnabled')::boolean,false),nullif(p_payload->>'iosName',''),nullif(lower(p_payload->>'iosId'),''),requested_slug,case when coalesce((p_payload->>'iosEnabled')::boolean,false) then 'CONFIGURATION' else 'NOT_PURCHASED' end);
  if nullif(p_payload->>'customerDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'customerDomain'),'CUSTOMER'); end if;
  if nullif(p_payload->>'adminDomain','') is not null then insert into public.platform_domain_records(business_id,hostname,purpose) values(business,lower(p_payload->>'adminDomain'),'ADMIN'); end if;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(actor,'RESTAURANT_PROVISIONED','business',business::text,business,coalesce(nullif(p_payload->>'reason',''),'New restaurant onboarding'),jsonb_build_object('slug',requested_slug,'services',coalesce(p_payload->'services','[]'::jsonb),'branchCount',jsonb_array_length(p_payload->'branches'),'deliveryPending',coalesce(p_payload->'services','[]'::jsonb) ? 'ordering.delivery'));
  return business;
end;
$$;

create or replace function public.platform_add_branch(p_business_id uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare
  branch_id uuid; branch_name text:=btrim(p_payload->>'name'); branch_code text:=upper(btrim(p_payload->>'code')); restaurant_name text;
  lat numeric:=nullif(p_payload->>'latitude','')::numeric; lng numeric:=nullif(p_payload->>'longitude','')::numeric; has_location boolean;
begin
  if not public.has_platform_permission('branches.manage') then raise exception 'PLATFORM_PERMISSION_DENIED' using errcode='42501'; end if;
  has_location:=lat is not null and lng is not null;
  if char_length(branch_name) not between 2 and 120 or char_length(branch_code) not between 1 and 24 or coalesce(btrim(p_payload->>'address'),'')='' or coalesce(btrim(p_payload->>'city'),'')='' or upper(coalesce(p_payload->>'countryCode','')) !~ '^[A-Z]{2}$' then raise exception 'INVALID_BRANCH' using errcode='22023'; end if;
  if (lat is null) <> (lng is null) or (has_location and (lat not between -90 and 90 or lng not between -180 and 180 or (lat=0 and lng=0))) then raise exception 'INVALID_BRANCH_LOCATION' using errcode='22023'; end if;
  select name into restaurant_name from public.businesses where id=p_business_id;
  if restaurant_name is null then raise exception 'RESTAURANT_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.branches(
    business_id,code,name,restaurant_name,phone,address,formatted_address,city,region,country_code,country_name,postal_code,timezone,
    latitude,longitude,location_provider,provider_place_id,location_name,location_locality,
    pickup_enabled,delivery_enabled,online_ordering_enabled,is_active,slug
  ) values(
    p_business_id,branch_code,branch_name,restaurant_name,nullif(p_payload->>'phone',''),btrim(p_payload->>'address'),btrim(p_payload->>'address'),btrim(p_payload->>'city'),nullif(btrim(p_payload->>'region'),''),upper(p_payload->>'countryCode'),nullif(btrim(p_payload->>'countryName'),''),nullif(btrim(p_payload->>'postalCode'),''),coalesce(nullif(p_payload->>'timezone',''),'Asia/Karachi'),
    lat,lng,case when has_location then 'geoapify' else null end,nullif(p_payload->>'providerPlaceId',''),nullif(p_payload->>'locationName',''),btrim(p_payload->>'city'),
    coalesce((p_payload->>'pickupEnabled')::boolean,true),false,false,true,lower(trim(both '-' from regexp_replace(branch_name,'[^a-zA-Z0-9]+','-','g')))
  ) returning id into branch_id;
  insert into public.platform_audit_logs(actor_user_id,action,target_type,target_id,business_id,reason,after_data)
  values(auth.uid(),'BRANCH_CREATED','branches',branch_id::text,p_business_id,coalesce(nullif(p_payload->>'reason',''),'Platform branch creation'),jsonb_build_object('name',branch_name,'code',branch_code,'locationConfigured',has_location,'deliveryPending',coalesce((p_payload->>'deliveryEnabled')::boolean,false)));
  return branch_id;
end;
$$;

revoke all on function public.platform_provision_restaurant(uuid,jsonb) from public,anon;
revoke all on function public.platform_add_branch(uuid,jsonb) from public,anon;
grant execute on function public.platform_provision_restaurant(uuid,jsonb) to authenticated;
grant execute on function public.platform_add_branch(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
