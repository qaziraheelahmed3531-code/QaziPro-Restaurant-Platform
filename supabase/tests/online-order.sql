-- Isolated QA database only. Assumes platform seed; all fixture rows roll back.
\set ON_ERROR_STOP on
begin;
update public.business_hours set opens_at='00:00',closes_at='23:59:59',is_closed=false;
insert into auth.users(id) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
insert into public.staff_memberships(business_id,user_id,role) values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','OWNER');
do $$ declare selections jsonb; payload jsonb; sale jsonb; expected integer; actual public.orders; begin
  select jsonb_agg(jsonb_build_object('groupId',chosen.group_id,'optionId',chosen.id)) into selections from (
    select g.id group_id,selected.id from public.product_modifier_groups assignment join public.modifier_groups g on g.id=assignment.modifier_group_id
    cross join lateral (select m.id from public.modifier_options m where m.modifier_group_id=g.id and m.is_active order by m.is_default desc,m.sort_order limit g.min_selections) selected
    where assignment.product_id='40000000-0000-4000-8000-000000000001' and g.is_active
  ) chosen;
  payload:=jsonb_build_object('branchId','22222222-2222-4222-8222-222222222222','serviceMode','DELIVERY','customerName','QA Customer','customerPhone','03000000000','deliveryAddress','QA address','deliveryAreaId',(select id from public.delivery_areas where slug='hamlet-colony' limit 1),'distanceKm',7,'items',jsonb_build_array(jsonb_build_object('productId','40000000-0000-4000-8000-000000000001','quantity',1,'unitPrice',1,'modifiers',selections)));
  sale:=public.create_order_authoritative(payload,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  select coalesce(sale_price,base_price)+(select coalesce(sum(m.price_adjustment),0) from jsonb_array_elements(selections) v join public.modifier_options m on m.id=(v->>'optionId')::uuid)+200 into expected from public.products where id='40000000-0000-4000-8000-000000000001';
  if (sale->>'total')::integer is distinct from expected then raise exception 'Authoritative total mismatch'; end if;
  select * into actual from public.orders where id=(sale->>'id')::uuid;
  if actual.token_number is distinct from 1 or actual.channel<>'WEBSITE' or actual.operational_order_type<>'DELIVERY' or actual.delivery_fee<>200 then raise exception 'Online token/channel/delivery failed'; end if;
  update public.branches set online_ordering_enabled=false where id=actual.branch_id;
  begin
    perform public.create_order_authoritative(payload,null);
    raise exception 'Paused website accepted an order';
  exception when invalid_parameter_value then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin if (select count(*) from public.orders)<>1 then raise exception 'Admin cannot see website order'; end if; end $$;
update public.orders set status='CONFIRMED';
update public.orders set status='PREPARING';
update public.orders set status='READY';
update public.orders set status='OUT_FOR_DELIVERY';
update public.orders set status='DELIVERED';
do $$ declare directory jsonb; begin
 directory:=public.customer_directory('11111111-1111-4111-8111-111111111111');
 if (directory->>'total')::integer is distinct from 1 then raise exception 'Customer directory aggregation failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$ begin
 if (select count(*) from public.orders where status='DELIVERED')<>1 then raise exception 'Customer cannot see final tracking state'; end if;
 if (select count(*) from public.order_status_history)<>6 then raise exception 'Tracking history incomplete'; end if;
end $$;
reset role;
select 'PASS: website delivery, Hamlet Colony, required modifiers, authoritative price, delivery fee, token, online pause, Admin visibility, kitchen workflow, customer directory and tracking history' as result;
rollback;
