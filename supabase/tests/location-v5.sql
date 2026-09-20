-- Isolated database only: requires seed and local-bootstrap. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','location-owner@example.test',now()),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','location-cashier@example.test',now());
insert into public.staff_memberships(business_id,user_id,branch_id,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,'OWNER'),
 ('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','CASHIER');
insert into public.staff_membership_branches(membership_id,business_id,branch_id)
select id,business_id,branch_id from public.staff_memberships where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
do $$ declare target uuid; begin
 select id into target from public.delivery_areas where slug='hamlet-colony' limit 1;
 if (select boundary_type from public.delivery_areas where id=target)<>'LOCALITY_MATCH' then raise exception 'Existing area was assigned a fabricated boundary'; end if;
 begin update public.delivery_areas set boundary_type='RADIUS' where id=target; raise exception 'Incomplete radius accepted'; exception when check_violation then null; end;
 begin update public.delivery_areas set boundary_type='POLYGON',boundary_geojson='{}' where id=target; raise exception 'Missing polygon type accepted'; exception when check_violation then null; end;
 begin update public.delivery_areas set center_lat=91,center_lng=72 where id=target; raise exception 'Invalid coordinate accepted'; exception when check_violation then null; end;
 begin update public.delivery_areas set center_lat=33 where id=target; raise exception 'Half coordinate accepted'; exception when check_violation then null; end;
 update public.delivery_areas set center_lat=33.2,center_lng=72.2,service_radius_meters=500,boundary_type='RADIUS' where id=target;
 if not exists(select 1 from public.delivery_areas where id=target and service_radius_meters=500 and boundary_type='RADIUS') then raise exception 'Coverage persistence failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ declare snapshot jsonb; ids uuid[]; after_order jsonb; begin
 snapshot:=public.content_order('11111111-1111-4111-8111-111111111111','areas','22222222-2222-4222-8222-222222222222');
 if jsonb_array_length(snapshot)<50 then raise exception 'Area ordering omitted paginated records'; end if;
 select array_agg((entry->>'id')::uuid order by ordinal desc) into ids from jsonb_array_elements(snapshot) with ordinality e(entry,ordinal);
 perform public.reorder_content('11111111-1111-4111-8111-111111111111','areas','22222222-2222-4222-8222-222222222222',ids,snapshot);
 after_order:=public.content_order('11111111-1111-4111-8111-111111111111','areas','22222222-2222-4222-8222-222222222222');
 if after_order->0->>'id'<>ids[1]::text then raise exception 'Area reorder not persisted'; end if;
 begin perform public.reorder_content('11111111-1111-4111-8111-111111111111','areas','22222222-2222-4222-8222-222222222222',ids,snapshot); raise exception 'Stale order accepted'; exception when serialization_failure then null; end;
 if public.content_order('11111111-1111-4111-8111-111111111111','areas','99999999-9999-4999-8999-999999999999')<>'[]' then raise exception 'Foreign branch exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
 begin perform public.content_order('11111111-1111-4111-8111-111111111111','areas','22222222-2222-4222-8222-222222222222'); raise exception 'Cashier reordered delivery areas'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.business_hours set opens_at='00:00',closes_at='23:59:59',is_closed=false;
do $$ declare selections jsonb; sale jsonb; begin
 select jsonb_agg(jsonb_build_object('groupId',chosen.group_id,'optionId',chosen.id)) into selections from (
   select g.id group_id,selected.id from public.product_modifier_groups assignment join public.modifier_groups g on g.id=assignment.modifier_group_id
   cross join lateral (select m.id from public.modifier_options m where m.modifier_group_id=g.id and m.is_active order by m.is_default desc,m.sort_order limit g.min_selections) selected
   where assignment.product_id='40000000-0000-4000-8000-000000000001' and g.is_active
 ) chosen;
 sale:=public.create_order_authoritative(jsonb_build_object('idempotencyKey','qa-location-order-0001','branchId','22222222-2222-4222-8222-222222222222','serviceMode','DELIVERY','customerName','Location QA','customerPhone','03000000000','deliveryAddress','Synthetic QA address','deliveryAreaId',(select id from public.delivery_areas where slug='hamlet-colony' limit 1),'distanceKm',7,'latitude',33.2,'longitude',72.2,'locationSource','MAP_PIN','items',jsonb_build_array(jsonb_build_object('productId','40000000-0000-4000-8000-000000000001','quantity',1,'modifiers',selections))),null);
 if not exists(select 1 from public.orders where id=(sale->>'id')::uuid and location_source='MAP_PIN' and latitude=33.2 and longitude=72.2 and delivery_fee=200) then raise exception 'Order source, pin or existing fee rule changed'; end if;
end $$;
rollback;
select 'PASS: geometry fields/constraints, full-collection area reorder, stale save, branch scope, permissions and transactional order pin/source/fee' as result;
