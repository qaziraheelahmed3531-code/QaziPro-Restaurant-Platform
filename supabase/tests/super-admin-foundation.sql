-- QaziPro Super Admin RBAC, provisioning, lifecycle and tenant separation regression.
-- Run only against an isolated database with all migrations applied. Every fixture rolls back.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,email_confirmed_at) values
  ('91000000-0000-4000-8000-000000000001','platform-owner@qa.example',now()),
  ('91000000-0000-4000-8000-000000000002','support@qa.example',now()),
  ('91000000-0000-4000-8000-000000000003','restaurant-admin@qa.example',now());

insert into public.platform_staff(user_id,display_name,email,status) values
  ('91000000-0000-4000-8000-000000000001','QA Platform Owner','platform-owner@qa.example','ACTIVE'),
  ('91000000-0000-4000-8000-000000000002','QA Support','support@qa.example','ACTIVE');
insert into public.platform_staff_roles(staff_user_id,role_id)
select '91000000-0000-4000-8000-000000000001',id from public.platform_roles where key='PLATFORM_OWNER';
insert into public.platform_staff_roles(staff_user_id,role_id)
select '91000000-0000-4000-8000-000000000002',id from public.platform_roles where key='SUPPORT_ENGINEER';

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);

do $$
declare package_id uuid; restaurant_a uuid; restaurant_a_retry uuid; restaurant_b uuid; new_branch uuid; denied boolean:=false;
begin
  package_id:=public.platform_create_service_package(jsonb_build_object(
    'code','QA_GROWTH','name','QA Growth','currency','PKR','baseFee',10000,'setupFee',5000,
    'includedBranches',2,'billingFrequency','MONTHLY','capabilities',jsonb_build_array('admin.restaurant','pos.web','website.ordering'),'reason','QA package'
  ));
  restaurant_a:=public.platform_provision_restaurant('91000000-0000-4000-8000-000000000101',jsonb_build_object(
    'name','QA Restaurant A','slug','qa-super-a','ownerName','Owner A','ownerEmail','owner-a@qa.example','city','Islamabad','countryCode','PK','currency','PKR','timezone','Asia/Karachi',
    'packageId',package_id::text,'baseFee',10000,'setupFee',5000,'billingFrequency','MONTHLY',
    'services',jsonb_build_array('admin.restaurant','pos.web','website.ordering','mobile.android'),
    'branches',jsonb_build_array(jsonb_build_object('name','A One','code','A1','city','Islamabad','pickupEnabled',true,'deliveryEnabled',true),jsonb_build_object('name','A Two','code','A2','city','Rawalpindi','pickupEnabled',true,'deliveryEnabled',false)),
    'customerDomain','a.qa.platform.example','androidEnabled',true,'androidName','QA A','androidId','com.qazipro.qa.a','iosEnabled',false,'reason','QA A provisioning'
  ));
  restaurant_a_retry:=public.platform_provision_restaurant('91000000-0000-4000-8000-000000000101',jsonb_build_object(
    'name','Changed request ignored','slug','changed-request','ownerName','Owner A','ownerEmail','owner-a@qa.example','branches','[]'::jsonb
  ));
  if restaurant_a<>restaurant_a_retry or (select count(*) from public.businesses where slug='qa-super-a')<>1 then raise exception 'Idempotent restaurant retry failed'; end if;
  if (select count(*) from public.branches where business_id=restaurant_a)<>2 then raise exception 'Restaurant A branches were not provisioned'; end if;
  if not exists(select 1 from public.service_entitlements where business_id=restaurant_a and capability_key='mobile.android' and enabled) then raise exception 'Restaurant A entitlement missing'; end if;
  if not exists(select 1 from public.mobile_app_records where business_id=restaurant_a and platform='ANDROID' and enabled and application_identifier='com.qazipro.qa.a') then raise exception 'Restaurant A app registry missing'; end if;

  restaurant_b:=public.platform_provision_restaurant('91000000-0000-4000-8000-000000000102',jsonb_build_object(
    'name','QA Restaurant B','slug','qa-super-b','ownerName','Owner B','ownerEmail','owner-b@qa.example','city','Lahore','countryCode','PK','currency','PKR','timezone','Asia/Karachi',
    'packageId',package_id::text,'services',jsonb_build_array('admin.restaurant','pos.desktop'),
    'branches',jsonb_build_array(jsonb_build_object('name','B One','code','B1','city','Lahore','pickupEnabled',true,'deliveryEnabled',true)),
    'androidEnabled',false,'iosEnabled',false,'reason','QA B provisioning'
  ));
  if exists(select 1 from public.service_entitlements where business_id=restaurant_b and capability_key='mobile.android') then raise exception 'Restaurant B inherited Restaurant A entitlement'; end if;
  if exists(select 1 from public.branches where business_id=restaurant_b and code like 'A%') then raise exception 'Restaurant B inherited Restaurant A branch'; end if;

  new_branch:=public.platform_add_branch(restaurant_a,jsonb_build_object('name','A Three','code','A3','city','Islamabad','countryCode','PK','timezone','Asia/Karachi','pickupEnabled',true,'deliveryEnabled',true,'reason','QA expansion'));
  if not exists(select 1 from public.branches where id=new_branch and business_id=restaurant_a) then raise exception 'Branch creation failed'; end if;

  perform public.platform_transition_restaurant(restaurant_a,'STAGING','QA configuration complete');
  begin perform public.platform_transition_restaurant(restaurant_a,'ACTIVE','Illegal skip'); exception when invalid_parameter_value then denied:=true; end;
  if not denied then raise exception 'Illegal restaurant lifecycle transition was accepted'; end if;
  perform public.platform_transition_restaurant(restaurant_a,'CLIENT_REVIEW','QA staging verified');
  perform public.platform_transition_restaurant(restaurant_a,'READY','Client accepted QA');
  perform public.platform_transition_restaurant(restaurant_a,'ACTIVE','Activation approved');
  if not exists(select 1 from public.businesses where id=restaurant_a and is_active) then raise exception 'Activation did not enable the restaurant'; end if;

  if (select count(*) from public.platform_audit_logs where business_id in (restaurant_a,restaurant_b))<7 then raise exception 'Sensitive platform actions were not audited'; end if;
