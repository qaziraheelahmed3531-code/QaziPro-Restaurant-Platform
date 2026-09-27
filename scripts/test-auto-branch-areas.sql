begin;
do $$
declare actor uuid; b public.branches; other_branch uuid; result jsonb;
  marker text:='area-qa-'||gen_random_uuid(); candidates jsonb; before_count integer;
begin
  select branches.* into b from public.branches where is_active and latitude is not null and longitude is not null
    and exists(select 1 from public.staff_memberships where business_id=branches.business_id and role='OWNER' and is_active) limit 1;
  if b.id is null then raise exception 'No staging map-pin fixture available'; end if;
  select user_id into actor from public.platform_staff where status='ACTIVE' limit 1;
  if actor is null then raise exception 'No staging platform actor available'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  if not (public.has_platform_permission('branches.manage') or public.has_platform_permission('onboarding.manage')) then raise exception 'Fixture actor cannot manage branches'; end if;
  candidates:=jsonb_build_array(
    jsonb_build_object('name',marker,'providerPlaceId',marker,'latitude',b.latitude,'longitude',b.longitude,'countryCode',b.country_code),
    jsonb_build_object('name',marker||'-outside','providerPlaceId',marker||'-outside','latitude',b.latitude+1,'longitude',b.longitude,'countryCode',b.country_code));
  result:=public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,candidates);
  if (result->>'importedCount')::integer<>1 then raise exception 'Radius insert failed'; end if;
  result:=public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,candidates);
  if (result->>'importedCount')::integer<>0 then raise exception 'Duplicate import was not idempotent'; end if;
  update public.delivery_areas set is_active=false where branch_id=b.id and provider_place_id=marker;
  perform public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,candidates);
  if exists(select 1 from public.delivery_areas where branch_id=b.id and provider_place_id=marker and is_active) then raise exception 'Disabled area was reactivated'; end if;
  insert into public.delivery_areas(branch_id,name,slug,city,is_active,is_manual)
  values(b.id,marker||'-manual',marker||'-manual',b.city,true,true);
  result:=public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,
    jsonb_build_array(jsonb_build_object('name',marker||'-manual','providerPlaceId','different-provider','latitude',b.latitude,'longitude',b.longitude)));
  if (result->>'importedCount')::integer<>0 or not exists(select 1 from public.delivery_areas where branch_id=b.id and slug=marker||'-manual' and is_manual and provider_place_id is null) then raise exception 'Manual area overwritten'; end if;
  begin
    perform public.auto_populate_branch_delivery_areas(b.id,b.latitude+0.001,b.longitude,candidates);
    raise exception 'Stale coordinates accepted';
  exception when sqlstate '40001' then null; end;
  select user_id into actor from public.staff_memberships where business_id=b.business_id and role='OWNER' and is_active limit 1;
  if actor is null then raise exception 'No staging restaurant-owner fixture'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,'[]');
  -- Use an unrelated authenticated identity; no real authentication/session is minted.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin
    perform public.auto_populate_branch_delivery_areas(b.id,b.latitude,b.longitude,candidates);
    raise exception 'Unauthorized area import accepted';
  exception when sqlstate '42501' then null; end;
  if has_function_privilege('anon','public.auto_populate_branch_delivery_areas(uuid,numeric,numeric,jsonb)','execute') then raise exception 'Anonymous RPC access'; end if;
end $$;
rollback;
select 'PASS: platform/owner access, 8km radius, duplicate protection, manual/disabled preservation, stale origin rejection and unauthorized denial. All data rolled back.' as result;
