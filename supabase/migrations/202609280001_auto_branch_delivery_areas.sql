begin;

-- Reuse delivery_areas; discovery must never change an operator's existing areas or fees.
create or replace function public.auto_populate_branch_delivery_areas(
  p_branch_id uuid, p_latitude numeric, p_longitude numeric, p_candidates jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  branch public.branches; candidate jsonb; candidate_name text; candidate_key text;
  lat double precision; lng double precision; metres double precision; inserted integer:=0; affected integer;
begin
  select * into branch from public.branches where id=p_branch_id for update;
  if not found or auth.uid() is null or not (
    public.has_platform_permission('branches.manage') or public.has_platform_permission('onboarding.manage')
    or (public.staff_can_access_branch(branch.business_id,branch.id) and
      (public.has_permission(branch.business_id,'branches.manage') or public.has_permission(branch.business_id,'delivery.manage')))
  ) then raise exception 'Branch area access denied.' using errcode='42501'; end if;
  if branch.latitude is null or branch.longitude is null
    or p_latitude is distinct from branch.latitude or p_longitude is distinct from branch.longitude then
    raise exception 'Branch location changed. Retry area discovery.' using errcode='40001';
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>4000 then
    raise exception 'Invalid area list.' using errcode='22023';
  end if;
  for candidate in select value from jsonb_array_elements(p_candidates) loop
    candidate_name:=nullif(left(btrim(candidate->>'name'),160),'');
    candidate_key:=lower(regexp_replace(coalesce(candidate_name,''),'[^[:alnum:]]','','g'));
    if candidate_name is null or candidate_key='' or nullif(candidate->>'providerPlaceId','') is null
      or jsonb_typeof(candidate->'latitude') is distinct from 'number'
      or jsonb_typeof(candidate->'longitude') is distinct from 'number' then continue; end if;
    lat:=(candidate->>'latitude')::double precision; lng:=(candidate->>'longitude')::double precision;
    if lat not between -90 and 90 or lng not between -180 and 180 then continue; end if;
    metres:=6371000*2*asin(sqrt(least(1.0,power(sin(radians(lat-branch.latitude::double precision)/2),2)
      +cos(radians(branch.latitude::double precision))*cos(radians(lat))*power(sin(radians(lng-branch.longitude::double precision)/2),2))));
    if metres>8000 then continue; end if;
    if exists(select 1 from public.delivery_areas where branch_id=branch.id and
      (provider_place_id=candidate->>'providerPlaceId' or lower(regexp_replace(name,'[^[:alnum:]]','','g'))=candidate_key)) then continue; end if;
    insert into public.delivery_areas(branch_id,name,slug,aliases,group_name,level,city,country_code,
      provider_place_id,provider_source,center_lat,center_lng,boundary_type,is_active,is_manual,archived_by_city_change,sort_order)
    values(branch.id,candidate_name,'nearby-'||md5(candidate->>'providerPlaceId'),array[]::text[],branch.city,'SUB_AREA',branch.city,
      coalesce(nullif(candidate->>'countryCode',''),branch.country_code),candidate->>'providerPlaceId','Geoapify',lat,lng,
      'LOCALITY_MATCH',true,false,false,coalesce((select max(sort_order)+1 from public.delivery_areas where branch_id=branch.id),0))
    on conflict do nothing;
    get diagnostics affected=row_count; inserted:=inserted+affected;
  end loop;
  return jsonb_build_object('importedCount',inserted,'radiusMeters',8000);
end $$;
revoke all on function public.auto_populate_branch_delivery_areas(uuid,numeric,numeric,jsonb) from public,anon;
grant execute on function public.auto_populate_branch_delivery_areas(uuid,numeric,numeric,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
