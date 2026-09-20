begin;
-- Delivery staff may update location fields, not arbitrary branch settings.
create or replace function public.save_restaurant_origin(p_branch_id uuid,p_location jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare business uuid; lat numeric; lng numeric; saved public.branches;
begin
  select business_id into business from public.branches where id=p_branch_id;
  if auth.uid() is null or business is null or not (
    public.has_permission(business,'delivery.manage') or public.has_permission(business,'branches.manage')
  ) then raise exception 'Restaurant location access denied.' using errcode='42501'; end if;
  if jsonb_typeof(p_location->'latitude') is distinct from 'number' or jsonb_typeof(p_location->'longitude') is distinct from 'number'
  then raise exception 'Choose a valid restaurant pin.' using errcode='22023'; end if;
  lat:=(p_location->>'latitude')::numeric; lng:=(p_location->>'longitude')::numeric;
  if lat not between -90 and 90 or lng not between -180 and 180 or (lat=0 and lng=0)
    or coalesce(btrim(p_location->>'city'),'')='' or coalesce(btrim(p_location->>'formatted_address'),'')=''
    or coalesce(lower(p_location->>'country_code'),'') !~ '^[a-z]{2}$'
  then raise exception 'Choose a valid pin, city, country and address.' using errcode='22023'; end if;
  update public.branches set latitude=lat,longitude=lng,
    city=left(btrim(p_location->>'city'),120),
    country_code=lower(p_location->>'country_code'),
    country_name=nullif(left(btrim(p_location->>'country_name'),120),''),
    region=nullif(left(btrim(p_location->>'region'),120),''),
    postal_code=nullif(left(btrim(p_location->>'postal_code'),30),''),
    google_place_id=nullif(left(btrim(p_location->>'google_place_id'),300),''),
    address=left(btrim(p_location->>'formatted_address'),500),
    formatted_address=left(btrim(p_location->>'formatted_address'),500)
  where id=p_branch_id returning * into saved;
  return jsonb_build_object('id',saved.id,'latitude',saved.latitude,'longitude',saved.longitude,'googlePlaceId',saved.google_place_id);
end $$;
revoke all on function public.save_restaurant_origin(uuid,jsonb) from public,anon;
grant execute on function public.save_restaurant_origin(uuid,jsonb) to authenticated;
alter table public.branches validate constraint branches_valid_origin;
notify pgrst, 'reload schema';
commit;
