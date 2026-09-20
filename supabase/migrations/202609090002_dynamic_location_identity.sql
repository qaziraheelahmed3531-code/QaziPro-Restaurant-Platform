begin;

alter table public.branches add column if not exists restaurant_name text;
alter table public.branches add column if not exists location_revision bigint not null default 1;
alter table public.delivery_areas add column if not exists archived_by_city_change boolean not null default false;
alter table public.delivery_areas add column if not exists is_manual boolean not null default true;
alter table public.orders add column if not exists location_snapshot jsonb;

update public.branches branch set restaurant_name=business.name from public.businesses business
where business.id=branch.business_id and nullif(btrim(branch.restaurant_name),'') is null;
update public.delivery_areas area set city=branch.city,country_code=coalesce(area.country_code,branch.country_code),
  group_name=coalesce(nullif(btrim(area.group_name),''),branch.city),
  is_manual=coalesce(nullif(btrim(area.provider_place_id),''),nullif(btrim(area.provider_source),'')) is null
from public.branches branch where area.branch_id=branch.id
  and (nullif(btrim(area.city),'') is null or nullif(btrim(area.group_name),'') is null);

create or replace function public.delivery_area_context_defaults() returns trigger language plpgsql set search_path=public as $$
declare parent_branch public.branches;
begin
  select * into parent_branch from public.branches where id=new.branch_id;
  if not found then raise exception 'Branch not found.' using errcode='23503'; end if;
  new.city:=coalesce(nullif(left(btrim(new.city),120),''),parent_branch.city);
  new.country_code:=coalesce(nullif(lower(left(btrim(new.country_code),2)),''),parent_branch.country_code);
  new.group_name:=coalesce(nullif(left(btrim(new.group_name),120),''),new.city);
  if nullif(btrim(new.provider_place_id),'') is not null or nullif(btrim(new.provider_source),'') is not null then new.is_manual:=false; end if;
  return new;
end $$;
drop trigger if exists delivery_area_context_defaults on public.delivery_areas;
create trigger delivery_area_context_defaults before insert or update on public.delivery_areas for each row execute function public.delivery_area_context_defaults();

