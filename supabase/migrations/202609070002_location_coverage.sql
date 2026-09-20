-- Location V5: additive only. Existing areas remain locality-based until real
-- restaurant-approved geometry is configured. Existing policies remain intact.
begin;

alter table public.delivery_areas
  add column if not exists center_lat numeric,
  add column if not exists center_lng numeric,
  add column if not exists service_radius_meters numeric,
  add column if not exists boundary_geojson jsonb,
  add column if not exists boundary_type text not null default 'LOCALITY_MATCH';

alter table public.delivery_areas
  add constraint delivery_area_center_pair check ((center_lat is null) = (center_lng is null)),
  add constraint delivery_area_center_range check (center_lat between -90 and 90 and center_lng between -180 and 180),
  add constraint delivery_area_radius_positive check (service_radius_meters > 0 and service_radius_meters < 'Infinity'::numeric),
  add constraint delivery_area_boundary_type check (boundary_type in ('POLYGON','RADIUS','LOCALITY_MATCH')),
  add constraint delivery_area_radius_required check (boundary_type <> 'RADIUS' or (center_lat is not null and center_lng is not null and service_radius_meters is not null)),
  add constraint delivery_area_polygon_required check (boundary_type <> 'POLYGON' or coalesce((boundary_geojson is not null and jsonb_typeof(boundary_geojson) = 'object' and boundary_geojson->>'type' in ('Polygon','MultiPolygon') and jsonb_typeof(boundary_geojson->'coordinates') = 'array'), false));

alter table public.customer_addresses add column if not exists location_source text not null default 'MANUAL_AREA'
  check (location_source in ('GPS','AUTOCOMPLETE','MAP_PIN','SAVED_ADDRESS','MANUAL_AREA'));
alter table public.orders add column if not exists location_source text
  check (location_source in ('GPS','AUTOCOMPLETE','MAP_PIN','SAVED_ADDRESS','MANUAL_AREA'));

-- Preserve every prior inventory/payment/order patch; add provenance to the
-- existing transactional insert rather than replacing its business logic.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.create_order_authoritative(jsonb,uuid)'::regprocedure) into definition;
  if position('latitude, longitude, distance_km' in definition) = 0
    or position('nullif(p_payload->>''distanceKm'', '''')::numeric' in definition) = 0 then
    raise exception 'Order function changed: review location provenance patch before applying.';
  end if;
  definition := replace(definition, 'latitude, longitude, distance_km', 'latitude, longitude, distance_km, location_source');
  definition := replace(definition, 'nullif(p_payload->>''distanceKm'', '''')::numeric',
    'nullif(p_payload->>''distanceKm'', '''')::numeric, case when mode = ''DELIVERY'' then coalesce(nullif(p_payload->>''locationSource'', ''''), ''MANUAL_AREA'') else null end');
  execute definition;
end;
$migration$;

create or replace function public.content_order(p_business_id uuid,p_collection text,p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare tbl text; perm text; predicate text; label text:='name'; result jsonb;
begin
 select t,p into tbl,perm from (values
 ('areas','delivery_areas','delivery.manage'),('categories','categories','categories.manage'),('products','products','products.manage'),
 ('banners','hero_banners','banners.manage'),('promotionalBanners','promotional_banners','banners.manage'),
 ('deals','deals','deals.manage'),('modifierGroups','modifier_groups','modifiers.manage'),
 ('modifierOptions','modifier_options','modifiers.manage'),('socialLinks','social_links','content.manage'),
 ('productImages','product_images','products.manage'),('productModifierGroups','product_modifier_groups','modifiers.manage')
 ) c(k,t,p) where k=p_collection;
 if tbl is null or not (public.has_permission(p_business_id,perm)) then raise exception 'Ordering access denied.' using errcode='42501'; end if;
 predicate:=format('business_id=%L',p_business_id);
 if p_collection='areas' then predicate:=format('branch_id=%L and exists(select 1 from public.branches b where b.id=branch_id and b.business_id=%L)',p_parent,p_business_id); end if;
 if p_collection='products' then predicate:=predicate||format(' and category_id=%L',p_parent); end if;
 if p_collection='modifierOptions' then predicate:=format('modifier_group_id=%L and exists(select 1 from public.modifier_groups g where g.id=modifier_group_id and g.business_id=%L)',p_parent,p_business_id); end if;
 if p_collection='productImages' then predicate:=format('product_id=%L and exists(select 1 from public.products p where p.id=product_id and p.business_id=%L)',p_parent,p_business_id); label:='alt_text'; end if;
 if p_collection='productModifierGroups' then
  execute 'select coalesce(jsonb_agg(jsonb_build_object(''id'',a.id,''label'',g.name,''sort_order'',a.sort_order) order by a.sort_order,a.id),''[]'') from public.product_modifier_groups a join public.products p on p.id=a.product_id join public.modifier_groups g on g.id=a.modifier_group_id where p.business_id=$1 and p.id=$2' into result using p_business_id,p_parent;
  return result;
 end if;
 if p_collection='banners' then label:='internal_name'; end if;
 if p_collection='promotionalBanners' then label:='title'; end if;
 if p_collection='socialLinks' then label:='platform'; end if;
 execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''label'',coalesce(%I,''Untitled''),''sort_order'',sort_order) order by sort_order,id),''[]'') from public.%I where %s',label,tbl,predicate) into result;
 return result;
end; $$;

create or replace function public.reorder_content(p_business_id uuid,p_collection text,p_parent uuid,p_ids uuid[],p_expected jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare current_order jsonb; tbl text;
begin
 perform 1 from public.businesses where id=p_business_id for update;
 current_order:=public.content_order(p_business_id,p_collection,p_parent);
 if current_order is distinct from p_expected then raise exception 'Content changed. Reload the order and try again.' using errcode='40001'; end if;
 if cardinality(p_ids)<>jsonb_array_length(current_order) or cardinality(p_ids)<>(select count(distinct v) from unnest(p_ids) v) or
 exists(select 1 from unnest(p_ids) v where not exists(select 1 from jsonb_array_elements(current_order) e where e->>'id'=v::text)) then
 raise exception 'Supply every item in the collection exactly once.' using errcode='22023'; end if;
 tbl:=case p_collection when 'areas' then 'delivery_areas' when 'banners' then 'hero_banners' when 'promotionalBanners' then 'promotional_banners' when 'modifierGroups' then 'modifier_groups' when 'modifierOptions' then 'modifier_options' when 'socialLinks' then 'social_links' when 'productImages' then 'product_images' when 'productModifierGroups' then 'product_modifier_groups' else p_collection end;
 execute format('update public.%I t set sort_order=v.position from unnest($1) with ordinality v(id,position) where t.id=v.id',tbl) using p_ids;
 insert into public.audit_logs(business_id,actor_id,action,entity_type,metadata) values(p_business_id,auth.uid(),'CONTENT_REORDERED',tbl,jsonb_build_object('count',cardinality(p_ids)));
end; $$;
revoke all on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.content_order(uuid,text,uuid),public.reorder_content(uuid,text,uuid,uuid[],jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