end $$;

-- A support engineer can inspect but cannot provision, mutate packages or branches.
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false; package_id uuid;
begin
  if not public.has_platform_permission('support.access') or public.has_platform_permission('restaurants.create') then raise exception 'Support least-privilege role is incorrect'; end if;
  if (select count(*) from public.businesses where slug in ('qa-super-a','qa-super-b'))<>2 then raise exception 'Support directory visibility failed'; end if;
  select id into package_id from public.service_packages where code='QA_GROWTH';
  begin perform public.platform_add_branch((select id from public.businesses where slug='qa-super-b'),jsonb_build_object('name','Forged','code','X')); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Support engineer created a branch without permission'; end if;
end $$;

-- A restaurant admin identity is not a platform identity and receives no platform access.
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$ declare denied boolean:=false;
begin
  if public.has_platform_permission('restaurants.view') then raise exception 'Restaurant user gained platform permission'; end if;
  if exists(select 1 from public.platform_staff) then raise exception 'Restaurant user read platform staff'; end if;
  if exists(select 1 from public.service_packages) then raise exception 'Restaurant user read platform commercial data'; end if;
  begin perform public.platform_today_order_metrics(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Restaurant user read platform-wide metrics'; end if;
  denied:=false;
  begin perform public.platform_create_service_package(jsonb_build_object('code','FORGED','name','Forged')); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Restaurant user invoked privileged platform RPC'; end if;
end $$;

reset role;
select 'PASS: platform RBAC, idempotent onboarding, branch creation, entitlements, app/domain records, lifecycle, audit and restaurant/platform separation' as result;
rollback;