alter function public.save_restaurant_origin(uuid,jsonb) rename to save_restaurant_origin_coordinates;
revoke all on function public.save_restaurant_origin_coordinates(uuid,jsonb) from public,anon,authenticated;
create function public.save_restaurant_origin(p_branch_id uuid,p_location jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare previous public.branches;saved public.branches;coordinate_result jsonb;next_city text;next_name text;identity_change boolean;
begin
  select * into previous from public.branches where id=p_branch_id for update;
  if not found then raise exception 'Branch not found.' using errcode='22023'; end if;
  next_city:=nullif(left(btrim(p_location->>'city'),120),'');
  next_name:=coalesce(nullif(left(btrim(p_location->>'restaurant_name'),160),''),nullif(btrim(previous.restaurant_name),''),(select name from public.businesses where id=previous.business_id));
  if next_city is null or next_name is null then raise exception 'Restaurant name and city are required.' using errcode='22023'; end if;
  identity_change:=lower(next_city) is distinct from lower(previous.city) or lower(next_name) is distinct from lower(previous.restaurant_name);
  if identity_change and not (public.has_permission(previous.business_id,'business.manage') or public.has_permission(previous.business_id,'branches.manage')) then
    raise exception 'Branch management permission is required to change restaurant identity or service city.' using errcode='42501';
  end if;
  coordinate_result:=public.save_restaurant_origin_coordinates(p_branch_id,p_location);
  if lower(next_city) is distinct from lower(previous.city) then
    update public.delivery_areas set is_active=false,archived_by_city_change=true where branch_id=p_branch_id and is_active and lower(coalesce(nullif(btrim(city),''),previous.city))<>lower(next_city);
    update public.delivery_areas set is_active=true,archived_by_city_change=false where branch_id=p_branch_id and archived_by_city_change and lower(city)=lower(next_city);
  end if;
  update public.branches set restaurant_name=next_name,name=next_name||' — '||next_city,city=next_city,location_locality=next_city,location_revision=location_revision+1,updated_at=now()
  where id=p_branch_id returning * into saved;
  return coordinate_result||jsonb_build_object('id',saved.id,'businessId',saved.business_id,'restaurantName',saved.restaurant_name,'branchName',saved.name,
    'formattedAddress',saved.formatted_address,'city',saved.city,'locality',saved.location_locality,'region',saved.region,'country',saved.country_name,
    'countryCode',saved.country_code,'latitude',saved.latitude,'longitude',saved.longitude,'provider',saved.location_provider,
    'providerPlaceId',saved.provider_place_id,'locationRevision',saved.location_revision,'updatedAt',saved.updated_at);
end $$;
revoke all on function public.save_restaurant_origin(uuid,jsonb) from public,anon;
grant execute on function public.save_restaurant_origin(uuid,jsonb) to authenticated;

create or replace function public.import_delivery_area_candidates(p_branch_id uuid,p_candidates jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare parent_branch public.branches;candidate jsonb;candidate_name text;candidate_key text;existing_id uuid;imported integer:=0;skipped integer:=0;
begin
  select * into parent_branch from public.branches where id=p_branch_id for update;
  if not found or auth.uid() is null or not (public.has_permission(parent_branch.business_id,'delivery.manage') or public.has_permission(parent_branch.business_id,'branches.manage')) then raise exception 'Delivery area access denied.' using errcode='42501'; end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' or jsonb_array_length(p_candidates)>500 then raise exception 'Area candidate list is invalid.' using errcode='22023'; end if;
  for candidate in select value from jsonb_array_elements(p_candidates) loop
    candidate_name:=nullif(left(btrim(candidate->>'name'),160),'');candidate_key:=lower(regexp_replace(coalesce(candidate_name,''),'[^[:alnum:]]','','g'));existing_id:=null;
    if candidate_name is null or candidate_key='' or nullif(btrim(candidate->>'providerPlaceId'),'') is null
      or jsonb_typeof(candidate->'latitude') is distinct from 'number' or jsonb_typeof(candidate->'longitude') is distinct from 'number'
      or (candidate->>'latitude')::numeric not between -90 and 90 or (candidate->>'longitude')::numeric not between -180 and 180 then skipped:=skipped+1;continue;end if;
    select id into existing_id from public.delivery_areas where branch_id=p_branch_id and (provider_place_id=candidate->>'providerPlaceId'
      or (lower(city)=lower(parent_branch.city) and lower(regexp_replace(name,'[^[:alnum:]]','','g'))=candidate_key))
      order by (provider_place_id=candidate->>'providerPlaceId') desc limit 1;
    if existing_id is not null then
      update public.delivery_areas set name=candidate_name,city=parent_branch.city,country_code=coalesce(nullif(lower(candidate->>'countryCode'),''),parent_branch.country_code),
        provider_place_id=candidate->>'providerPlaceId',provider_source='Geoapify',center_lat=(candidate->>'latitude')::numeric,center_lng=(candidate->>'longitude')::numeric,
        boundary_type=case when boundary_type='POLYGON' then boundary_type else 'RADIUS' end,
        service_radius_meters=case when boundary_type='POLYGON' then service_radius_meters else coalesce(service_radius_meters,3000) end,
        is_active=true,archived_by_city_change=false,is_manual=false where id=existing_id;
    else
      insert into public.delivery_areas(branch_id,name,slug,aliases,group_name,level,city,country_code,provider_place_id,provider_source,center_lat,center_lng,boundary_type,service_radius_meters,is_active,is_manual,archived_by_city_change,sort_order)
      values(p_branch_id,candidate_name,coalesce(nullif(candidate->>'slug',''),candidate_key)||'-'||substr(md5(candidate->>'providerPlaceId'),1,6),
        coalesce(candidate->'aliases','[]'::jsonb),parent_branch.city,'SUB_AREA',parent_branch.city,coalesce(nullif(lower(candidate->>'countryCode'),''),parent_branch.country_code),
        candidate->>'providerPlaceId','Geoapify',(candidate->>'latitude')::numeric,(candidate->>'longitude')::numeric,'RADIUS',3000,true,false,false,
        coalesce((select max(sort_order)+1 from public.delivery_areas where branch_id=p_branch_id),0));
    end if;imported:=imported+1;
  end loop;
  return jsonb_build_object('importedCount',imported,'skippedCount',skipped,'city',parent_branch.city);
end $$;
revoke all on function public.import_delivery_area_candidates(uuid,jsonb) from public,anon;
grant execute on function public.import_delivery_area_candidates(uuid,jsonb) to authenticated;

create or replace function public.snapshot_order_location() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then new.location_snapshot:=old.location_snapshot;return new;end if;
  select jsonb_strip_nulls(jsonb_build_object('restaurantName',coalesce(branch.restaurant_name,business.name),'branchName',branch.name,
    'branchAddress',coalesce(branch.formatted_address,branch.address),'branchCity',branch.city,'deliveryAreaName',coalesce(area.name,new.delivery_area_name),
    'deliveryCity',area.city,'customerAddress',new.delivery_address,'restaurantLatitude',branch.latitude,'restaurantLongitude',branch.longitude))
  into new.location_snapshot from public.branches branch join public.businesses business on business.id=branch.business_id
  left join public.delivery_areas area on area.id=new.delivery_area_id where branch.id=new.branch_id;
  return new;
end $$;
drop trigger if exists snapshot_order_location on public.orders;
create trigger snapshot_order_location before insert or update on public.orders for each row execute function public.snapshot_order_location();

create index if not exists delivery_areas_branch_city_active_idx on public.delivery_areas(branch_id,city,is_active,sort_order);
create index if not exists branches_business_location_revision_idx on public.branches(business_id,location_revision);
notify pgrst,'reload schema';
commit;
