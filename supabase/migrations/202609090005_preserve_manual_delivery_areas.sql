begin;

create or replace function public.import_delivery_area_candidates(
  p_branch_id uuid,
  p_candidates jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_branch public.branches;
  candidate jsonb;
  candidate_name text;
  candidate_key text;
  existing_id uuid;
  existing_is_manual boolean;
  candidate_aliases text[];
  imported integer := 0;
  skipped integer := 0;
begin
  select * into parent_branch
  from public.branches
  where id = p_branch_id
  for update;

  if not found
    or auth.uid() is null
    or not (
      public.has_permission(parent_branch.business_id, 'delivery.manage')
      or public.has_permission(parent_branch.business_id, 'branches.manage')
    ) then
    raise exception 'Delivery area access denied.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_candidates) is distinct from 'array'
    or jsonb_array_length(p_candidates) > 500 then
    raise exception 'Area candidate list is invalid.' using errcode = '22023';
  end if;

  for candidate in select value from jsonb_array_elements(p_candidates)
  loop
    candidate_name := nullif(left(btrim(candidate->>'name'), 160), '');
    candidate_key := lower(regexp_replace(coalesce(candidate_name, ''), '[^[:alnum:]]', '', 'g'));
    existing_id := null;
    existing_is_manual := false;

    select coalesce(array_agg(left(value, 160)), array[]::text[])
    into candidate_aliases
    from jsonb_array_elements_text(coalesce(candidate->'aliases', '[]'::jsonb));

    if candidate_name is null
      or candidate_key = ''
      or nullif(btrim(candidate->>'providerPlaceId'), '') is null
      or jsonb_typeof(candidate->'latitude') is distinct from 'number'
      or jsonb_typeof(candidate->'longitude') is distinct from 'number'
      or (candidate->>'latitude')::numeric not between -90 and 90
      or (candidate->>'longitude')::numeric not between -180 and 180 then
      skipped := skipped + 1;
      continue;
    end if;

    select id, is_manual
    into existing_id, existing_is_manual
    from public.delivery_areas
    where branch_id = p_branch_id
      and (
        provider_place_id = candidate->>'providerPlaceId'
        or (
          lower(city) = lower(parent_branch.city)
          and lower(regexp_replace(name, '[^[:alnum:]]', '', 'g')) = candidate_key
        )
      )
    order by (provider_place_id = candidate->>'providerPlaceId') desc
    limit 1;

    -- A provider refresh must never replace a manager-curated area with
    -- provider labels, aliases, centres, or coverage rules.
    if existing_id is not null and existing_is_manual then
      skipped := skipped + 1;
      continue;
    end if;

    if existing_id is not null then
      update public.delivery_areas
      set name = candidate_name,
          aliases = case when cardinality(candidate_aliases) > 0 then candidate_aliases else aliases end,
          city = parent_branch.city,
          country_code = coalesce(nullif(lower(candidate->>'countryCode'), ''), parent_branch.country_code),
          provider_place_id = candidate->>'providerPlaceId',
          provider_source = 'Geoapify',
          center_lat = (candidate->>'latitude')::numeric,
          center_lng = (candidate->>'longitude')::numeric,
          boundary_type = case when boundary_type in ('POLYGON', 'RADIUS') then boundary_type else 'LOCALITY_MATCH' end,
          is_active = true,
          archived_by_city_change = false,
          is_manual = false
      where id = existing_id;
    else
      insert into public.delivery_areas(
        branch_id, name, slug, aliases, group_name, level, city, country_code,
        provider_place_id, provider_source, center_lat, center_lng, boundary_type,
        service_radius_meters, is_active, is_manual, archived_by_city_change, sort_order
      ) values (
        p_branch_id,
        candidate_name,
        coalesce(nullif(candidate->>'slug', ''), candidate_key) || '-' || substr(md5(candidate->>'providerPlaceId'), 1, 6),
        candidate_aliases,
        parent_branch.city,
        'SUB_AREA',
        parent_branch.city,
        coalesce(nullif(lower(candidate->>'countryCode'), ''), parent_branch.country_code),
        candidate->>'providerPlaceId',
        'Geoapify',
        (candidate->>'latitude')::numeric,
        (candidate->>'longitude')::numeric,
        'LOCALITY_MATCH',
        null,
        true,
        false,
        false,
        coalesce((select max(sort_order) + 1 from public.delivery_areas where branch_id = p_branch_id), 0)
      );
    end if;

    imported := imported + 1;
  end loop;

  return jsonb_build_object(
    'importedCount', imported,
    'skippedCount', skipped,
    'city', parent_branch.city
  );
end
$$;

revoke all on function public.import_delivery_area_candidates(uuid, jsonb) from public, anon;
grant execute on function public.import_delivery_area_candidates(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
