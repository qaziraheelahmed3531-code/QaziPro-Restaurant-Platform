-- Step 2 adversarial tenant, branch and checkout regression suite.
-- Runs only against an isolated QA database; every fixture rolls back.
\set ON_ERROR_STOP on
begin;

insert into public.businesses(id,slug,name,city) values
  ('a0000000-0000-4000-8000-000000000001','qa-restaurant-a','QA Restaurant A','Islamabad'),
  ('b0000000-0000-4000-8000-000000000001','qa-restaurant-b','QA Restaurant B','Lahore');
insert into public.business_domains(business_id,hostname,domain_type,is_primary,is_active,verified_at) values
  ('a0000000-0000-4000-8000-000000000001','a.qa.example','CUSTOM',true,true,now()),
  ('b0000000-0000-4000-8000-000000000001','b.qa.example','CUSTOM',true,true,now());
insert into public.branches(id,business_id,code,slug,name,city) values
  ('a0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000001','A1','a1','A Branch 1','Islamabad'),
  ('a0000000-0000-4000-8000-000000000102','a0000000-0000-4000-8000-000000000001','A2','a2','A Branch 2','Rawalpindi'),
  ('b0000000-0000-4000-8000-000000000101','b0000000-0000-4000-8000-000000000001','B1','b1','B Branch 1','Lahore'),
  ('b0000000-0000-4000-8000-000000000102','b0000000-0000-4000-8000-000000000001','B2','b2','B Branch 2','Gujranwala');
insert into public.business_operating_settings(business_id,tax_rate_bps) values
  ('a0000000-0000-4000-8000-000000000001',1000),
  ('b0000000-0000-4000-8000-000000000001',0);

insert into public.categories(id,business_id,slug,name) values
  ('a0000000-0000-4000-8000-000000000201','a0000000-0000-4000-8000-000000000001','food','Food'),
  ('b0000000-0000-4000-8000-000000000201','b0000000-0000-4000-8000-000000000001','food','Food');
insert into public.products(id,business_id,category_id,slug,name,base_price) values
  ('a0000000-0000-4000-8000-000000000301','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000201','meal','A Meal',1000),
  ('b0000000-0000-4000-8000-000000000301','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000201','meal','B Meal',500);
insert into public.product_variants(id,product_id,name,price_adjustment,is_default) values
  ('a0000000-0000-4000-8000-000000000401','a0000000-0000-4000-8000-000000000301','Large',200,true),
  ('b0000000-0000-4000-8000-000000000401','b0000000-0000-4000-8000-000000000301','Large',50,true);
insert into public.branch_product_overrides(business_id,branch_id,product_id,price_override,is_available,pos_visible,online_visible,stock_available) values
  ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000301',1100,true,true,true,true),
  ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000102','a0000000-0000-4000-8000-000000000301',null,true,true,true,true);

insert into auth.users(id,email,email_confirmed_at) values
  ('aa000000-0000-4000-8000-000000000001','a1-staff@qa.example',now()),
  ('aa000000-0000-4000-8000-000000000002','a-multi@qa.example',now()),
  ('aa000000-0000-4000-8000-000000000003','a-owner@qa.example',now()),
  ('bb000000-0000-4000-8000-000000000001','b1-staff@qa.example',now());
insert into public.staff_memberships(id,business_id,user_id,branch_id,role,is_active,permissions_customized) values
  ('aa100000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000101','STAFF',true,true),
  ('aa100000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000101','STAFF',true,true),
  ('aa100000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000003',null,'OWNER',true,false),
  ('bb100000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000101','STAFF',true,true);
insert into public.staff_membership_branches(membership_id,business_id,branch_id) values
  ('aa100000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000101'),
  ('aa100000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000101'),
  ('aa100000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000102'),
  ('bb100000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000101');
insert into public.staff_membership_permissions(membership_id,permission_code)
select membership_id,permission_code from (values
  ('aa100000-0000-4000-8000-000000000001'::uuid,'orders.read'),
  ('aa100000-0000-4000-8000-000000000001'::uuid,'orders.manage'),
  ('aa100000-0000-4000-8000-000000000001'::uuid,'products.manage'),
  ('aa100000-0000-4000-8000-000000000002'::uuid,'orders.read'),
  ('bb100000-0000-4000-8000-000000000001'::uuid,'orders.read')
) permission_rows(membership_id,permission_code);

