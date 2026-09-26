\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,email_confirmed_at) values
  ('dd000000-0000-4000-8000-000000000001','domain-owner@qa.example',now());
insert into public.platform_staff(user_id,display_name,email) values
  ('dd000000-0000-4000-8000-000000000001','Domain QA','domain-owner@qa.example');

insert into public.businesses(id,slug,name,city,is_active) values
  ('d1000000-0000-4000-8000-000000000001','domain-active','Domain Active','Islamabad',true),
  ('d2000000-0000-4000-8000-000000000001','domain-inactive','Domain Inactive','Islamabad',false),
  ('d3000000-0000-4000-8000-000000000001','domain-disabled','Domain Disabled','Islamabad',true),
  ('d4000000-0000-4000-8000-000000000001','domain-config','Domain Configuration','Islamabad',true);

insert into public.service_entitlements(business_id,capability_key,enabled,source) values
  ('d1000000-0000-4000-8000-000000000001','website.ordering',true,'OVERRIDE'),
  ('d2000000-0000-4000-8000-000000000001','website.ordering',true,'OVERRIDE'),
  ('d3000000-0000-4000-8000-000000000001','website.ordering',false,'OVERRIDE'),
  ('d4000000-0000-4000-8000-000000000001','website.ordering',true,'OVERRIDE');

insert into public.restaurant_onboarding(request_key,business_id,lifecycle,owner_name,owner_email,created_by) values
  ('d4000000-0000-4000-8000-000000000099','d4000000-0000-4000-8000-000000000001','CONFIGURATION','Configuration Owner','configuration@qa.example','dd000000-0000-4000-8000-000000000001');

insert into public.platform_domain_records(business_id,hostname,purpose) values
  ('d1000000-0000-4000-8000-000000000001','DOMAIN-ACTIVE.STAGING.QAZIPRO.COM:443','CUSTOMER'),
  ('d2000000-0000-4000-8000-000000000001','domain-inactive.staging.qazipro.com','CUSTOMER'),
  ('d3000000-0000-4000-8000-000000000001','domain-disabled.staging.qazipro.com','CUSTOMER'),
  ('d4000000-0000-4000-8000-000000000001','domain-config.staging.qazipro.com','CUSTOMER');

do $$
declare resolution record; duplicate_rejected boolean:=false;
begin
  if public.normalize_storefront_hostname('HTTPS://Kings-Cafe.Staging.QaziPro.com:443/path')<>'kings-cafe.staging.qazipro.com' then
    raise exception 'Hostname normalization failed';
  end if;
  if not exists(
    select 1 from public.platform_domain_records
    where business_id='d1000000-0000-4000-8000-000000000001'
      and hostname='domain-active.staging.qazipro.com'
      and verification_status='VERIFIED' and dns_status='HEALTHY' and ssl_status='HEALTHY'
  ) then raise exception 'Managed staging domain was not verified from wildcard infrastructure'; end if;

  select * into resolution from public.resolve_storefront_business('DOMAIN-ACTIVE.STAGING.QAZIPRO.COM:443',null,null);
  if resolution.resolved_business_id<>'d1000000-0000-4000-8000-000000000001' then raise exception 'Active canonical domain did not resolve'; end if;

  resolution:=null;
  select * into resolution from public.resolve_storefront_business('unregistered.staging.qazipro.com','staging.qazipro.com',null);
  if resolution.resolved_business_id is not null then raise exception 'Unknown wildcard hostname did not fail closed'; end if;

  resolution:=null;
  select * into resolution from public.resolve_storefront_business('domain-inactive.staging.qazipro.com',null,null);
  if resolution.resolved_business_id is not null then raise exception 'Inactive restaurant resolved'; end if;

  resolution:=null;
  select * into resolution from public.resolve_storefront_business('domain-disabled.staging.qazipro.com',null,null);
  if resolution.resolved_business_id is not null then raise exception 'Disabled website entitlement resolved'; end if;

  resolution:=null;
  select * into resolution from public.resolve_storefront_business('domain-config.staging.qazipro.com',null,null);
  if resolution.resolved_business_id is not null then raise exception 'CONFIGURATION lifecycle resolved publicly'; end if;

  begin
    insert into public.platform_domain_records(business_id,hostname,purpose)
    values('d2000000-0000-4000-8000-000000000001','domain-active.staging.qazipro.com:443','CUSTOMER');
  exception when unique_violation then duplicate_rejected:=true; end;
  if not duplicate_rejected then raise exception 'Duplicate canonical hostname was accepted'; end if;

  if exists(
    select 1 from public.business_domains
    where hostname='domain-active.staging.qazipro.com'
      and business_id<>'d1000000-0000-4000-8000-000000000001'
  ) then raise exception 'Tenant mapping leaked across businesses'; end if;
end $$;

select 'PASS: hostname normalization, canonical mapping, unknown host, lifecycle, entitlement, duplicate rejection and tenant isolation' as result;
rollback;
