-- Step 5 customer ownership, scope guards, device-token and outbox regression.
-- All fixtures are isolated and rolled back.
begin;

insert into public.businesses(id,slug,name,city) values
  ('c0000000-0000-4000-8000-000000000001','mobile-qa-a','Mobile QA A','Islamabad'),
  ('d0000000-0000-4000-8000-000000000001','mobile-qa-b','Mobile QA B','Lahore');
insert into public.branches(id,business_id,code,slug,name,city) values
  ('c0000000-0000-4000-8000-000000000101','c0000000-0000-4000-8000-000000000001','A1','a1','A1','Islamabad'),
  ('c0000000-0000-4000-8000-000000000102','c0000000-0000-4000-8000-000000000001','A2','a2','A2','Rawalpindi'),
  ('d0000000-0000-4000-8000-000000000101','d0000000-0000-4000-8000-000000000001','B1','b1','B1','Lahore'),
  ('d0000000-0000-4000-8000-000000000102','d0000000-0000-4000-8000-000000000001','B2','b2','B2','Lahore');
insert into public.delivery_areas(id,branch_id,slug,name,group_name,city) values
  ('c0000000-0000-4000-8000-000000000201','c0000000-0000-4000-8000-000000000101','a1-zone','A1 Zone','Nearby','Islamabad'),
  ('d0000000-0000-4000-8000-000000000201','d0000000-0000-4000-8000-000000000101','b1-zone','B1 Zone','Nearby','Lahore');
insert into public.categories(id,business_id,slug,name) values
  ('c0000000-0000-4000-8000-000000000301','c0000000-0000-4000-8000-000000000001','food','Food'),
  ('d0000000-0000-4000-8000-000000000301','d0000000-0000-4000-8000-000000000001','food','Food');
insert into public.products(id,business_id,category_id,slug,name,base_price) values
  ('c0000000-0000-4000-8000-000000000401','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000301','meal','Meal A',1000),
  ('d0000000-0000-4000-8000-000000000401','d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000301','meal','Meal B',500);
insert into auth.users(id,email,email_confirmed_at) values
  ('cc000000-0000-4000-8000-000000000001','customer-a@mobile.qa',now()),
  ('dd000000-0000-4000-8000-000000000001','customer-b@mobile.qa',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000001',true);
insert into public.customer_addresses(id,customer_id,business_id,branch_id,delivery_area_id,label,city,address_line_1)
values('c0000000-0000-4000-8000-000000000501','cc000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000101','c0000000-0000-4000-8000-000000000201','home','Islamabad','QA address');
insert into public.customer_favourites(id,user_id,business_id,product_id)
values('c0000000-0000-4000-8000-000000000601','cc000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000401');
select public.register_customer_device('c0000000-0000-4000-8000-000000000001','mobile-device-a-0001','android','provider-token-mobile-qa-a-000000000001','1.0.0','en-PK');
select public.set_customer_default_address('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000501');

do $$ declare denied boolean:=false;
begin
  begin
    insert into public.customer_addresses(customer_id,business_id,branch_id,delivery_area_id,label,city,address_line_1)
    values('cc000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000102','c0000000-0000-4000-8000-000000000201','work','Rawalpindi','forged area');
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'Address accepted a delivery area from another branch'; end if;
  denied:=false;
  begin
    insert into public.customer_favourites(user_id,business_id,product_id)
    values('cc000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000401');
  exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'Favourite accepted a product from another restaurant'; end if;
end $$;

select set_config('request.jwt.claim.sub','dd000000-0000-4000-8000-000000000001',true);
do $$ begin
  if exists(select 1 from public.customer_addresses where id='c0000000-0000-4000-8000-000000000501') then raise exception 'Customer B read customer A address'; end if;
  if exists(select 1 from public.customer_favourites where id='c0000000-0000-4000-8000-000000000601') then raise exception 'Customer B read customer A favourite'; end if;
  if exists(select 1 from public.customer_device_tokens where device_id='mobile-device-a-0001') then raise exception 'Customer B read customer A device'; end if;
  begin
    perform count(*) from public.customer_notification_outbox;
    raise exception 'Authenticated client received direct notification outbox privileges';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare created jsonb; target_order_id uuid;
begin
  created:=public.create_order_authoritative(jsonb_build_object(
    'idempotencyKey','mobile-outbox-qa-0001','branchId','c0000000-0000-4000-8000-000000000101',
    'serviceMode','PICKUP','customerName','Mobile QA','customerPhone','03000000000',
    'items',jsonb_build_array(jsonb_build_object('productId','c0000000-0000-4000-8000-000000000401','quantity',1))
  ),'cc000000-0000-4000-8000-000000000001');
  target_order_id:=(created->>'id')::uuid;
  update public.orders set status='CONFIRMED' where id=target_order_id;
  if not exists(select 1 from public.customer_notification_outbox where order_id=target_order_id and event_type='ORDER_STATUS_CHANGED' and status='PENDING') then
    raise exception 'Order status did not enqueue notification outbox';
  end if;
end $$;

select 'PASS: customer ownership, tenant/branch guards, device registration and private notification outbox' as result;
rollback;