do $$
declare a1 jsonb; a1_retry jsonb; a2 jsonb; b1 jsonb; resolution record; denied boolean:=false;
declare a_payload jsonb:=jsonb_build_object(
  'idempotencyKey','qa-a1-checkout-0001','branchId','a0000000-0000-4000-8000-000000000101',
  'serviceMode','PICKUP','customerName','QA A','customerPhone','03000000001',
  'items',jsonb_build_array(jsonb_build_object('productId','a0000000-0000-4000-8000-000000000301','variantId','a0000000-0000-4000-8000-000000000401','quantity',1))
);
begin
  select * into resolution from public.resolve_storefront_business('a.qa.example','platform.qa.example',null);
  if resolution.resolved_business_id<>'a0000000-0000-4000-8000-000000000001' or resolution.resolution<>'DOMAIN' then raise exception 'Custom domain resolved the wrong restaurant'; end if;
  select * into resolution from public.resolve_storefront_business('qa-restaurant-b.platform.qa.example','platform.qa.example',null);
  if resolution.resolved_business_id<>'b0000000-0000-4000-8000-000000000001' or resolution.resolution<>'SUBDOMAIN' then raise exception 'Platform subdomain resolved the wrong restaurant'; end if;
  select * into resolution from public.resolve_storefront_business('localhost',null,'qa-restaurant-a');
  if resolution.resolved_business_id<>'a0000000-0000-4000-8000-000000000001' or resolution.resolution<>'SLUG' then raise exception 'Explicit slug fallback resolved the wrong restaurant'; end if;

  a1:=public.create_order_authoritative(a_payload,null);
  a1_retry:=public.create_order_authoritative(a_payload,null);
  if a1->>'id'<>a1_retry->>'id' or not (a1_retry->>'idempotent')::boolean then raise exception 'Checkout retry created a duplicate'; end if;
  if (a1->>'subtotal')::integer<>1300 or (a1->>'tax')::integer<>130 or (a1->>'total')::integer<>1430 then raise exception 'A1 override/variant/tax total failed: %',a1; end if;
  if (select count(*) from public.orders where business_id='a0000000-0000-4000-8000-000000000001' and branch_id='a0000000-0000-4000-8000-000000000101')<>1 then raise exception 'Idempotency row count failed'; end if;
  if not exists(select 1 from public.order_items where order_id=(a1->>'id')::uuid and variant_id='a0000000-0000-4000-8000-000000000401' and variant_name='Large') then raise exception 'Variant snapshot was not persisted'; end if;
  begin perform public.create_order_authoritative(a_payload||jsonb_build_object('customerName','Different payload'),null); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'Reused idempotency key accepted different payload'; end if;

  a2:=public.create_order_authoritative((a_payload-'idempotencyKey'-'branchId')||jsonb_build_object('idempotencyKey','qa-a2-checkout-0001','branchId','a0000000-0000-4000-8000-000000000102'),null);
  if (a2->>'subtotal')::integer<>1200 or (a2->>'tax')::integer<>120 or (a2->>'total')::integer<>1320 then raise exception 'A2 base/variant/tax total failed: %',a2; end if;
  b1:=public.create_order_authoritative(jsonb_build_object('idempotencyKey','qa-b1-checkout-0001','branchId','b0000000-0000-4000-8000-000000000101','serviceMode','PICKUP','customerName','QA B','customerPhone','03000000002','items',jsonb_build_array(jsonb_build_object('productId','b0000000-0000-4000-8000-000000000301','variantId','b0000000-0000-4000-8000-000000000401','quantity',1))),null);
  if (b1->>'subtotal')::integer<>550 or (b1->>'tax')::integer<>0 or (b1->>'total')::integer<>550 then raise exception 'Restaurant B pricing leaked from A: %',b1; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
do $$ declare visible_rows integer; changed integer; denied boolean:=false;
begin
  select count(*) into visible_rows from public.orders where business_id in ('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001');
  if visible_rows<>1 or exists(select 1 from public.orders where branch_id<>'a0000000-0000-4000-8000-000000000101') then raise exception 'A1 staff read another branch or restaurant'; end if;
  update public.branch_product_overrides set price_override=9999 where branch_id='a0000000-0000-4000-8000-000000000102'; get diagnostics changed=row_count;
  if changed<>0 then raise exception 'A1 staff updated A2 catalog'; end if;
  begin
    insert into public.branch_product_overrides(business_id,branch_id,product_id,price_override) values('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000101','b0000000-0000-4000-8000-000000000301',1);
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Restaurant A staff wrote Restaurant B catalog'; end if;
end $$;

select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000002',true);
do $$ begin
  if (select count(*) from public.orders where business_id='a0000000-0000-4000-8000-000000000001')<>2 then raise exception 'Multi-branch staff cannot read both assigned branches'; end if;
  if exists(select 1 from public.orders where business_id='b0000000-0000-4000-8000-000000000001') then raise exception 'Multi-branch staff crossed restaurants'; end if;
end $$;

select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from public.orders where business_id='a0000000-0000-4000-8000-000000000001')<>2 then raise exception 'Owner cannot read own business branches'; end if;
  if exists(select 1 from public.orders where business_id='b0000000-0000-4000-8000-000000000001') then raise exception 'Owner crossed restaurant boundary'; end if;
end $$;

reset role;
select 'PASS: domain tenant resolution, restaurant isolation, assigned-branch RLS, multi-branch access, branch overrides, tax, variants and durable checkout idempotency' as result;
rollback;
